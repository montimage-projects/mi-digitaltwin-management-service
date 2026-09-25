/**
 * Per-execution observability stack (issue #25): when a scenario's
 * `observability` option is on (the default), every execution namespace gets
 * an OpenTelemetry Collector and a Prometheus next to the topology.
 *
 * - The collector probes every component that has a Service — an HTTP GET on
 *   its `readinessPath` when it declares one, a TCP connect otherwise — and
 *   receives OTLP from components that speak it (traces are turned into
 *   request/error/latency series by the spanmetrics connector).
 * - Prometheus scrapes the collector and every component whose catalog spec
 *   declares a `metricsPort`, through a `<name>-metrics` ClusterIP Service.
 *
 * Targets are rendered statically from the resolved topology, so the stack
 * needs no RBAC at all, and both pods run as non-root with no capabilities so
 * they fit the namespace's default PodSecurity level. The stack is kept out
 * of `deployedServices`, readiness gating, progress and outcomes: it is
 * best-effort and never fails a deploy.
 *
 * The server reads it back through the API server's service proxy
 * (`queryPrometheus`), like the proxied tool UIs.
 */
import http from 'node:http';
import https from 'node:https';
import type {
  KubeConfig,
  V1ConfigMap,
  V1Container,
  V1Deployment,
  V1Service,
  V1Volume,
} from '@kubernetes/client-node';
import { dump as yamlDump } from 'js-yaml';
import { logger } from '../utils/logger.js';

export const COLLECTOR_NAME = 'secsim-otel-collector';
export const PROMETHEUS_NAME = 'secsim-prometheus';
export const COLLECTOR_IMAGE = 'otel/opentelemetry-collector-contrib:0.161.0';
export const PROMETHEUS_IMAGE = 'prom/prometheus:v3.14.0';
export const PROMETHEUS_PORT = 9090;
const COLLECTOR_METRICS_PORT = 8889;
const COLLECTOR_HEALTH_PORT = 13133;
/** How often components are probed and Prometheus scrapes. */
const PROBE_INTERVAL = '10s';
/**
 * How long the collector keeps exporting a series that stopped updating. A
 * successful probe reports on a series labelled with its status code; when
 * the target dies that series is no longer updated but, with the exporter's
 * 5-minute default, would keep reading "up". Just over two probe intervals
 * turns a dead component "down" within ~35 s (expiry + one scrape).
 */
const SERIES_EXPIRATION = '25s';
const PART_OF = 'secsim-observability';
const MANAGED_BY = 'secsim';

/** The slice of a resolved topology node the stack needs. */
export interface ObservedNode {
  name: string;
  containerPort: number;
  deployment: {
    kind: 'Deployment' | 'Job';
    exposePort: boolean;
    readinessPath?: string;
    metricsPort?: number;
    metricsPath?: string;
  };
}

export type ProbeTarget =
  | { service: string; kind: 'http'; url: string }
  | { service: string; kind: 'tcp'; endpoint: string };

export interface ScrapeTarget {
  service: string;
  /** `<name>-metrics` Service fronting the metrics port. */
  metricsService: string;
  port: number;
  path: string;
}

/**
 * Probe targets: every node the engine gives a Service (exposed, not a Job).
 * Sidecars and unexposed workloads have no stable address to probe; their
 * status still comes from the pod list.
 */
export function probeTargets(nodes: ObservedNode[]): ProbeTarget[] {
  return nodes
    .filter((n) => n.deployment.exposePort && n.deployment.kind !== 'Job')
    .map((n) =>
      n.deployment.readinessPath
        ? {
            service: n.name,
            kind: 'http' as const,
            url: `http://${n.name}:${n.containerPort}${n.deployment.readinessPath}`,
          }
        : { service: n.name, kind: 'tcp' as const, endpoint: `${n.name}:${n.containerPort}` }
    );
}

/** Scrape targets: workload nodes (not Jobs) that declare a `metricsPort`. */
export function scrapeTargets(nodes: ObservedNode[]): ScrapeTarget[] {
  return nodes
    .filter((n) => n.deployment.metricsPort && n.deployment.kind !== 'Job')
    .map((n) => ({
      service: n.name,
      metricsService: `${n.name}-metrics`,
      port: n.deployment.metricsPort as number,
      path: n.deployment.metricsPath || '/metrics',
    }));
}

