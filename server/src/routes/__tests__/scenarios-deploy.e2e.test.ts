import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * End-to-end tests for the direct-Kubernetes scenario execution + teardown
 * routes (issue #18). `@kubernetes/client-node` is mocked — there is no
 * cluster in CI/test environments — while MongoDB is real (a disposable test
 * database). If MongoDB is unreachable, all tests skip.
 */

const {
  clusterCalls,
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

  // Shared fake cluster clients so the tests can assert on cluster interactions.
  const clusterCalls = {
    createNamespace: vi.fn(async () => ({})),
    createNamespacedDeployment: vi.fn(async () => ({})),
    createNamespacedJob: vi.fn(async () => ({})),
    createNamespacedService: vi.fn(async () => ({ spec: { ports: [{ nodePort: 30080 }] } })),
    deleteNamespace: vi.fn(async () => ({})),
  };

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
          createNamespace: clusterCalls.createNamespace,
          createNamespacedService: clusterCalls.createNamespacedService,
          createNamespacedConfigMap: async () => ({}),
          createNamespacedServiceAccount: async () => ({}),
          deleteNamespace: clusterCalls.deleteNamespace,
          listNamespacedPod: async () => ({ items: [] }),
          // Read by the execution report captured at teardown (issue #26).
          readNamespacedPodLog: async () => '',
          listNamespacedEvent: async () => ({ items: [] }),
        };
      }
      if (ctor === AppsV1Api) {
        return {
          createNamespacedDeployment: clusterCalls.createNamespacedDeployment,
          readNamespacedDeployment: async () => ({}),
        };
      }
      if (ctor === BatchV1Api) {
        return {
          createNamespacedJob: clusterCalls.createNamespacedJob,
          readNamespacedJob: async () => ({ status: {} }),
        };
      }
      if (ctor === NetworkingV1Api) {
        return { createNamespacedNetworkPolicy: async () => ({}) };
      }
      return {
        createNamespacedRole: async () => ({}),
        createNamespacedRoleBinding: async () => ({}),
      };
    }
  }

  return {
    clusterCalls,
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

const TEST_DB_NAME = `secsim_scenarios_deploy_e2e_${Date.now()}`;
const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;
let scenarioId: string;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const project = await Project.create({
    shortName: 'DEPLOY',
    title: 'Deploy Test Project',
    sector: 'Telecommunications',
    leader: 'Test Leader',
  });

  const infrastructure = await Infrastructure.create({
    name: `k8s-test-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.1:6443',
    credentials: encrypt('a-bearer-token'),
    status: 'active',
  });

  const service = await Service.create({
    shortName: `DEPLOYSVC${Date.now()}`,
    title: 'Deployable Service',
    categoryId: new mongoose.Types.ObjectId(),
    provider: 'Test',
    uiType: 'web',
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', dockerImage: 'registry.example/deploy:1.0.0' }],
    repositoryTable: 'OTHER_SERVICES',
  });

  const scenario = await Scenario.create({
    projectId: project._id,
    title: 'Deploy Test Scenario',
    infrastructureId: infrastructure._id,
    topology: {
      yaml: '',
      nodes: [
        {
          id: 'n1',
          data: { serviceId: service._id.toString(), repositoryTable: 'OTHER_SERVICES' },
        },
      ],
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
  authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** Poll the execution until the background rollout reaches `status`. */
async function waitForExecutionStatus(executionId: string, status: string) {
  await vi.waitFor(
    async () => {
      const scenario = await Scenario.findById(scenarioId).lean();
      const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
      expect(execution?.status).toBe(status);
    },
    { timeout: 5000, interval: 50 }
  );
}

describe('POST /api/scenarios/:id/execute (Kubernetes deploy)', () => {
  let executionId: string;
  let namespace: string;

  test('answers at once with the rollout plan, then deploys in the background', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      executionId: string;
      namespace: string;
      status: string;
      maestroUrl?: string;
      services: {
        serviceId: string;
        status: string;
        dashboardUrl?: string;
        webInterface?: boolean;
      }[];
    };

    expect(body.maestroUrl).toBeUndefined();
    expect(body.namespace).toMatch(/^secsim-/);
    // The plan: pending rows, no NodePort yet — the console follows via SSE.
    expect(body.status).toBe('pending');
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({ status: 'pending', webInterface: true });
    expect(body.services[0].dashboardUrl).toBeUndefined();

    await waitForExecutionStatus(body.executionId, 'running');

    expect(clusterCalls.createNamespace).toHaveBeenCalled();
    expect(clusterCalls.createNamespacedDeployment).toHaveBeenCalled();
    expect(clusterCalls.createNamespacedService).toHaveBeenCalled();

    executionId = body.executionId;
    namespace = body.namespace;
  });

  test('persists the namespace and deployed services on the execution', async () => {
    if (!mongoAvailable) return;

    const scenario = await Scenario.findById(scenarioId).lean();
    const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
    expect(execution?.namespace).toBe(namespace);
    expect(execution?.status).toBe('running');
    expect(execution?.deployedServices).toHaveLength(1);
    expect(execution?.deployedServices[0].status).toBe('pending');
    expect(execution?.deployedServices[0].nodeId).toBe('n1');
    expect(execution?.deployedServices[0].dashboardUrl).toBe('http://10.0.0.1:30080');
  });

  test('DELETE tears down the deployment and marks the execution completed', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; namespace: string };
    expect(body.status).toBe('completed');

    expect(clusterCalls.deleteNamespace).toHaveBeenCalled();
    const calls = clusterCalls.deleteNamespace.mock.calls as unknown[][];
    const call = calls[calls.length - 1][0] as { name: string };
    expect(call.name).toBe(namespace);

    const scenario = await Scenario.findById(scenarioId).lean();
    const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
    expect(execution?.status).toBe('completed');

    // The run is closed with run-end stamps and a stored report (issue #26).
    // The mocked deployment never becomes available, so the verdict is partial.
    expect(execution?.completedAt).toBeInstanceOf(Date);
    expect(typeof execution?.durationMs).toBe('number');
    expect(execution?.outcome).toBe('partial');
    const report = await ExecutionReport.findOne({ scenarioId, executionId }).lean();
    expect(report?.outcome).toBe('partial');
    expect(report?.namespace).toBe(namespace);
  });
});

describe('POST /api/scenarios/:id/execute deploy failure', () => {
  test('marks the execution failed when the cluster rejects the background deploy', async () => {
    if (!mongoAvailable) return;

    const original = clusterCalls.createNamespace;
    clusterCalls.createNamespace = vi.fn(async () => {
      throw new ApiException(403, 'forbidden', { message: 'namespace quota exceeded' });
    });

    try {
      const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
        method: 'POST',
        headers: authHeader,
      });
      expect(res.status).toBe(202);
      const { executionId } = (await res.json()) as { executionId: string };

      // A durable, failed execution record is left behind with its namespace.
      await waitForExecutionStatus(executionId, 'failed');
      const scenario = await Scenario.findById(scenarioId).lean();
      const failed = scenario?.executions.find((e) => e._id?.toString() === executionId);
      expect(failed?.namespace).toMatch(/^secsim-/);
      expect(failed?.completedAt).toBeInstanceOf(Date);
    } finally {
      clusterCalls.createNamespace = original;
    }
  });
});

describe('POST /api/scenarios/:id/execute torn down mid-rollout', () => {
  test('a teardown during the background rollout keeps the run closed as completed', async () => {
    if (!mongoAvailable) return;

    // Hold the rollout inside namespace creation until the teardown lands,
    // then fail it the way a deleted namespace does.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = clusterCalls.createNamespace;
    clusterCalls.createNamespace = vi.fn(async () => {
      await gate;
      throw new ApiException(409, 'conflict', { message: 'namespace is being terminated' });
    });

    try {
      const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
        method: 'POST',
        headers: authHeader,
      });
      expect(res.status).toBe(202);
      const { executionId } = (await res.json()) as { executionId: string };

      const down = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/executions/${executionId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      expect(down.status).toBe(200);
      release();

      // Give the background deploy time to fail, then check nothing moved.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const scenario = await Scenario.findById(scenarioId).lean();
      const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
      expect(execution?.status).toBe('completed');
      expect(execution?.outcome).not.toBe('failed');
      expect(execution?.completedAt).toBeInstanceOf(Date);
      // …and the teardown's report is not overwritten by a deploy-failure one.
      const report = await ExecutionReport.findOne({ scenarioId, executionId }).lean();
      expect(report?.outcome).not.toBe('failed');
      expect(report?.error).toBeUndefined();
    } finally {
      clusterCalls.createNamespace = original;
      release();
    }
  });
});

describe('POST /api/scenarios/:id/execute validation', () => {
  test('rejects a scenario with no infrastructure assigned', async () => {
    if (!mongoAvailable) return;

    const project = await Project.findOne().lean();
    const bare = await Scenario.create({
      projectId: project!._id,
      title: 'No Infra Scenario',
    });

    const res = await fetch(`${baseUrl}/api/scenarios/${bare._id.toString()}/execute`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
