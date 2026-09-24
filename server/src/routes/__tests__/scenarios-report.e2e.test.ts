import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * End-to-end tests for execution reports (issue #26): the report generated
 * automatically when a run is torn down or its deploy fails, and the
 * `GET /scenarios/:id/executions/:executionId/report` endpoint.
 *
 * `@kubernetes/client-node` is mocked — there is no cluster in CI/test
 * environments — while MongoDB is real (a disposable test database); if MongoDB
 * is unreachable, all tests skip.
 */

const {
  calls,
  impl,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  KubeConfig,
  ApiException,
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

  // Ordered log of cluster calls, so tests can assert capture-before-delete.
  const calls: string[] = [];
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
  };

  class CoreV1Api {}
  class AppsV1Api {}
  class BatchV1Api {}
  class NetworkingV1Api {}
  class RbacAuthorizationV1Api {}

  const tracked =
    (name: keyof typeof impl) =>
    (...a: unknown[]): Promise<unknown> => {
      calls.push(name);
      return (impl[name] as (...args: unknown[]) => Promise<unknown>)(...a);
    };

  class KubeConfig {
    loadFromString(): void {}
    loadFromOptions(): void {}
    makeApiClient(ctor: unknown): unknown {
      if (ctor === CoreV1Api) {
        return {
          listNamespacedPod: tracked('listNamespacedPod'),
          readNamespacedPodLog: tracked('readNamespacedPodLog'),
          listNamespacedEvent: tracked('listNamespacedEvent'),
          deleteNamespace: tracked('deleteNamespace'),
          createNamespace: tracked('createNamespace'),
        };
      }
      if (ctor === AppsV1Api) {
        return { readNamespacedDeployment: tracked('readNamespacedDeployment') };
      }
      if (ctor === BatchV1Api) {
        return { readNamespacedJob: tracked('readNamespacedJob') };
      }
      return {};
    }
  }

  return {
    calls,
    impl,
    CoreV1Api,
    AppsV1Api,
    BatchV1Api,
    NetworkingV1Api,
    RbacAuthorizationV1Api,
    KubeConfig,
    ApiException,
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
}));