/** OpenTelemetry Collector configuration for one namespace. */
export function collectorConfig(probes: ProbeTarget[]): string {
  const httpTargets = probes.filter((p) => p.kind === 'http');
  const tcpTargets = probes.filter((p) => p.kind === 'tcp');
  const receivers: Record<string, unknown> = {
    otlp: {
      protocols: { grpc: { endpoint: '0.0.0.0:4317' }, http: { endpoint: '0.0.0.0:4318' } },
    },
  };
  const metricReceivers = ['otlp', 'spanmetrics'];
  if (httpTargets.length > 0) {
    receivers.httpcheck = {
      collection_interval: PROBE_INTERVAL,
      targets: httpTargets.map((t) => ({ endpoint: t.url, method: 'GET' })),
    };
    metricReceivers.push('httpcheck');
  }
  if (tcpTargets.length > 0) {
    receivers.tcpcheck = {
      collection_interval: PROBE_INTERVAL,
      targets: tcpTargets.map((t) => ({ endpoint: t.endpoint })),
    };
    metricReceivers.push('tcpcheck');
  }
  return yamlDump({
    receivers,
    processors: {
      memory_limiter: { check_interval: '5s', limit_percentage: 80, spike_limit_percentage: 20 },
      batch: {},
    },
    connectors: { spanmetrics: {} },
    exporters: {
      prometheus: {
        endpoint: `0.0.0.0:${COLLECTOR_METRICS_PORT}`,
        metric_expiration: SERIES_EXPIRATION,
        resource_to_telemetry_conversion: { enabled: true },
      },
    },
    extensions: { health_check: { endpoint: `0.0.0.0:${COLLECTOR_HEALTH_PORT}` } },
    service: {
      extensions: ['health_check'],
      pipelines: {
        traces: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'batch'],
          exporters: ['spanmetrics'],
        },
        metrics: {
          receivers: metricReceivers,
          processors: ['memory_limiter', 'batch'],
          exporters: ['prometheus'],
        },
      },
    },
  });
}

/** Prometheus configuration for one namespace. */
export function prometheusConfig(scrapes: ScrapeTarget[]): string {
  return yamlDump({
    global: { scrape_interval: PROBE_INTERVAL, evaluation_interval: PROBE_INTERVAL },
    scrape_configs: [
      {
        job_name: 'otel-collector',
        static_configs: [{ targets: [`${COLLECTOR_NAME}:${COLLECTOR_METRICS_PORT}`] }],
      },
      ...scrapes.map((s) => ({
        job_name: `service-${s.service}`,
        metrics_path: s.path,
        static_configs: [
          { targets: [`${s.metricsService}:${s.port}`], labels: { service: s.service } },
        ],
      })),
    ],
  });
}

const labels = (name: string) => ({
  'app.kubernetes.io/name': name,
  'app.kubernetes.io/part-of': PART_OF,
  'app.kubernetes.io/managed-by': MANAGED_BY,
});

const restrictedContainer = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ['ALL'] },
};

function stackDeployment(
  name: string,
  namespace: string,
  uid: number,
  container: V1Container,
  volumes: V1Volume[]
): V1Deployment {
  return {
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      replicas: 1,
      selector: { matchLabels: { 'app.kubernetes.io/name': name } },
      template: {
        metadata: { labels: labels(name) },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: uid,
            runAsGroup: uid,
            fsGroup: uid,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [{ ...container, securityContext: restrictedContainer }],
          volumes,
        },
      },
    },
  };
}

function clusterIpService(
  name: string,
  namespace: string,
  selector: Record<string, string>,
  ports: { name: string; port: number }[],
  extraLabels: Record<string, string> = {}
): V1Service {
  return {
    metadata: { name, namespace, labels: { ...labels(name), ...extraLabels } },
    spec: {
      type: 'ClusterIP',
      selector,
      ports: ports.map((p) => ({
        name: p.name,
        port: p.port,
        targetPort: p.port,
        protocol: 'TCP',
      })),
    },
  };
}

export interface ObservabilityManifests {
  configMaps: V1ConfigMap[];
  deployments: V1Deployment[];
  services: V1Service[];
}

