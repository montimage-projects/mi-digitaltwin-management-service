/**
 * Concurrency regression test for scenario execution (issue #88).
 *
 * Verifies that two parallel POST /execute requests do not lose execution
 * records — the scenario must end up with exactly two executions, each with
 * a distinct id.
 *
 * MongoDB is real (disposable test DB); @kubernetes/client-node is mocked so
 * the deploy step always succeeds without a real cluster.
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * Hoist the Kubernetes mock so every test can mutate behaviour.
 */
const { CoreV1Api, AppsV1Api, KubeConfig, ApiException } = vi.hoisted(() => {
  class ApiException extends Error {
    code: number;
    body: unknown;
    constructor(code: number, message: string, body?: unknown) {
      super(message);
      this.code = code;
      this.body = body;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const counts = { createNamespace: 0, createNamespacedDeployment: 0 };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const impl = {
    createNamespace: async (): Promise<unknown> => ({ metadata: { name: 'ns' } }),
    createNamespacedDeployment: async (): Promise<unknown> => ({
      metadata: { name: 'svc' },
      spec: { replicas: 1 },
      status: { availableReplicas: 1 },
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
          createNamespace: async (): Promise<unknown> => ({ metadata: { name: 'ns' } }),
          createNamespacedService: async (): Promise<unknown> => ({
            spec: { ports: [{ nodePort: 30080 }] },
          }),
          listNamespacedPod: async (): Promise<unknown> => ({ items: [] }),
          readNamespacedPodLog: async (): Promise<string> => '',
          listNamespace: async (): Promise<unknown> => ({ items: [] }),
        };
      }
      return {
        createNamespacedDeployment: async (): Promise<unknown> => ({
          metadata: { name: 'svc' },
          spec: { replicas: 1 },
          status: { availableReplicas: 1 },
        }),
      };
    }
  }

  return { CoreV1Api, AppsV1Api, KubeConfig, ApiException };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  ApiException,

  counts: { createNamespace: 0, createNamespacedDeployment: 0 },

  impl: {
    createNamespace: async (): Promise<unknown> => ({ metadata: { name: 'ns' } }),
    createNamespacedDeployment: async (): Promise<unknown> => ({
      metadata: { name: 'svc' },
      spec: { replicas: 1 },
      status: { availableReplicas: 1 },
    }),
    listNamespacedPod: async (): Promise<unknown> => ({ items: [] }),
    readNamespacedPodLog: async (): Promise<string> => '',
    listNamespace: async (): Promise<unknown> => ({ items: [] }),
  },
}));

const { env } = await import('../../config/env.js');
const { encrypt } = await import('../../utils/encryption.js');
const { Project } = await import('../../models/Project.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { Service } = await import('../../models/Service.js');
const { Scenario } = await import('../../models/Scenario.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const scenariosRoutesActual = (await import('../scenarios.routes.js')).default;

const TEST_DB_NAME = `secsim_race_test_${Date.now()}`;
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
    shortName: 'RACE',
    title: 'Race Test Project',
    sector: 'Telecommunications',
    leader: 'Test Leader',
  });

  const infrastructure = await Infrastructure.create({
    name: `k8s-race-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.1:6443',
    credentials: encrypt('a-bearer-token'),
    status: 'active',
  });

  const service = await Service.create({
    shortName: `RACEVC${Date.now()}`,
    title: 'Race Service',
    categoryId: new mongoose.Types.ObjectId(),
    provider: 'Test',
    uiType: 'web',
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', dockerImage: 'registry.example/race:1.0.0' }],
    repositoryTable: 'OTHER_SERVICES',
  });

  const scenario = await Scenario.create({
    projectId: project._id,
    title: 'Race Test Scenario',
    infrastructureId: infrastructure._id,
    topology: {
      yaml: '',
      nodes: [{ id: 'node-1', data: { serviceId: service._id.toString() } }],
      edges: [],
    },
  });
  scenarioId = scenario._id.toString();

  const app = express();
  app.use(express.json());
  app.use('/api', scenariosRoutesActual);
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

describe('POST /api/scenarios/:id/execute concurrency', () => {
  test('two parallel POSTs produce two distinct execution records', async () => {
    if (!mongoAvailable) return;

    // Fire both requests simultaneously.
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
        method: 'POST',
        headers: authHeader,
      }),
      fetch(`${baseUrl}/api/scenarios/${scenarioId}/execute`, {
        method: 'POST',
        headers: authHeader,
      }),
    ]);

    // Log error responses for debugging
    if (res1.status !== 200) {
      console.error('Request 1 failed:', res1.status, await res1.text());
    }
    if (res2.status !== 200) {
      console.error('Request 2 failed:', res2.status, await res2.text());
    }

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = (await res1.json()) as { executionId: string; status: string };
    const body2 = (await res2.json()) as { executionId: string; status: string };

    // Each response must carry a distinct execution id.
    expect(body1.executionId).toBeTruthy();
    expect(body2.executionId).toBeTruthy();
    expect(body1.executionId).not.toBe(body2.executionId);

    // The scenario document in MongoDB must contain exactly two executions.
    const scenario = await Scenario.findById(scenarioId);
    expect(scenario).toBeTruthy();
    expect(scenario!.executions.length).toBe(2);

    // Both executions must have unique ids.
    const execIds = scenario!.executions.map((e) => e._id!.toString());
    expect(new Set(execIds).size).toBe(2);

    // Both should be in a non-pending terminal-ish state (running or failed).
    for (const exec of scenario!.executions) {
      expect(exec.status).not.toBe('pending');
    }
  });
});
