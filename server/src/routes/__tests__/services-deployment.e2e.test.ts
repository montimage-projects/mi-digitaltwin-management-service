import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Category } from '../../models/Category.js';
import { Service } from '../../models/Service.js';
import { seedCategories } from '../../seed/categories.seed.js';
import { seedServices } from '../../seed/services.seed.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import servicesRoutes from '../services.routes.js';

/**
 * End-to-end coverage for milestone M0 (issue #188, playbook task 0.3 —
 * docs/playbooks/montimage-attack-detect-respond-plan.md):
 * `GET /api/services` must return the four Montimage modules — MAG,
 * HTTP-SIM, MMT-PROBE, AI4SOAR — each carrying a validated `deployment`
 * spec, and `POST`/`PUT` must persist a spec and reject invalid ones
 * with 400.
 *
 * Requires a MongoDB reachable at `mongodb://127.0.0.1:27017` (or
 * `SEED_TEST_MONGODB_URI` override). If unavailable, all tests are skipped.
 */

const TEST_DB_NAME = `secsim_deployment_e2e_test_${Date.now()}`;
const TEST_MONGODB_URI = `${process.env.SEED_TEST_MONGODB_URI ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'}/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  await seedCategories();
  await seedServices();

  const app = express();
  app.use(express.json());
  app.use('/api/services', servicesRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const token = jwt.sign(
    { userId: 'test-user', username: 'tester', role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  authHeader = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('GET /api/services — deployment spec (e2e, M0)', () => {
  test('returns the four Montimage modules with a validated deployment spec', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?limit=200`, { headers: authHeader });
    expect(res.status).toBe(200);

    const { services } = (await res.json()) as {
      services: {
        shortName: string;
        deployment?: {
          kind: string;
          role: string;
          attachMode?: string;
          exposePort?: boolean;
          containerPort?: number;
          securityContext?: { capabilities?: string[] };
          rbac?: { apiGroups: string[]; resources: string[]; verbs: string[] }[];
        };
      }[];
    };

    const byName = (name: string) => services.find((s) => s.shortName === name);

    expect(byName('MAG')?.deployment).toMatchObject({
      kind: 'Job',
      role: 'attack',
      exposePort: false,
    });
    expect(byName('HTTP-SIM')?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'target',
      containerPort: 8080,
      exposePort: true,
    });
    expect(byName('MMT-PROBE')?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'monitor',
      attachMode: 'sidecar',
      exposePort: false,
    });
    expect(byName('MMT-PROBE')?.deployment?.securityContext?.capabilities).toEqual(
      expect.arrayContaining(['NET_ADMIN', 'NET_RAW'])
    );
    expect(byName('AI4SOAR')?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'reaction',
      containerPort: 5000,
    });
    expect(byName('AI4SOAR')?.deployment?.rbac?.length).toBeGreaterThan(0);
  });
});

describe('POST /api/services — deployment spec (e2e)', () => {
  test('persists a valid deployment spec and returns it on GET /:id', async () => {
    if (!mongoAvailable) return;

    const category = await Category.findOne({ slug: 'attack' });
    expect(category).not.toBeNull();

    const deployment = {
      kind: 'Job',
      role: 'attack',
      exposePort: false,
      securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
      startOrder: 30,
    };

    const createRes = await fetch(`${baseUrl}/api/services`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        shortName: 'DEPLOY-E2E',
        title: 'Deployment spec e2e service',
        provider: 'Test Provider',
        categoryId: String(category!._id),
        deployment,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { _id: string };

    const getRes = await fetch(`${baseUrl}/api/services/${created._id}`, {
      headers: authHeader,
    });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { deployment?: Record<string, unknown> };
    expect(fetched.deployment).toMatchObject(deployment);
  });

  test('rejects an invalid deployment spec with 400', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        shortName: 'DEPLOY-BAD',
        title: 'Invalid deployment spec',
        provider: 'Test Provider',
        categoryId: '64b0000000000000000000aa',
        deployment: { kind: 'CronJob', role: 'attack', containerPort: -1 },
      }),
    });
    expect(res.status).toBe(400);

    // Nothing persisted.
    expect(await Service.findOne({ shortName: 'DEPLOY-BAD' })).toBeNull();
  });
});