/** Every resource of one namespace's observability stack. */
export function observabilityManifests(
  namespace: string,
  nodes: ObservedNode[]
): ObservabilityManifests {
  const probes = probeTargets(nodes);
  const scrapes = scrapeTargets(nodes);

  const collector = stackDeployment(
    COLLECTOR_NAME,
    namespace,
    10001,
    {
      name: 'otel-collector',
      image: COLLECTOR_IMAGE,
      imagePullPolicy: 'IfNotPresent',
      args: ['--config=/etc/otelcol/config.yaml'],
      ports: [
        { name: 'otlp-grpc', containerPort: 4317 },
        { name: 'otlp-http', containerPort: 4318 },
        { name: 'metrics', containerPort: COLLECTOR_METRICS_PORT },
        { name: 'health', containerPort: COLLECTOR_HEALTH_PORT },
      ],
      readinessProbe: { httpGet: { path: '/', port: COLLECTOR_HEALTH_PORT } },
      resources: {
        requests: { cpu: '20m', memory: '48Mi' },
        limits: { cpu: '200m', memory: '192Mi' },
      },
      volumeMounts: [{ name: 'config', mountPath: '/etc/otelcol', readOnly: true }],
    },
    [{ name: 'config', configMap: { name: COLLECTOR_NAME } }]
  );

  const prometheus = stackDeployment(
    PROMETHEUS_NAME,
    namespace,
    65534,
    {
      name: 'prometheus',
      image: PROMETHEUS_IMAGE,
      imagePullPolicy: 'IfNotPresent',
      args: [
        '--config.file=/etc/prometheus/prometheus.yml',
        '--storage.tsdb.path=/prometheus',
        '--storage.tsdb.retention.time=1d',
      ],
      ports: [{ name: 'web', containerPort: PROMETHEUS_PORT }],
      readinessProbe: { httpGet: { path: '/-/ready', port: PROMETHEUS_PORT } },
      resources: {
        requests: { cpu: '30m', memory: '96Mi' },
        limits: { cpu: '300m', memory: '384Mi' },
      },
      volumeMounts: [
        { name: 'config', mountPath: '/etc/prometheus', readOnly: true },
        { name: 'data', mountPath: '/prometheus' },
      ],
    },
    [
      { name: 'config', configMap: { name: PROMETHEUS_NAME } },
      { name: 'data', emptyDir: { sizeLimit: '512Mi' } },
    ]
  );

  return {
    configMaps: [
      {
        metadata: { name: COLLECTOR_NAME, namespace, labels: labels(COLLECTOR_NAME) },
        data: { 'config.yaml': collectorConfig(probes) },
      },
      {
        metadata: { name: PROMETHEUS_NAME, namespace, labels: labels(PROMETHEUS_NAME) },
        data: { 'prometheus.yml': prometheusConfig(scrapes) },
      },
    ],
    deployments: [collector, prometheus],
    services: [
      clusterIpService(COLLECTOR_NAME, namespace, { 'app.kubernetes.io/name': COLLECTOR_NAME }, [
        { name: 'otlp-grpc', port: 4317 },
        { name: 'otlp-http', port: 4318 },
        { name: 'metrics', port: COLLECTOR_METRICS_PORT },
      ]),
      clusterIpService(PROMETHEUS_NAME, namespace, { 'app.kubernetes.io/name': PROMETHEUS_NAME }, [
        { name: 'web', port: PROMETHEUS_PORT },
      ]),
      ...scrapes.map((s) =>
        clusterIpService(s.metricsService, namespace, { app: s.service }, [
          { name: 'metrics', port: s.port },
        ])
      ),
    ],
  };
}

/** The Kubernetes API calls the stack needs (a subset of `K8sClients`). */
export interface ObservabilityClients {
  core: {
    createNamespacedConfigMap(args: { namespace: string; body: V1ConfigMap }): Promise<unknown>;
    createNamespacedService(args: { namespace: string; body: V1Service }): Promise<unknown>;
  };
  apps: {
    createNamespacedDeployment(args: { namespace: string; body: V1Deployment }): Promise<unknown>;
  };
}

/**
 * Create the stack in `namespace`. Best-effort: a failure is logged and
 * reported as `false`, never thrown, so an unreachable image registry or a
 * quota never fails the scenario itself.
 */