const { env } = await import('../../config/env.js');
const { encrypt } = await import('../../utils/encryption.js');
const { Project } = await import('../../models/Project.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { Service } = await import('../../models/Service.js');
const { Scenario } = await import('../../models/Scenario.js');
const { ExecutionReport } = await import('../../models/ExecutionReport.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const scenariosRoutes = (await import('../scenarios.routes.js')).default;

const TEST_DB_NAME = `secsim_scenarios_report_e2e_${Date.now()}`;
const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;
let scenarioId: string;
let serviceId: mongoose.Types.ObjectId;

const DEFAULT_IMPL = { ...impl };

/** Push an execution directly onto the scenario and return its id. */
async function makeExecution(overrides: {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  namespace?: string;
  serviceNames?: string[];
}): Promise<string> {
  const scenario = await Scenario.findById(scenarioId);
  scenario!.executions.push({
    executedAt: new Date(Date.now() - 65_000),
    executedBy: 'tester',
    status: overrides.status ?? 'running',
    namespace: overrides.namespace ?? 'secsim-scn-report',
    deployedServices: (overrides.serviceNames ?? ['svc-a']).map((name, i) => ({
      serviceId,
      nodeId: `n${i + 1}`,
      name,
      uiType: 'web',
      status: 'pending',
    })),
  });
  await scenario!.save();
  return scenario!.executions[scenario!.executions.length - 1]._id!.toString();
}

async function getExecution(executionId: string) {
  const scenario = await Scenario.findById(scenarioId).lean();
  return scenario!.executions.find((e) => e._id?.toString() === executionId)!;
}

function reportUrl(executionId: string, query = '', id = scenarioId): string {
  return `${baseUrl}/api/scenarios/${id}/executions/${executionId}/report${query}`;
}

async function teardown(executionId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}`, {
    method: 'DELETE',
    headers: authHeader,
  });
}

/** A healthy one-pod cluster whose probe reported one detection. */
function useHealthyCluster(): void {
  impl.listNamespacedPod = async () => ({
    items: [
      {
        metadata: { name: 'svc-a-pod', labels: { app: 'svc-a' } },
        spec: { containers: [{ name: 'svc-a' }, { name: 'mmt-probe' }] },
        status: {
          phase: 'Running',
          containerStatuses: [
            { name: 'svc-a', ready: true, restartCount: 1, state: { running: {} } },
            { name: 'mmt-probe', ready: true, restartCount: 0, state: { running: {} } },
          ],
        },
      },
    ],
  });
  impl.readNamespacedPodLog = async (...args: unknown[]) => {
    const { container } = (args[0] as { container?: string }) ?? {};
    return container === 'mmt-probe'
      ? `${JSON.stringify({ 'ip.src': '10.0.0.66', verdict: 'HTTP flood <script>x</script>' })}\n`
      : 'GET / 200\nERROR upstream reset\n';
  };
  impl.listNamespacedEvent = async () => ({
    items: [
      {
        metadata: { uid: 'evt-1', name: 'svc-a-pod.1' },
        reason: 'Pulled',
        message: 'Container image pulled',
        involvedObject: { kind: 'Pod', name: 'svc-a-pod' },
        type: 'Normal',
        count: 1,
        lastTimestamp: new Date('2026-09-24T10:00:00Z'),
      },
    ],
  });
}

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const project = await Project.create({
    shortName: 'REPORT',
    title: 'Report Test Project',
    sector: 'Telecommunications',
    leader: 'Test Leader',
  });

  const infrastructure = await Infrastructure.create({
    name: `k8s-report-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.1:6443',
    credentials: encrypt('a-bearer-token'),
    status: 'active',
  });

  const service = await Service.create({
    shortName: `REPORTSVC${Date.now()}`,
    title: 'Reportable Service',
    categoryId: new mongoose.Types.ObjectId(),
    provider: 'Test',
    uiType: 'web',
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', dockerImage: 'registry.example/report:1.0.0' }],
    repositoryTable: 'OTHER_SERVICES',
  });
  serviceId = service._id;

  const scenario = await Scenario.create({
    projectId: project._id,
    title: 'Report <b>Scenario</b>',
    infrastructureId: infrastructure._id,
    topology: {
      yaml: '',
      nodes: [{ id: 'n1', data: { serviceId: service._id.toString() } }],
      edges: [],
    },
  });
  scenarioId = scenario._id.toString();

  const app = express();
  app.use(express.json());
  app.use('/api', scenariosRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const token = jwt.sign(
    { userId: 'test-user', username: 'tester', role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  authHeader = { Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(() => {
  Object.assign(impl, DEFAULT_IMPL);
  calls.length = 0;
});

describe('GET /api/scenarios/:id/executions/:executionId/report — validation', () => {
  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'running' });
    const res = await fetch(reportUrl(executionId));
    expect(res.status).toBe(401);
  });

  test('400s on a malformed execution or scenario id', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'running' });
    expect((await fetch(reportUrl('not-an-id'), { headers: authHeader })).status).toBe(400);
    expect(
      (await fetch(reportUrl(executionId, '', 'not-an-id'), { headers: authHeader })).status
    ).toBe(400);
  });

  test('400s on an unsupported or repeated format', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'running' });
    const bad = await fetch(reportUrl(executionId, '?format=pdf'), { headers: authHeader });
    expect(bad.status).toBe(400);
    const repeated = await fetch(reportUrl(executionId, '?format=md&format=html'), {
      headers: authHeader,
    });
    expect(repeated.status).toBe(400);
  });

  test('404s for an unknown execution or scenario', async () => {
    if (!mongoAvailable) return;
    const missing = new mongoose.Types.ObjectId().toString();
    expect((await fetch(reportUrl(missing), { headers: authHeader })).status).toBe(404);
    const executionId = await makeExecution({ status: 'running' });
    expect((await fetch(reportUrl(executionId, '', missing), { headers: authHeader })).status).toBe(
      404
    );
  });
});

