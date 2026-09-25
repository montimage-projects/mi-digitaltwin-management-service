import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { load as yamlLoad } from 'js-yaml';
import {
  COLLECTOR_IMAGE,
  PROMETHEUS_IMAGE,
  ObservabilityError,
  classifyObservabilityError,
  collectTraffic,
  collectorConfig,
  deployObservabilityStack,
  observabilityManifests,
  probeTargets,
  prometheusConfig,
  queryPrometheus,
  scrapeTargets,
  type ApiGet,
  type ObservedNode,
} from '../observability.js';

const node = (
  name: string,
  deployment: Partial<ObservedNode['deployment']>,
  containerPort = 8080
): ObservedNode => ({
  name,
  containerPort,
  deployment: { kind: 'Deployment', exposePort: true, ...deployment },
});

const NODES: ObservedNode[] = [
  node('ci-sim', { readinessPath: '/' }),
  node('kafka', {}, 9092),
  node('ai4soar', { readinessPath: '/health', metricsPort: 9100 }, 5000),
  node('mag', { kind: 'Job', exposePort: false }),
  node('idle', { exposePort: false, metricsPort: 9200, metricsPath: '/stats' }),
];

describe('targets', () => {
  test('probes HTTP components on their readiness path and the rest over TCP', () => {
    expect(probeTargets(NODES)).toEqual([
      { service: 'ci-sim', kind: 'http', url: 'http://ci-sim:8080/' },
      { service: 'kafka', kind: 'tcp', endpoint: 'kafka:9092' },
      { service: 'ai4soar', kind: 'http', url: 'http://ai4soar:5000/health' },
    ]);
  });

  test('scrapes workloads that declare a metrics port, never Jobs', () => {
    expect(scrapeTargets(NODES)).toEqual([
      { service: 'ai4soar', metricsService: 'ai4soar-metrics', port: 9100, path: '/metrics' },
      { service: 'idle', metricsService: 'idle-metrics', port: 9200, path: '/stats' },
    ]);
  });
});

describe('configs', () => {
  test('the collector only enables the probe receivers it has targets for', () => {
    const tcpOnly = yamlLoad(collectorConfig([{ service: 'k', kind: 'tcp', endpoint: 'k:1' }])) as {
      receivers: Record<string, unknown>;
      service: { pipelines: { metrics: { receivers: string[] } } };
    };
    expect(Object.keys(tcpOnly.receivers).sort()).toEqual(['otlp', 'tcpcheck']);
    expect(tcpOnly.service.pipelines.metrics.receivers).toEqual([
      'otlp',
      'spanmetrics',
      'tcpcheck',
    ]);
  });

  test('expires stale probe series quickly so a dead component reads down', () => {
    const config = yamlLoad(collectorConfig([])) as {
      exporters: { prometheus: { metric_expiration: string } };
    };
    // A 200-labelled series from the last good probe must not outlive the target.
    expect(config.exporters.prometheus.metric_expiration).toBe('25s');
  });

  test('Prometheus scrapes the collector and labels each service target', () => {
    const config = yamlLoad(prometheusConfig(scrapeTargets(NODES))) as {
      scrape_configs: { job_name: string; metrics_path?: string; static_configs: unknown[] }[];
    };
    expect(config.scrape_configs.map((c) => c.job_name)).toEqual([
      'otel-collector',
      'service-ai4soar',
      'service-idle',
    ]);
    expect(config.scrape_configs[2]).toMatchObject({
      metrics_path: '/stats',
      static_configs: [{ targets: ['idle-metrics:9200'], labels: { service: 'idle' } }],
    });
  });
});

describe('observabilityManifests', () => {
  const manifests = observabilityManifests('secsim-a-b', NODES);

  test('stack pods fit the restricted PodSecurity level and need no API access', () => {
    for (const d of manifests.deployments) {
      const pod = d.spec!.template.spec!;
      expect(pod.securityContext).toMatchObject({ runAsNonRoot: true });
      expect(pod.automountServiceAccountToken).toBe(false);
      expect(pod.serviceAccountName).toBeUndefined();
      for (const c of pod.containers) {
        expect(c.securityContext).toMatchObject({
          allowPrivilegeEscalation: false,
          capabilities: { drop: ['ALL'] },
        });
        expect(c.image).not.toMatch(/:latest$/);
      }
    }
  });

  test('stack pods carry no `app` label, so they never pass for topology services', () => {
    for (const d of manifests.deployments) {
      expect(d.spec!.template.metadata!.labels).not.toHaveProperty('app');
    }
  });

  test('adds a ClusterIP metrics Service per scraped workload', () => {
    const metrics = manifests.services.filter((s) => s.metadata!.name!.endsWith('-metrics'));
    expect(metrics.map((s) => [s.metadata!.name, s.spec!.type, s.spec!.selector])).toEqual([
      ['ai4soar-metrics', 'ClusterIP', { app: 'ai4soar' }],
      ['idle-metrics', 'ClusterIP', { app: 'idle' }],
    ]);
  });
});

