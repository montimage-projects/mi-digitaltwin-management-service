import { describe, test, expect } from 'vitest';
import mongoose from 'mongoose';
import { ApiException, type PodMetric } from '@kubernetes/client-node';
import {
  parseCpuQuantity,
  parseMemoryQuantity,
  mapPodMetricsToServices,
  evaluateAlertRules,
  classifyMetricsError,
  type AlertSample,
  type AlertRuleLike,
} from '../monitoring.js';

/**
 * Unit tests for the service monitoring helpers (issue #25): Kubernetes
 * quantity parsing, pod-metrics to deployed-service mapping, alert-rule
 * evaluation and the metrics error classification. No MongoDB, no cluster.
 */

function pod(
  name: string,
  containers: { name: string; cpu: string; memory: string }[],
  labels?: Record<string, string>
): PodMetric {
  return {
    metadata: {
      name,
      namespace: 'ns-1',
      selfLink: '',
      creationTimestamp: '',
      ...(labels ? { labels } : {}),
    },
    timestamp: '2026-09-24T10:00:00Z',
    window: '15s',
    containers: containers.map((c) => ({ name: c.name, usage: { cpu: c.cpu, memory: c.memory } })),
  };
}

const svcA = new mongoose.Types.ObjectId();
const svcProbe = new mongoose.Types.ObjectId();
const svcB = new mongoose.Types.ObjectId();

describe('parseCpuQuantity', () => {
  test.each([
    ['250m', 250],
    ['1', 1000],
    ['0.5', 500],
    ['1500000n', 1.5],
    ['12u', 0.012],
    ['2k', 2_000_000],
    ['1e-3', 1],
  ])('%s -> %s millicores', (quantity, expected) => {
    expect(parseCpuQuantity(quantity)).toBeCloseTo(expected, 6);
  });

  test.each([[''], ['abc'], ['12x'], ['-1'], [undefined]])('%s -> 0', (quantity) => {
    expect(parseCpuQuantity(quantity)).toBe(0);
  });
});

describe('parseMemoryQuantity', () => {
  test.each([
    ['128Mi', 128 * 1024 ** 2],
    ['1Gi', 1024 ** 3],
    ['512Ki', 512 * 1024],
    ['1G', 1e9],
    ['1K', 1000],
    ['2M', 2e6],
    ['1048576', 1048576],
  ])('%s -> %s bytes', (quantity, expected) => {
    expect(parseMemoryQuantity(quantity)).toBe(expected);
  });

  test.each([[''], ['lots'], ['1Qi'], [undefined]])('%s -> 0', (quantity) => {
    expect(parseMemoryQuantity(quantity)).toBe(0);
  });
});

describe('mapPodMetricsToServices', () => {
  const deployed = [
    { serviceId: svcA, nodeId: 'n1', name: 'web' },
    // A sidecar row carries its host's workload name.
    { serviceId: svcProbe, nodeId: 'n2', name: 'web' },
    { serviceId: svcB, nodeId: 'n3', name: 'web-api' },
  ];

  test('maps pods by app label, keeping sidecar containers and summing replicas', () => {
    const [web, api] = mapPodMetricsToServices(
      [
        pod(
          'web-1',
          [
            { name: 'web', cpu: '100m', memory: '64Mi' },
            { name: 'mmt-probe', cpu: '50m', memory: '32Mi' },
          ],
          { app: 'web' }
        ),
        pod('web-2', [{ name: 'web', cpu: '150m', memory: '64Mi' }], { app: 'web' }),
      ],
      deployed
    );

    expect(web.name).toBe('web');
    expect(web.serviceIds).toEqual([svcA.toString(), svcProbe.toString()]);
    expect(web.nodeIds).toEqual(['n1', 'n2']);
    expect(web.pods).toBe(2);
    expect(web.cpuMillicores).toBe(300);
    expect(web.memoryBytes).toBe(160 * 1024 ** 2);
    expect(web.containers).toEqual([
      { name: 'web', cpuMillicores: 250, memoryBytes: 128 * 1024 ** 2 },
      { name: 'mmt-probe', cpuMillicores: 50, memoryBytes: 32 * 1024 ** 2 },
    ]);
    expect(api.pods).toBe(0);
    expect(api.cpuMillicores).toBe(0);
  });

  test('falls back to the longest matching pod-name prefix for unlabelled pods', () => {
    const [web, api] = mapPodMetricsToServices(
      [pod('web-api-7d9f-x2', [{ name: 'web-api', cpu: '10m', memory: '1Mi' }])],
      deployed
    );
    expect(api.pods).toBe(1);
    expect(api.cpuMillicores).toBe(10);
    expect(web.pods).toBe(0);
  });

  test('ignores pods that belong to no deployed workload', () => {
    const result = mapPodMetricsToServices(
      [
        pod('other-1', [{ name: 'x', cpu: '1', memory: '1Gi' }], { app: 'other' }),
        pod('stray', [{ name: 'x', cpu: '1', memory: '1Gi' }]),
      ],
      deployed
    );
    expect(result.every((w) => w.pods === 0 && w.cpuMillicores === 0)).toBe(true);
  });

  test('skips deployed rows without a workload name', () => {
    expect(mapPodMetricsToServices([], [{ serviceId: svcA, nodeId: 'n1' }])).toEqual([]);
  });
});