describe('execution reports', () => {
  test('serves a provisional report, without cluster reads, before the run closes', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'running' });

    const res = await fetch(reportUrl(executionId), { headers: authHeader });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const report = (await res.json()) as Record<string, unknown>;
    expect(report.provisional).toBe(true);
    expect(report.outcome).toBe('partial');
    expect(report.status).toBe('running');
    expect(report.executionId).toBe(executionId);
    expect(report.services).toEqual([{ name: 'svc-a', status: 'pending', containers: [] }]);
    expect(calls).toEqual([]);
  });

  test('teardown generates the report automatically, capturing before the namespace is deleted', async () => {
    if (!mongoAvailable) return;
    useHealthyCluster();
    const executionId = await makeExecution({ status: 'running' });

    const res = await teardown(executionId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: string; durationMs: number };
    expect(body.status).toBe('completed');
    expect(body.outcome).toBe('passed');
    expect(body.durationMs).toBeGreaterThanOrEqual(65_000);

    // Every capture read happened before the namespace deletion.
    expect(calls).toContain('readNamespacedPodLog');
    expect(calls).toContain('listNamespacedEvent');
    expect(calls[calls.length - 1]).toBe('deleteNamespace');
    expect(calls.filter((c) => c === 'deleteNamespace')).toHaveLength(1);

    // Run-close stamps land on the embedded execution.
    const execution = await getExecution(executionId);
    expect(execution.status).toBe('completed');
    expect(execution.outcome).toBe('passed');
    expect(execution.completedAt).toBeInstanceOf(Date);
    expect(execution.durationMs).toBe(body.durationMs);

    expect(await ExecutionReport.countDocuments({ scenarioId, executionId })).toBe(1);

    const report = (await (
      await fetch(reportUrl(executionId, '?format=json'), { headers: authHeader })
    ).json()) as {
      provisional: boolean;
      outcome: string;
      status: string;
      partial: boolean;
      durationMs: number;
      logs: { line: string }[];
      errorLogs: { line: string }[];
      alerts: { attacker?: string }[];
      events: { reason?: string }[];
      services: { name: string; status: string; containers: unknown[] }[];
      metrics: {
        logs: { lines: number; errorLines: number };
        containers: { restarts: number };
        alerts: { total: number };
      };
    };
    expect(report.provisional).toBe(false);
    expect(report.outcome).toBe('passed');
    expect(report.status).toBe('completed');
    expect(report.partial).toBe(false);
    expect(report.durationMs).toBe(body.durationMs);
    expect(report.services[0]).toMatchObject({ name: 'svc-a', status: 'running' });
    expect(report.services[0].containers).toHaveLength(2);
    expect(report.logs.map((l) => l.line)).toContain('GET / 200');
    expect(report.errorLogs.map((l) => l.line)).toEqual(['ERROR upstream reset']);
    expect(report.alerts).toHaveLength(1);
    expect(report.alerts[0].attacker).toBe('10.0.0.66');
    expect(report.events[0].reason).toBe('Pulled');
    expect(report.metrics.logs).toEqual({ lines: 3, errorLines: 1 });
    expect(report.metrics.containers.restarts).toBe(1);
    expect(report.metrics.alerts.total).toBe(1);

    // Markdown export: attachment named from the execution id only.
    const md = await fetch(reportUrl(executionId, '?format=md'), { headers: authHeader });
    expect(md.status).toBe(200);
    expect(md.headers.get('content-type')).toContain('text/markdown');
    expect(md.headers.get('content-disposition')).toBe(
      `attachment; filename="execution-${executionId}-report.md"`
    );
    const mdText = await md.text();
    expect(mdText).toContain('**PASSED**');
    expect(mdText).toContain('Report \\<b\\>Scenario\\</b\\>');

    // HTML export: escaped, script-free, locked-down CSP.
    const html = await fetch(reportUrl(executionId, '?format=html'), { headers: authHeader });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(html.headers.get('content-disposition')).toBe(
      `attachment; filename="execution-${executionId}-report.html"`
    );
    expect(html.headers.get('content-security-policy')).toContain("default-src 'none'");
    const htmlText = await html.text();
    expect(htmlText).not.toMatch(/<script/i);
    expect(htmlText).toContain('Report &lt;b&gt;Scenario&lt;/b&gt;');
    expect(htmlText).toContain('HTTP flood &lt;script&gt;x&lt;/script&gt;');
  });

  test('a second teardown keeps the stored report and stamps', async () => {
    if (!mongoAvailable) return;
    useHealthyCluster();
    const executionId = await makeExecution({ status: 'running' });
    expect((await teardown(executionId)).status).toBe(200);
    const first = await getExecution(executionId);

    // The namespace is gone now: the cluster returns nothing.
    Object.assign(impl, DEFAULT_IMPL);
    expect((await teardown(executionId)).status).toBe(200);

    const again = await getExecution(executionId);
    expect(again.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    expect(again.outcome).toBe('passed');
    const report = (await (
      await fetch(reportUrl(executionId), { headers: authHeader })
    ).json()) as {
      logs: unknown[];
      outcome: string;
    };
    expect(report.outcome).toBe('passed');
    expect(report.logs.length).toBeGreaterThan(0);
  });

  test('teardown still succeeds with a partial report when the capture fails', async () => {
    if (!mongoAvailable) return;
    impl.listNamespacedPod = async () => {
      throw new ApiException(500, 'internal server error', { message: 'etcd unavailable' });
    };
    impl.listNamespacedEvent = async () => {
      throw new ApiException(500, 'internal server error', { message: 'etcd unavailable' });
    };
    const executionId = await makeExecution({ status: 'running' });

    const res = await teardown(executionId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: string };
    expect(body.status).toBe('completed');
    expect(body.outcome).toBe('partial');
    expect(calls).toContain('deleteNamespace');

    const execution = await getExecution(executionId);
    expect(execution.status).toBe('completed');
    expect(execution.outcome).toBe('partial');

    const report = (await (
      await fetch(reportUrl(executionId), { headers: authHeader })
    ).json()) as {
      partial: boolean;
      outcome: string;
      captureErrors: string[];
      provisional: boolean;
    };
    expect(report.provisional).toBe(false);
    expect(report.partial).toBe(true);
    expect(report.outcome).toBe('partial');
    expect(report.captureErrors.length).toBeGreaterThan(0);
    expect(report.captureErrors.join(' ')).toContain('etcd unavailable');
  });

  test('a failed deploy is reported as failed and teardown preserves it', async () => {
    if (!mongoAvailable) return;
    impl.createNamespace = async () => {
      throw new ApiException(403, 'forbidden', { message: 'namespace quota exceeded' });
    };

    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(502);

    const scenario = await Scenario.findById(scenarioId).lean();
    const failed = scenario!.executions[scenario!.executions.length - 1];
    const executionId = failed._id!.toString();
    expect(failed.status).toBe('failed');
    expect(failed.outcome).toBe('failed');
    expect(failed.completedAt).toBeInstanceOf(Date);
    expect(typeof failed.durationMs).toBe('number');

    const report = (await (
      await fetch(reportUrl(executionId), { headers: authHeader })
    ).json()) as {
      outcome: string;
      error?: string;
      provisional: boolean;
    };
    expect(report.provisional).toBe(false);
    expect(report.outcome).toBe('failed');
    expect(report.error).toContain('namespace quota exceeded');

    // Tearing the failed run down keeps its outcome, error and close time.
    const down = await teardown(executionId);
    expect(down.status).toBe(200);
    expect(((await down.json()) as { outcome: string }).outcome).toBe('failed');

    const after = await getExecution(executionId);
    expect(after.status).toBe('completed');
    expect(after.outcome).toBe('failed');
    expect(after.completedAt?.getTime()).toBe(failed.completedAt?.getTime());

    const closed = (await (
      await fetch(reportUrl(executionId), { headers: authHeader })
    ).json()) as {
      outcome: string;
      error?: string;
    };
    expect(closed.outcome).toBe('failed');
    expect(closed.error).toContain('namespace quota exceeded');
  });
});
