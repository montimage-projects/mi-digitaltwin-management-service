import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * End-to-end tests for the SSE deploy-progress/logs stream (issue #18).
 *
 * `@kubernetes/client-node` is mocked — there is no cluster in CI/test
 * environments — while MongoDB is real (a disposable test database); if MongoDB
 * is unreachable, all tests skip. The test app mounts the global
 * `compression()` middleware so the SSE compression-bypass is exercised: a
 * buffered response would never deliver the first `progress` event while the
 * connection stays open, so receiving it proves the stream is not buffered.
 */

const { counts, impl, CoreV1Api, AppsV1Api, KubeConfig, ApiException } = vi.hoisted(() => {
  class ApiException extends Error {
    code: number;
    body: unknown;
    constructor(code: number, message: string, body?: unknown) {
      super(message);
      this.code = code;
      this.body = body;
    }
  }

  // Per-test-controllable cluster behaviour + call counters.
  const counts = { readNamespacedDeployment: 0, listNamespace: 0 };
  const impl = {
    readNamespacedDeployment: async (): Promise<unknown> => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 0 },
    }),
    listNamespacedPod: async (): Promise<unknown> => ({ items: [] }),
    readNamespacedPodLog: async (): Promise<string> => '',
    listNamespace: async (): Promise<unknown> => ({ items: [] }),
  };

  class CoreV1Api {}
  class AppsV1Api {}

  class KubeConfig {
    loadFromString(): void {}
    loadFromOptions(): void {}
    makeApiClient(ctor: unknown): unknown {
      if (ctor === CoreV1Api) {
        return {
          listNamespacedPod: (...a: unknown[]) => impl.listNamespacedPod(...(a as [])),
          readNamespacedPodLog: (...a: unknown[]) => impl.readNamespacedPodLog(...(a as [])),
          listNamespace: (...a: unknown[]) => {
            counts.listNamespace += 1;
            return impl.listNamespace(...(a as []));
          },
        };
      }
      return {
        readNamespacedDeployment: (...a: unknown[]) => {
          counts.readNamespacedDeployment += 1;
          return impl.readNamespacedDeployment(...(a as []));
        },
      };
    }
  }

  return { counts, impl, CoreV1Api, AppsV1Api, KubeConfig, ApiException };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  ApiException,
}));

const { env } = await import('../../config/env.js');
const { encrypt } = await import('../../utils/encryption.js');
const { Project } = await import('../../models/Project.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { Service } = await import('../../models/Service.js');
const { Scenario } = await import('../../models/Scenario.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const scenariosRoutes = (await import('../scenarios.routes.js')).default;

const TEST_DB_NAME = `secsim_scenarios_events_e2e_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;
let scenarioId: string;
let serviceId: mongoose.Types.ObjectId;

/** Push an execution directly onto the scenario and return its id. */
async function makeExecution(overrides: {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  namespace?: string;
  withService?: boolean;
  serviceNames?: string[];
}): Promise<string> {
  const scenario = await Scenario.findById(scenarioId);
  const names = overrides.serviceNames ?? ['svc-a'];
  scenario!.executions.push({
    executedAt: new Date(),
    executedBy: 'tester',
    status: overrides.status ?? 'running',
    namespace: overrides.namespace ?? 'secsim-scn-exec',
    deployedServices:
      overrides.withService === false
        ? []
        : names.map((name, i) => ({
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Read an SSE response into a string until `done` or the signal aborts. */
async function drain(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) text += dec.decode(value, { stream: true });
    }
  } catch {
    // Aborted by the caller's AbortController — return what we accumulated.
  }
  return text;
}

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const project = await Project.create({
    shortName: 'EVENTS',
    title: 'Events Test Project',
    sector: 'Telecommunications',
    leader: 'Test Leader',
  });

  const infrastructure = await Infrastructure.create({
    name: `k8s-events-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.1:6443',
    credentials: encrypt('a-bearer-token'),
    status: 'active',
  });

  const service = await Service.create({
    shortName: `EVENTSVC${Date.now()}`,
    title: 'Streamable Service',
    categoryId: new mongoose.Types.ObjectId(),
    provider: 'Test',
    uiType: 'web',
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', dockerImage: 'registry.example/events:1.0.0' }],
    repositoryTable: 'OTHER_SERVICES',
  });
  serviceId = service._id;

  const scenario = await Scenario.create({
    projectId: project._id,
    title: 'Events Test Scenario',
    infrastructureId: infrastructure._id,
    topology: { yaml: '', nodes: [], edges: [] },
  });
  scenarioId = scenario._id.toString();

  const app = express();
  app.use(compression()); // global compression: SSE route must bypass it
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

