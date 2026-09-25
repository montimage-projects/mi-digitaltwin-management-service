import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * End-to-end tests for the service monitoring routes (issue #25):
 * `GET /api/monitoring/metrics` and the alert-rule CRUD endpoints.
 *
 * `@kubernetes/client-node` is mocked — there is no cluster (and no
 * metrics-server) in CI/test environments — while MongoDB is real (a
 * disposable test database); if MongoDB is unreachable, all tests skip.
 */

const {
  impl,
  metricsCalls,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  KubeConfig,
  ApiException,
  Metrics,
} = vi.hoisted(() => {
  class ApiException extends Error {
    code: number;
    body: unknown;
    constructor(code: number, message: string, body?: unknown) {
      super(message);
      this.code = code;
      this.body = body;
    }
  }

  const impl = {
    readNamespacedDeployment: async (): Promise<unknown> => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 1 },
    }),
    readNamespacedJob: async (): Promise<unknown> => ({ status: {} }),
    listNamespacedPod: async (): Promise<unknown> => ({ items: [] }),
    readNamespacedPodLog: async (): Promise<string> => '',
    listNamespacedEvent: async (): Promise<unknown> => ({ items: [] }),
    deleteNamespace: async (): Promise<unknown> => ({}),
    createNamespace: async (): Promise<unknown> => ({}),
    getPodMetrics: (async () => ({ items: [] })) as (namespace?: string) => Promise<unknown>,
    // Proxied Prometheus of an execution's observability stack.
    promGet: (async () => ({ status: 503, body: '' })) as (
      path: string
    ) => Promise<{ status: number; body: string }>,
  };

  // Namespaces the metrics client was asked for, in call order.
  const metricsCalls: (string | undefined)[] = [];

  class CoreV1Api {}
  class AppsV1Api {}
  class BatchV1Api {}
  class NetworkingV1Api {}
  class RbacAuthorizationV1Api {}

  class KubeConfig {
    loadFromString(): void {}
    loadFromOptions(): void {}
    makeApiClient(ctor: unknown): unknown {
      if (ctor === CoreV1Api) {
        return {
          listNamespacedPod: impl.listNamespacedPod,
          readNamespacedPodLog: impl.readNamespacedPodLog,
          listNamespacedEvent: impl.listNamespacedEvent,
          deleteNamespace: impl.deleteNamespace,
          createNamespace: impl.createNamespace,
        };
      }
      if (ctor === AppsV1Api) {
        return { readNamespacedDeployment: impl.readNamespacedDeployment };
      }
      if (ctor === BatchV1Api) {
        return { readNamespacedJob: impl.readNamespacedJob };
      }
      return {};
    }
  }

  class Metrics {
    getPodMetrics(namespace?: string): Promise<unknown> {
      metricsCalls.push(namespace);
      return impl.getPodMetrics(namespace);
    }
  }

  return {
    impl,
    metricsCalls,
    CoreV1Api,
    AppsV1Api,
    BatchV1Api,
    NetworkingV1Api,
    RbacAuthorizationV1Api,
    KubeConfig,
    ApiException,
    Metrics,
  };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  ApiException,
  Metrics,
}));

vi.mock('../../services/observability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/observability.js')>()),
  apiGetFor: () => (path: string) => impl.promGet(path),
}));

