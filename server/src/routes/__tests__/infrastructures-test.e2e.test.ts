import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * End-to-end tests for the real infrastructure connection test (issue #18).
 *
 * `@kubernetes/client-node` is mocked — there is no cluster in CI/test
 * environments — while MongoDB is real (a disposable test database); if MongoDB
 * is unreachable, all tests skip. The `listNamespace` probe behaviour is
 * swapped per test to simulate a reachable cluster, an unreachable endpoint and
 * bad credentials.
 */

const { impl, CoreV1Api, AppsV1Api, KubeConfig, ApiException } = vi.hoisted(() => {
  class ApiException extends Error {
    code: number;
    body: unknown;
    constructor(code: number, message: string, body?: unknown) {
      super(message);
      this.code = code;
      this.body = body;
    }
  }

  // Per-test-controllable probe behaviour.
  const impl = {
    listNamespace: async (): Promise<unknown> => ({ items: [] }),
  };

  class CoreV1Api {}
  class AppsV1Api {}

  class KubeConfig {
    loadFromString(): void {}
    loadFromOptions(): void {}
    makeApiClient(ctor: unknown): unknown {
      if (ctor === CoreV1Api) {
        return { listNamespace: (...a: unknown[]) => impl.listNamespace(...(a as [])) };
      }
      return {};
    }
  }

  return { impl, CoreV1Api, AppsV1Api, KubeConfig, ApiException };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  ApiException,
}));

const { env } = await import('../../config/env.js');
const { encrypt } = await import('../../utils/encryption.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const infrastructuresRoutes = (await import('../infrastructures.routes.js')).default;

const TEST_DB_NAME = `secsim_infra_test_e2e_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;
let infraId: string;

type TestResult = {
  success: boolean;
  status: string;
  lastHealthCheck: string;
  message: string;
};

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const infrastructure = await Infrastructure.create({
    name: `k8s-conn-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.1:6443',
    credentials: encrypt('a-bearer-token'),
    status: 'inactive',
  });
  infraId = infrastructure._id.toString();

  const app = express();
  app.use(express.json());
  app.use('/api/infrastructures', infrastructuresRoutes);
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

describe('POST /api/infrastructures/:id/test (real connection test)', () => {
  test('reports success and marks the infrastructure active when the cluster answers', async () => {
    if (!mongoAvailable) return;
    impl.listNamespace = async () => ({ items: [] });

    const res = await fetch(`${baseUrl}/api/infrastructures/${infraId}/test`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TestResult;
    expect(body.success).toBe(true);
    expect(body.status).toBe('active');
    expect(body.message).toBe('Connection successful');

    const infra = await Infrastructure.findById(infraId).lean();
    expect(infra?.status).toBe('active');
    expect(infra?.lastHealthCheck).toBeTruthy();
  });

  test('reports failure (not a 500) when the cluster is unreachable', async () => {
    if (!mongoAvailable) return;
    impl.listNamespace = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:6443');
    };

    const res = await fetch(`${baseUrl}/api/infrastructures/${infraId}/test`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TestResult;
    expect(body.success).toBe(false);
    expect(body.status).toBe('error');
    expect(body.message).toContain('ECONNREFUSED');

    const infra = await Infrastructure.findById(infraId).lean();
    expect(infra?.status).toBe('error');
  });

  test('404s when the infrastructure does not exist', async () => {
    if (!mongoAvailable) return;
    const missing = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/api/infrastructures/${missing}/test`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(404);
  });

  test('400s for a malformed infrastructure id', async () => {
    if (!mongoAvailable) return;
    const res = await fetch(`${baseUrl}/api/infrastructures/not-an-object-id/test`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(400);
  });

  test('reports failure when the credentials are rejected (401)', async () => {
    if (!mongoAvailable) return;
    impl.listNamespace = async () => {
      throw new ApiException(401, 'Unauthorized', { message: 'invalid bearer token' });
    };

    const res = await fetch(`${baseUrl}/api/infrastructures/${infraId}/test`, {
      method: 'POST',
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TestResult;
    expect(body.success).toBe(false);
    expect(body.status).toBe('error');

    const infra = await Infrastructure.findById(infraId).lean();
    expect(infra?.status).toBe('error');
  });
});