describe('evaluateAlertRules', () => {
  const infraA = new mongoose.Types.ObjectId().toString();
  const infraB = new mongoose.Types.ObjectId().toString();

  const sample = (overrides: Partial<AlertSample> = {}): AlertSample => ({
    key: 'exec1:web',
    name: 'web',
    executionId: 'exec1',
    infrastructureId: infraA,
    serviceIds: [svcA.toString()],
    pods: 1,
    cpuMillicores: 500,
    memoryBytes: 256 * 1024 ** 2,
    ...overrides,
  });

  const rule = (overrides: Partial<AlertRuleLike> = {}): AlertRuleLike => ({
    _id: new mongoose.Types.ObjectId(),
    name: 'High CPU',
    metric: 'cpu_millicores',
    operator: 'gt',
    threshold: 400,
    severity: 'warning',
    enabled: true,
    ...overrides,
  });

  test.each([
    ['gt', 500, false],
    ['gt', 499, true],
    ['gte', 500, true],
    ['gte', 501, false],
    ['lt', 501, true],
    ['lt', 500, false],
    ['lte', 500, true],
    ['lte', 499, false],
  ] as const)('%s %s against 500m fires=%s', (operator, threshold, fires) => {
    const alerts = evaluateAlertRules([sample()], [rule({ operator, threshold })]);
    expect(alerts).toHaveLength(fires ? 1 : 0);
  });

  test('compares memory rules in MiB and carries the rule details', () => {
    const r = rule({ name: 'Memory', metric: 'memory_mib', threshold: 200, severity: 'critical' });
    const [alert] = evaluateAlertRules([sample()], [r]);
    expect(alert).toEqual({
      ruleId: String(r._id),
      ruleName: 'Memory',
      serviceKey: 'exec1:web',
      serviceName: 'web',
      executionId: 'exec1',
      infrastructureId: infraA,
      metric: 'memory_mib',
      operator: 'gt',
      value: 256,
      threshold: 200,
      severity: 'critical',
    });
  });

  test('skips disabled rules and samples without pods', () => {
    expect(evaluateAlertRules([sample()], [rule({ enabled: false })])).toEqual([]);
    expect(evaluateAlertRules([sample({ pods: 0 })], [rule()])).toEqual([]);
  });

  test('applies scoped rules only to the matching service and infrastructure', () => {
    const samples = [
      sample(),
      sample({
        key: 'exec2:db',
        name: 'db',
        serviceIds: [svcB.toString()],
        infrastructureId: infraB,
      }),
    ];
    const byService = evaluateAlertRules(samples, [rule({ scope: { serviceId: svcB } })]);
    expect(byService.map((a) => a.serviceName)).toEqual(['db']);
    const byInfra = evaluateAlertRules(samples, [rule({ scope: { infrastructureId: infraA } })]);
    expect(byInfra.map((a) => a.serviceName)).toEqual(['web']);
    expect(evaluateAlertRules(samples, [rule({ scope: {} })])).toHaveLength(2);
  });

  test('orders alerts critical first', () => {
    const alerts = evaluateAlertRules(
      [sample()],
      [rule({ severity: 'info' }), rule({ severity: 'critical' }), rule({ severity: 'warning' })]
    );
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'warning', 'info']);
  });
});

describe('classifyMetricsError', () => {
  const api = (code: number) => new ApiException(code, 'boom', undefined, {});

  test('maps a missing or unavailable metrics-server (404/503)', () => {
    expect(classifyMetricsError(api(404))).toMatch(/metrics-server is not installed/);
    expect(classifyMetricsError(api(503))).toMatch(/metrics-server is not installed/);
  });

  test('maps RBAC and credential failures', () => {
    expect(classifyMetricsError(api(403))).toMatch(/pods\.metrics\.k8s\.io/);
    expect(classifyMetricsError(api(401))).toMatch(/credentials/);
  });

  test('keeps other API errors to their status code', () => {
    expect(classifyMetricsError(api(500))).toBe('Kubernetes metrics API error (500)');
  });

  test('never echoes a raw error message', () => {
    const reason = classifyMetricsError(new Error('connect ECONNREFUSED 10.0.0.1:6443'));
    expect(reason).toBe('Kubernetes metrics API unreachable');
  });
});