const { env } = await import('../../config/env.js');
const { encrypt } = await import('../../utils/encryption.js');
const { Project } = await import('../../models/Project.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { Service } = await import('../../models/Service.js');
const { Scenario } = await import('../../models/Scenario.js');
const { AlertRule } = await import('../../models/AlertRule.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const monitoringRoutes = (await import('../monitoring.routes.js')).default;

const TEST_DB_NAME = `secsim_monitoring_e2e_${Date.now()}`;
const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let adminHeader: Record<string, string>;
let viewerHeader: Record<string, string>;
let infraAId: string;
let infraBId: string;
let webServiceId: string;
let dbServiceId: string;

const DEFAULT_IMPL = { ...impl };

const METRICS_URL = () => `${baseUrl}/api/monitoring/metrics`;
const RULES_URL = () => `${baseUrl}/api/monitoring/alert-rules`;

function podMetric(name: string, app: string, cpu: string, memory: string) {
  return {
    metadata: { name, namespace: 'x', labels: { app } },
    timestamp: '2026-09-24T10:00:00Z',
    window: '15s',
    containers: [{ name: app, usage: { cpu, memory } }],
  };
}

/** Healthy clusters: `web` at 300m / 256Mi on infra A, `db` at 50m / 64Mi on infra B. */
function useHealthyClusters(): void {
  impl.getPodMetrics = async (namespace?: string) => {
    if (namespace === 'ns-a') return { items: [podMetric('web-1', 'web', '300m', '256Mi')] };
    if (namespace === 'ns-b') return { items: [podMetric('db-1', 'db', '50m', '64Mi')] };
    return { items: [] };
  };
}

function token(role: string): Record<string, string> {
  const signed = jwt.sign({ userId: `u-${role}`, username: `${role}-user`, role }, env.JWT_SECRET, {
    expiresIn: '5m',
  });
  return { Authorization: `Bearer ${signed}`, 'Content-Type': 'application/json' };
}

async function createRule(body: Record<string, unknown>): Promise<Response> {
  return fetch(RULES_URL(), { method: 'POST', headers: adminHeader, body: JSON.stringify(body) });
}

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const project = await Project.create({
    shortName: 'MONITOR',
    title: 'Monitoring Test Project',
    sector: 'Telecommunications',
    leader: 'Test Leader',
  });

  const [infraA, infraB] = await Infrastructure.create([
    {
      name: `k8s-monitor-a-${Date.now()}`,
      type: 'kubernetes',
      endpoint: 'https://10.0.0.1:6443',
      credentials: encrypt('a-bearer-token'),
      status: 'active',
    },
    {
      name: `k8s-monitor-b-${Date.now()}`,
      type: 'kubernetes',
      endpoint: 'https://10.0.0.2:6443',
      credentials: encrypt('b-bearer-token'),
      status: 'active',
    },
  ]);
  infraAId = infraA._id.toString();
  infraBId = infraB._id.toString();

  const makeService = (shortName: string) =>
    Service.create({
      shortName: `${shortName}${Date.now()}`,
      title: shortName,
      categoryId: new mongoose.Types.ObjectId(),
      provider: 'Test',
      uiType: 'web',
      currentVersion: '1.0.0',
      versions: [{ version: '1.0.0', dockerImage: `registry.example/${shortName}:1.0.0` }],
      repositoryTable: 'OTHER_SERVICES',
    });
  const web = await makeService('MONWEB');
  const db = await makeService('MONDB');
  webServiceId = web._id.toString();
  dbServiceId = db._id.toString();

  const execution = (
    status: 'running' | 'completed',
    namespace: string,
    services: { id: mongoose.Types.ObjectId; name: string }[],
    completedAt?: Date
  ) => ({
    executedAt: new Date(),
    ...(completedAt ? { completedAt } : {}),
    executedBy: 'tester',
    status,
    namespace,
    deployedServices: services.map((s, i) => ({
      serviceId: s.id,
      nodeId: `n${i + 1}`,
      name: s.name,
      uiType: 'web',
      status: 'running',
    })),
  });

  await Scenario.create([
    {
      projectId: project._id,
      title: 'Web scenario',
      infrastructureId: infraA._id,
      topology: { yaml: '', nodes: [], edges: [] },
      executions: [
        // Deployed with the observability stack (scenario option on).
        { ...execution('running', 'ns-a', [{ id: web._id, name: 'web' }]), observability: true },
        // A torn-down run (completedAt stamped) must not be polled.
        execution('completed', 'ns-a-old', [{ id: web._id, name: 'web' }], new Date()),
      ],
    },
    {
      projectId: project._id,
      title: 'Db scenario',
      infrastructureId: infraB._id,
      topology: { yaml: '', nodes: [], edges: [] },
      // Settled but still deployed: the console saves `completed` once the
      // rollout settles, and the namespace stays up until teardown.
      executions: [execution('completed', 'ns-b', [{ id: db._id, name: 'db' }])],
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use('/api/monitoring', monitoringRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  adminHeader = token('admin');
  viewerHeader = token('viewer');
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  Object.assign(impl, DEFAULT_IMPL);
  metricsCalls.length = 0;
  if (mongoAvailable) await AlertRule.deleteMany({});
});

describe('monitoring routes — authentication and authorization', () => {
  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;
    expect((await fetch(METRICS_URL())).status).toBe(401);
    expect((await fetch(RULES_URL())).status).toBe(401);
    expect((await fetch(RULES_URL(), { method: 'POST' })).status).toBe(401);
  });

  test('lets a non-admin read but not change alert rules', async () => {
    if (!mongoAvailable) return;
    expect((await fetch(RULES_URL(), { headers: viewerHeader })).status).toBe(200);
    expect((await fetch(METRICS_URL(), { headers: viewerHeader })).status).toBe(200);

    const body = JSON.stringify({
      name: 'CPU',
      metric: 'cpu_millicores',
      operator: 'gt',
      threshold: 100,
      severity: 'warning',
    });
    const created = await fetch(RULES_URL(), { method: 'POST', headers: viewerHeader, body });
    expect(created.status).toBe(403);

    const id = new mongoose.Types.ObjectId().toString();
    const put = await fetch(`${RULES_URL()}/${id}`, {
      method: 'PUT',
      headers: viewerHeader,
      body: JSON.stringify({ threshold: 1 }),
    });
    expect(put.status).toBe(403);
    const del = await fetch(`${RULES_URL()}/${id}`, { method: 'DELETE', headers: viewerHeader });
    expect(del.status).toBe(403);
    expect(await AlertRule.countDocuments()).toBe(0);
  });
});

describe('alert rule CRUD', () => {
  test('round-trips create, list, update and delete for an admin', async () => {
    if (!mongoAvailable) return;
    const created = await createRule({
      name: 'High CPU',
      metric: 'cpu_millicores',
      operator: 'gt',
      threshold: 200,
      severity: 'warning',
      scope: { serviceId: webServiceId },
    });
    expect(created.status).toBe(201);
    const rule = await created.json();
    expect(rule).toMatchObject({
      name: 'High CPU',
      metric: 'cpu_millicores',
      operator: 'gt',
      threshold: 200,
      severity: 'warning',
      enabled: true,
      createdBy: 'admin-user',
      scope: { serviceId: webServiceId },
    });
    expect(rule.__v).toBeUndefined();

    const list = await (await fetch(RULES_URL(), { headers: adminHeader })).json();
    expect(list.map((r: { _id: string }) => r._id)).toEqual([rule._id]);

    const updated = await fetch(`${RULES_URL()}/${rule._id}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({ threshold: 500, severity: 'critical', enabled: false }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      threshold: 500,
      severity: 'critical',
      enabled: false,
    });

    const deleted = await fetch(`${RULES_URL()}/${rule._id}`, {
      method: 'DELETE',
      headers: adminHeader,
    });
    expect(deleted.status).toBe(200);
    expect(await AlertRule.countDocuments()).toBe(0);
  });

  test('400s on an invalid body or id', async () => {
    if (!mongoAvailable) return;
    const bad = await createRule({
      name: '',
      metric: 'latency',
      operator: 'gt',
      threshold: -1,
      severity: 'warning',
    });
    expect(bad.status).toBe(400);

    const badScope = await createRule({
      name: 'x',
      metric: 'memory_mib',
      operator: 'gt',
      threshold: 1,
      severity: 'info',
      scope: { serviceId: 'not-an-id' },
    });
    expect(badScope.status).toBe(400);

    const emptyUpdate = await fetch(`${RULES_URL()}/${new mongoose.Types.ObjectId()}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({}),
    });
    expect(emptyUpdate.status).toBe(400);

    const badId = await fetch(`${RULES_URL()}/not-an-id`, {
      method: 'DELETE',
      headers: adminHeader,
    });
    expect(badId.status).toBe(400);
  });

  test('404s on an unknown rule', async () => {
    if (!mongoAvailable) return;
    const id = new mongoose.Types.ObjectId().toString();
    const put = await fetch(`${RULES_URL()}/${id}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({ threshold: 1 }),
    });
    expect(put.status).toBe(404);
    const del = await fetch(`${RULES_URL()}/${id}`, { method: 'DELETE', headers: adminHeader });
    expect(del.status).toBe(404);
  });
});

describe('GET /api/monitoring/metrics', () => {
  test('maps pod metrics to running services and fires matching alerts', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    await createRule({
      name: 'High CPU',
      metric: 'cpu_millicores',
      operator: 'gt',
      threshold: 200,
      severity: 'critical',
    });
    await createRule({
      name: 'Memory',
      metric: 'memory_mib',
      operator: 'gte',
      threshold: 64,
      severity: 'info',
    });

    const res = await fetch(METRICS_URL(), { headers: viewerHeader });
    expect(res.status).toBe(200);
    const snapshot = await res.json();

    // Only the running executions' namespaces are read — one call each.
    expect([...metricsCalls].sort()).toEqual(['ns-a', 'ns-b']);
    expect(
      snapshot.infrastructures.map((i: { available: boolean; namespaces: number }) => [
        i.available,
        i.namespaces,
      ])
    ).toEqual([
      [true, 1],
      [true, 1],
    ]);

    const byName = Object.fromEntries(
      snapshot.services.map((s: { name: string }) => [s.name, s])
    ) as Record<string, Record<string, unknown>>;
    expect(Object.keys(byName).sort()).toEqual(['db', 'web']);
    expect(byName.web).toMatchObject({
      scenarioTitle: 'Web scenario',
      namespace: 'ns-a',
      infrastructureId: infraAId,
      serviceIds: [webServiceId],
      metricsAvailable: true,
      pods: 1,
      cpuMillicores: 300,
      memoryBytes: 256 * 1024 * 1024,
    });
    expect(byName.db).toMatchObject({ infrastructureId: infraBId, cpuMillicores: 50 });

    // web crosses both rules, db only the memory one; critical sorts first.
    expect(
      snapshot.alerts.map((a: { ruleName: string; serviceName: string }) => [
        a.ruleName,
        a.serviceName,
      ])
    ).toEqual([
      ['High CPU', 'web'],
      ['Memory', 'web'],
      ['Memory', 'db'],
    ]);
  });

  test('never serializes infrastructure credentials', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    const text = await (await fetch(METRICS_URL(), { headers: adminHeader })).text();
    expect(text).not.toMatch(/credentials|encrypted|authTag|bearer-token/i);
  });

  test('degrades an infrastructure without metrics-server to available:false (HTTP 200)', async () => {
    if (!mongoAvailable) return;
    impl.getPodMetrics = async (namespace?: string) => {
      if (namespace === 'ns-a') throw new ApiException(404, 'not found');
      return { items: [podMetric('db-1', 'db', '50m', '64Mi')] };
    };

    const res = await fetch(METRICS_URL(), { headers: adminHeader });
    expect(res.status).toBe(200);
    const snapshot = await res.json();

    const infraA = snapshot.infrastructures.find(
      (i: { infrastructureId: string }) => i.infrastructureId === infraAId
    );
    const infraB = snapshot.infrastructures.find(
      (i: { infrastructureId: string }) => i.infrastructureId === infraBId
    );
    expect(infraA).toMatchObject({ available: false });
    expect(infraA.reason).toMatch(/metrics-server is not installed/);
    expect(infraB).toMatchObject({ available: true });
    expect(infraB.reason).toBeUndefined();

    // The running service is still listed, flagged as having no metrics.
    const web = snapshot.services.find((s: { name: string }) => s.name === 'web');
    expect(web).toMatchObject({ metricsAvailable: false, pods: 0 });
  });

  test('reports a missing RBAC permission (403) per infrastructure', async () => {
    if (!mongoAvailable) return;
    impl.getPodMetrics = async () => {
      throw new ApiException(403, 'forbidden');
    };

    const res = await fetch(METRICS_URL(), { headers: adminHeader });
    expect(res.status).toBe(200);
    const snapshot = await res.json();
    expect(snapshot.infrastructures).toHaveLength(2);
    for (const infra of snapshot.infrastructures) {
      expect(infra.available).toBe(false);
      expect(infra.reason).toMatch(/pods\.metrics\.k8s\.io/);
    }
    expect(snapshot.alerts).toEqual([]);
  });

  test('narrows by infrastructure, service and severity', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    await createRule({
      name: 'High CPU',
      metric: 'cpu_millicores',
      operator: 'gt',
      threshold: 200,
      severity: 'critical',
    });
    await createRule({
      name: 'Memory',
      metric: 'memory_mib',
      operator: 'gte',
      threshold: 64,
      severity: 'info',
    });

    const byInfra = await (
      await fetch(`${METRICS_URL()}?infrastructureId=${infraBId}`, { headers: adminHeader })
    ).json();
    expect(byInfra.services.map((s: { name: string }) => s.name)).toEqual(['db']);
    expect(metricsCalls).toEqual(['ns-b']);

    const byService = await (
      await fetch(`${METRICS_URL()}?serviceId=${webServiceId}`, { headers: adminHeader })
    ).json();
    expect(byService.services.map((s: { name: string }) => s.name)).toEqual(['web']);
    const byDbService = await (
      await fetch(`${METRICS_URL()}?serviceId=${dbServiceId}`, { headers: adminHeader })
    ).json();
    expect(byDbService.services.map((s: { name: string }) => s.name)).toEqual(['db']);

    const bySeverity = await (
      await fetch(`${METRICS_URL()}?severity=critical`, { headers: adminHeader })
    ).json();
    expect(bySeverity.alerts.map((a: { severity: string }) => a.severity)).toEqual(['critical']);
    expect(bySeverity.services).toHaveLength(2);
  });

  test('400s on invalid filters', async () => {
    if (!mongoAvailable) return;
    for (const query of ['severity=urgent', 'serviceId=nope', 'infrastructureId=123']) {
      const res = await fetch(`${METRICS_URL()}?${query}`, { headers: adminHeader });
      expect(res.status).toBe(400);
    }
  });
});

describe('monitoring routes — observability stack readings', () => {
  const vector = (result: { metric: Record<string, string>; value: number }[]) =>
    JSON.stringify({
      status: 'success',
      data: {
        resultType: 'vector',
        result: result.map((r) => ({ metric: r.metric, value: [0, String(r.value)] })),
      },
    });

  /** web's probe answers half the time at 40 ms. */
  function useStack(): void {
    impl.promGet = async (path: string) => {
      expect(path).toContain('/namespaces/ns-a/services/secsim-prometheus:9090/proxy/');
      const query = decodeURIComponent(path.split('query=')[1]);
      const url = { http_url: 'http://web:8080/' };
      if (query.startsWith('sum by (http_url)'))
        return { status: 200, body: vector([{ metric: url, value: 0 }]) };
      if (query.startsWith('avg_over_time((sum'))
        return { status: 200, body: vector([{ metric: url, value: 0.5 }]) };
      if (query.startsWith('avg_over_time(httpcheck_duration'))
        return { status: 200, body: vector([{ metric: url, value: 40 }]) };
      return { status: 200, body: vector([]) };
    };
  }

  test('adds probe readings to services of executions running the stack', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    useStack();
    const snapshot = await (await fetch(METRICS_URL(), { headers: viewerHeader })).json();
    const byName = Object.fromEntries(
      snapshot.services.map((s: { name: string }) => [s.name, s])
    ) as Record<string, Record<string, unknown>>;

    expect(byName.web).toMatchObject({
      observability: true,
      traffic: { probe: 'http', up: false, availability: 0.5, probeLatencyMs: 40 },
    });
    expect(byName.web).not.toHaveProperty('trafficReason');
    expect(byName.db).toMatchObject({ observability: false });
    expect(byName.db).not.toHaveProperty('traffic');
  });

  test('fires availability rules from the stack', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    useStack();
    await fetch(RULES_URL(), {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Unavailable',
        metric: 'availability_pct',
        operator: 'lt',
        threshold: 90,
        severity: 'critical',
      }),
    });
    const snapshot = await (await fetch(METRICS_URL(), { headers: viewerHeader })).json();
    expect(snapshot.alerts).toEqual([
      expect.objectContaining({ serviceName: 'web', metric: 'availability_pct', value: 50 }),
    ]);
  });

  test('explains an unreachable stack without failing the snapshot', async () => {
    if (!mongoAvailable) return;
    useHealthyClusters();
    impl.promGet = async () => ({ status: 503, body: 'upstream: secret-host' });
    const res = await fetch(METRICS_URL(), { headers: viewerHeader });
    expect(res.status).toBe(200);
    const web = (await res.json()).services.find((s: { name: string }) => s.name === 'web');
    expect(web.metricsAvailable).toBe(true);
    expect(web.trafficReason).toBe('the observability stack is not running in this namespace yet');
    expect(JSON.stringify(web)).not.toContain('secret-host');
  });
});