describe('GET /api/scenarios/:id/executions/:executionId/events (SSE)', () => {
  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'failed' });
    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`
    );
    expect(res.status).toBe(401);
  });

  test('404s for an unknown execution', async () => {
    if (!mongoAvailable) return;
    const missing = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/executions/${missing}/events`, {
      headers: authHeader,
    });
    expect(res.status).toBe(404);
  });

  test('a terminal execution emits one snapshot then closes (cleanup)', async () => {
    if (!mongoAvailable) return;
    const executionId = await makeExecution({ status: 'failed' });

    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Server closes the stream after `end`, so drain terminates on its own.
    const text = await drain(res);
    expect(text).toContain('event: progress');
    expect(text).toContain('event: end');
    expect(text).toContain('"status":"failed"');
  });

  test('streams progress + logs and ends once the deploy settles (cleanup)', async () => {
    if (!mongoAvailable) return;
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 1 }, // ready -> running -> settled
    });
    impl.listNamespacedPod = async () => ({ items: [{ metadata: { name: 'svc-a-pod' } }] });
    impl.readNamespacedPodLog = async () => 'hello\nworld\n';

    const executionId = await makeExecution({ status: 'running' });

    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);

    const text = await drain(res);
    expect(text).toContain('event: progress');
    expect(text).toContain('"progress":100');
    expect(text).toContain('event: log');
    expect(text).toContain('"line":"hello"');
    expect(text).toContain('"service":"svc-a"');
    expect(text).toContain('event: end');
    expect(text).toContain('"status":"completed"');

    // reset shared impl for other tests
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 0 },
    });
    impl.listNamespacedPod = async () => ({ items: [] });
    impl.readNamespacedPodLog = async () => '';
  });

  test('emits an error event and closes when the cluster fails mid-stream', async () => {
    if (!mongoAvailable) return;
    // The status read fails with a non-404 cluster error -> engine wraps it ->
    // poll catches it -> the stream reports an `error` event and cleans up.
    impl.readNamespacedDeployment = async () => {
      throw new ApiException(500, 'internal server error', { message: 'etcd unavailable' });
    };

    const executionId = await makeExecution({ status: 'running' });

    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);

    const text = await drain(res);
    expect(text).toContain('event: error');
    expect(text).toContain('etcd unavailable');
    expect(text).not.toContain('event: end');

    // reset shared impl for other tests
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 0 },
    });
  });

  test('tags streamed log lines with their originating service across multiple services', async () => {
    if (!mongoAvailable) return;
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 1 }, // both ready -> settled
    });
    // Return a distinct pod per service based on the label selector.
    impl.listNamespacedPod = async (...args: unknown[]) => {
      const { labelSelector } = (args[0] as { labelSelector?: string }) ?? {};
      if (labelSelector === 'app=svc-a') return { items: [{ metadata: { name: 'svc-a-pod' } }] };
      if (labelSelector === 'app=svc-b') return { items: [{ metadata: { name: 'svc-b-pod' } }] };
      return { items: [] };
    };
    impl.readNamespacedPodLog = async (...args: unknown[]) => {
      const { name } = (args[0] as { name?: string }) ?? {};
      return name === 'svc-a-pod' ? 'from-a\n' : 'from-b\n';
    };

    const executionId = await makeExecution({
      status: 'running',
      serviceNames: ['svc-a', 'svc-b'],
    });

    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);

    const text = await drain(res);
    expect(text).toContain('event: log');
    expect(text).toContain('"service":"svc-a"');
    expect(text).toContain('"line":"from-a"');
    expect(text).toContain('"service":"svc-b"');
    expect(text).toContain('"line":"from-b"');
    expect(text).toContain('"progress":100');
    expect(text).toContain('event: end');
    expect(text).toContain('"status":"completed"');

    // reset shared impl for other tests
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 0 },
    });
    impl.listNamespacedPod = async () => ({ items: [] });
    impl.readNamespacedPodLog = async () => '';
  });

  test('client disconnect stops the poll loop (no leaked interval)', async () => {
    if (!mongoAvailable) return;
    // Never settles: deployment stays unavailable and no pods report failure.
    impl.readNamespacedDeployment = async () => ({
      spec: { replicas: 1 },
      status: { availableReplicas: 0 },
    });
    impl.listNamespacedPod = async () => ({ items: [] });

    const executionId = await makeExecution({ status: 'running' });

    const ac = new AbortController();
    const res = await fetch(
      `${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: authHeader, signal: ac.signal }
    );
    expect(res.status).toBe(200);

    // Read until the immediate first progress event arrives (proves no buffering).
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    while (!text.includes('event: progress')) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) text += dec.decode(value, { stream: true });
    }
    expect(text).toContain('event: progress');

    const pollsAtDisconnect = counts.readNamespacedDeployment;
    ac.abort(); // client disconnect
    await reader.cancel().catch(() => {});

    // Wait past one poll interval (2s): a leaked interval would poll again.
    await sleep(2600);
    expect(counts.readNamespacedDeployment).toBe(pollsAtDisconnect);
  }, 10000);
});
