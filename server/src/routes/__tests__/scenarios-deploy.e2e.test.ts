import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
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
  createNamespace: mock(async () => ({})),
  createNamespacedDeployment: mock(async () => ({})),
  createNamespacedService: mock(async () => ({ spec: { ports: [{ nodePort: 30080 }] } })),
  deleteNamespace: mock(async () => ({})),
};

class CoreV1Api {}
class AppsV1Api {}

class KubeConfig {
  loadFromString(): void {}
  loadFromOptions(): void {}
  makeApiClient(ctor: unknown): unknown {
    if (ctor === CoreV1Api) {
      return {
        createNamespace: clusterCalls.createNamespace,
        createNamespacedService: clusterCalls.createNamespacedService,
        deleteNamespace: clusterCalls.deleteNamespace,
        listNamespacedPod: async () => ({ items: [] }),
      };
    }
    return {
      createNamespacedDeployment: clusterCalls.createNamespacedDeployment,
      readNamespacedDeployment: async () => ({}),
    };
  }
}

mock.module('@kubernetes/client-node', () => ({
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

const TEST_DB_NAME = `secsim_scenarios_deploy_e2e_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

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

describe('POST /api/scenarios/:id/execute (Kubernetes deploy)', () => {
  let executionId: string;
  let namespace: string;

  test('deploys the topology and returns namespace + services (no maestroUrl)', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      executionId: string;
      namespace: string;
      status: string;
      maestroUrl?: string;
      services: { serviceId: string; status: string; dashboardUrl?: string }[];
    };

    expect(body.maestroUrl).toBeUndefined();
    expect(body.namespace).toMatch(/^secsim-/);
    expect(body.status).toBe('running');
    expect(body.services).toHaveLength(1);
    expect(body.services[0].dashboardUrl).toBe('http://10.0.0.1:30080');

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
    const calls = clusterCalls.deleteNamespace.mock.calls as unknown as unknown[][];
    const call = calls[calls.length - 1][0] as { name: string };
    expect(call.name).toBe(namespace);

    const scenario = await Scenario.findById(scenarioId).lean();
    const execution = scenario?.executions.find((e) => e._id?.toString() === executionId);
    expect(execution?.status).toBe('completed');
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