describe('deployObservabilityStack', () => {
  const clients = () => ({
    core: {
      createNamespacedConfigMap: vi.fn(async () => ({})),
      createNamespacedService: vi.fn(async () => ({})),
    },
    apps: { createNamespacedDeployment: vi.fn(async () => ({})) },
  });

  test('creates config maps before the workloads that mount them', async () => {
    const order: string[] = [];
    const c = clients();
    c.core.createNamespacedConfigMap.mockImplementation(async () => {
      order.push('cm');
      return {};
    });
    c.apps.createNamespacedDeployment.mockImplementation(async () => {
      order.push('deploy');
      return {};
    });
    expect(await deployObservabilityStack(c, 'ns', NODES)).toBe(true);
    expect(order.lastIndexOf('cm')).toBeLessThan(order.indexOf('deploy'));
  });

  test('reports failure instead of throwing', async () => {
    const c = clients();
    c.apps.createNamespacedDeployment.mockRejectedValueOnce(new Error('ImagePull quota'));
    await expect(deployObservabilityStack(c, 'ns', NODES)).resolves.toBe(false);
  });
});

const vector = (result: { metric: Record<string, string>; value: number | string }[]) =>
  JSON.stringify({
    status: 'success',
    data: {
      resultType: 'vector',
      result: result.map((r) => ({ metric: r.metric, value: [1, String(r.value)] })),
    },
  });

describe('queryPrometheus', () => {
  test('goes through the service proxy with an encoded query', async () => {
    const get = vi.fn<ApiGet>(async () => ({ status: 200, body: vector([]) }));
    await queryPrometheus(get, 'secsim-a-b', 'up{job="x"}', 1000);
    expect(get.mock.calls[0][0]).toBe(
      '/api/v1/namespaces/secsim-a-b/services/secsim-prometheus:9090/proxy/api/v1/query?query=up%7Bjob%3D%22x%22%7D'
    );
  });

  test('drops NaN samples and maps HTTP failures to fixed reasons', async () => {
    const ok = vi.fn<ApiGet>(async () => ({
      status: 200,
      body: vector([
        { metric: { a: '1' }, value: 2 },
        { metric: { a: '2' }, value: 'NaN' },
      ]),
    }));
    expect(await queryPrometheus(ok, 'ns', 'q', 1000)).toEqual([{ metric: { a: '1' }, value: 2 }]);

    const denied = vi.fn<ApiGet>(async () => ({ status: 403, body: 'forbidden: secret detail' }));
    const err = await queryPrometheus(denied, 'ns', 'q', 1000).catch((e) => e);
    expect(err).toBeInstanceOf(ObservabilityError);
    expect(classifyObservabilityError(err)).toMatch(/services\/proxy/);
    expect(classifyObservabilityError(new ObservabilityError(503))).toMatch(/not running/);
    expect(classifyObservabilityError(new Error('Prometheus query timed out'))).toMatch(/in time/);
  });
});

describe('collectTraffic', () => {
  const answers: [RegExp, { metric: Record<string, string>; value: number }[]][] = [
    [
      /^\(sum by \(http_url\)/,
      [
        { metric: { http_url: 'http://ci-sim:8080/' }, value: 1 },
        { metric: { http_url: 'http://ai4soar:5000/health' }, value: 0 },
      ],
    ],
    [/^tcpcheck_status_ratio$/, [{ metric: { tcpcheck_endpoint: 'kafka:9092' }, value: 1 }]],
    [/^avg_over_time\(\(\(sum/, [{ metric: { http_url: 'http://ci-sim:8080/' }, value: 0.75 }]],
    [
      /^avg_over_time\(httpcheck_duration/,
      [{ metric: { http_url: 'http://ci-sim:8080/' }, value: 12 }],
    ],
    [
      /^sum by \(service\) \(rate\(http_requests_total\[/,
      [{ metric: { service: 'ai4soar' }, value: 4 }],
    ],
    [
      /^sum by \(service_name\) \(rate\(traces[^/]*$/,
      [{ metric: { service_name: 'kafka' }, value: 2 }],
    ],
  ];
  const get: ApiGet = async (path) => {
    const query = decodeURIComponent(path.split('query=')[1]);
    const hit = answers.find(([re]) => re.test(query));
    return { status: 200, body: vector(hit ? hit[1] : []) };
  };

  test('maps probe, scraped and span series back to each component', async () => {
    const traffic = await collectTraffic(get, 'ns');
    expect(traffic.get('ci-sim')).toEqual({
      probe: 'http',
      up: true,
      availability: 0.75,
      probeLatencyMs: 12,
    });
    expect(traffic.get('ai4soar')).toEqual({ probe: 'http', up: false, requestRate: 4 });
    expect(traffic.get('kafka')).toEqual({ probe: 'tcp', up: true, requestRate: 2 });
  });

  test('throws only when the stack answered no query at all', async () => {
    const down: ApiGet = async () => ({ status: 503, body: '' });
    await expect(collectTraffic(down, 'ns')).rejects.toBeInstanceOf(ObservabilityError);

    let n = 0;
    const flaky: ApiGet = async (path) => (n++ === 0 ? get(path, 0) : { status: 503, body: '' });
    await expect(collectTraffic(flaky, 'ns')).resolves.toBeInstanceOf(Map);
  });
});

describe('kind E2E image pre-load', () => {
  test('pre-loads exactly the pinned stack images', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
    const workflow = readFileSync(resolve(repoRoot, '.github/workflows/e2e-kind.yml'), 'utf8');
    expect(workflow).toContain(`OTEL_COLLECTOR_IMAGE: '${COLLECTOR_IMAGE}'`);
    expect(workflow).toContain(`PROMETHEUS_IMAGE: '${PROMETHEUS_IMAGE}'`);
  });
});
