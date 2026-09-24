import { describe, test, expect, vi } from 'vitest';

/**
 * Unit test for the metrics-read timeout of `collectMonitoringSnapshot`
 * (issue #25). The models and the Kubernetes metrics client are mocked, so it
 * needs neither MongoDB nor a cluster: a metrics-server that never answers
 * must degrade its infrastructure instead of stalling the snapshot.
 */

const ids = vi.hoisted(() => ({
  scenario: '64b000000000000000000001',
  infrastructure: '64b000000000000000000002',
  execution: '64b000000000000000000003',
  service: '64b000000000000000000004',
}));

vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kubernetes/client-node')>();
  class Metrics {
    // A metrics API that never answers.
    getPodMetrics(): Promise<never> {
      return new Promise<never>(() => {});
    }
  }
  return { ...actual, Metrics };
});

vi.mock('../kubernetesDeploy.js', () => ({
  buildKubeConfig: () => ({}),
}));

vi.mock('../../models/Scenario.js', () => ({
  Scenario: {
    find: () => ({
      select: () => ({
        lean: async () => [
          {
            _id: ids.scenario,
            title: 'Web scenario',
            infrastructureId: ids.infrastructure,
            executions: [
              {
                _id: ids.execution,
                status: 'running',
                namespace: 'ns-a',
                deployedServices: [{ serviceId: ids.service, nodeId: 'n1', name: 'web' }],
              },
            ],
          },
        ],
      }),
    }),
  },
}));

vi.mock('../../models/Infrastructure.js', () => ({
  Infrastructure: {
    findById: () => ({ lean: async () => ({ name: 'lab-cluster' }) }),
  },
}));

vi.mock('../../models/AlertRule.js', () => ({
  AlertRule: { find: () => ({ lean: async () => [] }) },
}));

const { collectMonitoringSnapshot } = await import('../monitoring.js');

describe('collectMonitoringSnapshot — metrics timeout', () => {
  test('degrades an unresponsive infrastructure to available:false with the timeout reason', async () => {
    const snapshot = await collectMonitoringSnapshot({}, 20);

    expect(snapshot.infrastructures).toEqual([
      {
        infrastructureId: ids.infrastructure,
        name: 'lab-cluster',
        available: false,
        reason: 'Timed out waiting for the Kubernetes metrics API',
        namespaces: 1,
      },
    ]);
    expect(snapshot.services).toHaveLength(1);
    expect(snapshot.services[0]).toMatchObject({
      name: 'web',
      metricsAvailable: false,
      pods: 0,
      serviceIds: [ids.service],
    });
    expect(snapshot.alerts).toEqual([]);
  });
});
