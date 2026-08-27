/**
 * Contract tests for services list slim mode (issue #99, F-PERF-006).
 *
 * Verifies that `GET /api/services?slim=true` returns only `shortName` and
 * `title` — a lightweight payload suitable for dropdown pickers that may
 * need to display up to 1000 services.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Service } from '../../models/Service.js';
import { seedCategories } from '../../seed/categories.seed.js';
import { seedServices } from '../../seed/services.seed.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import servicesRoutes from '../services.routes.js';

const TEST_DB_NAME = `secsim_services_slim_test_${Date.now()}`;
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
  authHeader = { Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('GET /api/services?slim=true (F-PERF-006)', () => {
  test('slim mode returns only shortName and title', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?slim=true&limit=50`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { services: Array<Record<string, unknown>> };
    expect(body.services.length).toBeGreaterThan(0);

    for (const service of body.services) {
      expect(service.shortName).toBeTruthy();
      expect(service.title).toBeTruthy();

      // Heavy fields must NOT be present
      expect(service.categoryId).toBeUndefined();
      expect(service.sectorId).toBeUndefined();
      expect(service.provider).toBeUndefined();
      expect(service.description).toBeUndefined();
      expect(service.versions).toBeUndefined();
      expect(service.inputs).toBeUndefined();
      expect(service.outputs).toBeUndefined();
      expect(service.versions).toBeUndefined();
    }
  });

  test('slim mode response is dramatically smaller than full response', async () => {
    if (!mongoAvailable) return;

    // Get slim
    const slimRes = await fetch(`${baseUrl}/api/services?slim=true&limit=50`, {
      headers: authHeader,
    });
    expect(slimRes.status).toBe(200);
    const slimBody = await slimRes.json();
    const slimSize = JSON.stringify(slimBody).length;

    // Get full
    const fullRes = await fetch(`${baseUrl}/api/services?limit=50`, {
      headers: authHeader,
    });
    expect(fullRes.status).toBe(200);
    const fullBody = await fullRes.json();
    const fullSize = JSON.stringify(fullBody).length;

    // Slim should be at least 90% smaller
    const ratio = slimSize / fullSize;
    expect(ratio).toBeLessThan(0.1);
  });

  test('slim mode respects pagination', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?slim=true&limit=5&skip=10`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: Array<{ shortName: string }>;
      total: number;
      limit: number;
      skip: number;
    };

    expect(body.services.length).toBeLessThanOrEqual(5);
    expect(body.total).toBeGreaterThan(5);
    expect(body.limit).toBe(5);
    expect(body.skip).toBe(10);
  });

  test('slim mode excludes deprecated services by default', async () => {
    if (!mongoAvailable) return;

    // Deprecate a seed service
    await Service.updateOne({ shortName: 'CSAM' }, { $set: { deprecated: true } });

    const res = await fetch(`${baseUrl}/api/services?slim=true&limit=100`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { services: Array<{ shortName: string }> };
    expect(body.services.some((s) => s.shortName === 'CSAM')).toBe(false);
  });

  test('slim mode includes deprecated when includeDeprecated=true', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?slim=true&includeDeprecated=true&limit=100`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { services: Array<{ shortName: string }> };
    expect(body.services.some((s) => s.shortName === 'CSAM')).toBe(true);
  });

  test('slim mode supports search', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?slim=true&search=secinterp&limit=10`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { services: Array<{ shortName: string; title: string }> };
    expect(body.services.length).toBeGreaterThan(0);

    // All results should match the search term
    for (const service of body.services) {
      const match =
        service.shortName.toLowerCase().includes('secinterp') ||
        service.title.toLowerCase().includes('secinterp');
      expect(match).toBe(true);
    }
  });

  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?slim=true`);
    expect(res.status).toBe(401);
  });
});