export async function deployObservabilityStack(
  clients: ObservabilityClients,
  namespace: string,
  nodes: ObservedNode[]
): Promise<boolean> {
  const manifests = observabilityManifests(namespace, nodes);
  try {
    await Promise.all(
      manifests.configMaps.map((body) =>
        clients.core.createNamespacedConfigMap({ namespace, body })
      )
    );
    await Promise.all([
      ...manifests.deployments.map((body) =>
        clients.apps.createNamespacedDeployment({ namespace, body })
      ),
      ...manifests.services.map((body) =>
        clients.core.createNamespacedService({ namespace, body })
      ),
    ]);
    return true;
  } catch (err) {
    logger.warn('Observability stack could not be deployed; the scenario runs without it', {
      namespace,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reading the stack back
// ---------------------------------------------------------------------------

/** One Prometheus instant-vector sample. */
export interface PromSample {
  metric: Record<string, string>;
  value: number;
}

/** Performs one GET against the API server and resolves with the body. */
export type ApiGet = (path: string, timeoutMs: number) => Promise<{ status: number; body: string }>;

/** `ApiGet` over the kubeconfig's cluster, credentials and CA. */
export function apiGetFor(kc: KubeConfig): ApiGet {
  return async (path, timeoutMs) => {
    const cluster = kc.getCurrentCluster();
    if (!cluster) throw new Error('No cluster in kubeconfig');
    const base = new URL(cluster.server);
    const options: https.RequestOptions = {
      method: 'GET',
      hostname: base.hostname,
      port: base.port || (base.protocol === 'https:' ? 443 : 80),
      path: `${base.pathname.replace(/\/$/, '')}${path}`,
      headers: { accept: 'application/json' },
      timeout: timeoutMs,
    };
    await kc.applyToHTTPSOptions(options);
    const transport = base.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
        );
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('Prometheus query timed out')));
      req.on('error', reject);
      req.end();
    });
  };
}

/**
 * Run a PromQL instant query against the namespace's Prometheus through the
 * API server's service proxy (needs `get` on `services/proxy`).
 */
export async function queryPrometheus(
  get: ApiGet,
  namespace: string,
  query: string,
  timeoutMs: number
): Promise<PromSample[]> {
  const path =
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/services/` +
    `${PROMETHEUS_NAME}:${PROMETHEUS_PORT}/proxy/api/v1/query?query=${encodeURIComponent(query)}`;
  const { status, body } = await get(path, timeoutMs);
  if (status !== 200) throw new ObservabilityError(status);
  const parsed = JSON.parse(body) as {
    status?: string;
    data?: {
      resultType?: string;
      result?: { metric?: Record<string, string>; value?: unknown[] }[];
    };
  };
  if (parsed.status !== 'success' || parsed.data?.resultType !== 'vector') {
    throw new ObservabilityError(status);
  }
  return (parsed.data.result ?? [])
    .map((r) => ({ metric: r.metric ?? {}, value: Number(r.value?.[1]) }))
    .filter((s) => Number.isFinite(s.value));
}

/** A non-200 / unexpected answer from the proxied Prometheus. */
export class ObservabilityError extends Error {
  constructor(readonly status: number) {
    super(`Prometheus query failed (HTTP ${status})`);
  }
}

/** Fixed, credential-free reason for a failed stack read (never echoes the cluster's text). */
export function classifyObservabilityError(err: unknown): string {
  const status = err instanceof ObservabilityError ? err.status : undefined;
  if (status === 401 || status === 403) {
    return 'the infrastructure credentials cannot proxy to the observability stack (needs services/proxy)';
  }
  if (status === 404 || status === 502 || status === 503) {
    return 'the observability stack is not running in this namespace yet';
  }
  if (err instanceof Error && /timed out/i.test(err.message)) {
    return 'the observability stack did not answer in time';
  }
  return 'the observability stack could not be queried';
}

/** Per-component traffic and health derived from the stack. */
export interface ServiceTraffic {
  /** Probe kind used for this component, when it has a Service. */
  probe?: 'http' | 'tcp';
  /** Last probe succeeded (HTTP 2xx/3xx, or TCP connect). */
  up?: boolean;
  /** Share of successful probes over the window, 0–1. */
  availability?: number;
  /** Mean probe round-trip over the window, ms. */
  probeLatencyMs?: number;
  /** Real traffic from the component's own `/metrics`, when it exposes them. */
  requestRate?: number;
  /** Share of 5xx responses in real traffic, 0–1. */
  errorRate?: number;
  /** p95 latency of real traffic, ms. */
  latencyP95Ms?: number;
}

const SPAN_CALLS = 'traces_span_metrics_calls_total';
const SPAN_DURATION = 'traces_span_metrics_duration_milliseconds_bucket';
const SPAN_SERVER = 'span_kind="SPAN_KIND_SERVER"';

/** Service name encoded in a probe series' `http_url` / `tcpcheck_endpoint`. */
function probeService(metric: Record<string, string>): string | undefined {
  const target = metric.http_url ?? metric.tcpcheck_endpoint;
  if (!target) return undefined;
  const hostPort = target.replace(/^https?:\/\//, '').split('/')[0];
  return hostPort.split(':')[0] || undefined;
}

/**
 * PromQL for the dashboard/report window.
 *
 * HTTP probe success: exactly one `httpcheck_status` class series is 1 on a
 * response (labelled with its status code), all are 0 on a failed request —
 * but the collector keeps exporting the last 200-labelled series until it
 * expires. A failing probe also emits `httpcheck_error` at once, so any
 * error series overrides the 2xx/3xx sum to 0: an outage reads "down" within
 * a probe and a scrape, and recovery reads "up" once the error series
 * expires (~35 s).
 */
export function trafficQueries(
  window: string
): Record<keyof Omit<ServiceTraffic, 'probe'>, string[]> {
  const httpError = 'max by (http_url) (httpcheck_error)';
  const httpOk =
    `(sum by (http_url) (httpcheck_status{http_status_class=~"2xx|3xx"}) unless on (http_url) ${httpError})` +
    ` or on (http_url) (0 * ${httpError})`;
  return {
    up: [httpOk, 'tcpcheck_status_ratio'],
    availability: [
      `avg_over_time((${httpOk})[${window}:])`,
      `avg_over_time(tcpcheck_status_ratio[${window}])`,
    ],
    probeLatencyMs: [
      `avg_over_time(httpcheck_duration_milliseconds[${window}])`,
      `avg_over_time(tcpcheck_duration_milliseconds[${window}])`,
    ],
    // Scraped `/metrics` (Prometheus client conventions), then spans pushed
    // over OTLP and turned into series by the collector's spanmetrics.
    requestRate: [
      `sum by (service) (rate(http_requests_total[${window}]))`,
      `sum by (service_name) (rate(${SPAN_CALLS}{${SPAN_SERVER}}[${window}]))`,
    ],
    // Zero-filled from the denominator: 5xx / error series only exist after
    // the first error, and a healthy component must read 0 %, not "no data".
    errorRate: [
      `(sum by (service) (rate(http_requests_total{status_code=~"5.."}[${window}]) or rate(http_requests_total{code=~"5.."}[${window}])) or 0 * sum by (service) (rate(http_requests_total[${window}]))) / sum by (service) (rate(http_requests_total[${window}]))`,
      `(sum by (service_name) (rate(${SPAN_CALLS}{${SPAN_SERVER},status_code="STATUS_CODE_ERROR"}[${window}])) or 0 * sum by (service_name) (rate(${SPAN_CALLS}{${SPAN_SERVER}}[${window}]))) / sum by (service_name) (rate(${SPAN_CALLS}{${SPAN_SERVER}}[${window}]))`,
    ],
    latencyP95Ms: [
      `histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket[${window}]))) * 1000`,
      `histogram_quantile(0.95, sum by (service_name, le) (rate(${SPAN_DURATION}{${SPAN_SERVER}}[${window}])))`,
    ],
  };
}

/**
 * Collect per-component traffic for one namespace. Every query runs in
 * parallel; a failed query leaves its field unset, and the call only throws
 * when none answered (the stack is unreachable).
 */
export async function collectTraffic(
  get: ApiGet,
  namespace: string,
  opts: { window?: string; timeoutMs?: number } = {}
): Promise<Map<string, ServiceTraffic>> {
  const window = opts.window ?? '5m';
  const timeoutMs = opts.timeoutMs ?? 5000;
  const out = new Map<string, ServiceTraffic>();

  const queries = trafficQueries(window);
  const jobs = (Object.keys(queries) as (keyof typeof queries)[]).flatMap((field) =>
    queries[field].map((q) => ({ field, promise: queryPrometheus(get, namespace, q, timeoutMs) }))
  );
  const settled = await Promise.allSettled(jobs.map((j) => j.promise));
  if (settled.every((s) => s.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }

  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const { field } = jobs[i];
    for (const sample of result.value) {
      const service =
        sample.metric.service ?? sample.metric.service_name ?? probeService(sample.metric);
      if (!service) continue;
      const entry = out.get(service) ?? {};
      if (sample.metric.http_url) entry.probe = 'http';
      else if (sample.metric.tcpcheck_endpoint) entry.probe = 'tcp';
      if (field === 'up') entry.up = sample.value >= 1;
      else entry[field] = sample.value;
      out.set(service, entry);
    }
  });
  return out;
}
