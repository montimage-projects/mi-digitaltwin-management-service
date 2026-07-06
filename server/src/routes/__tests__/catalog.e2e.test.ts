import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Category } from '../../models/Category.js';
import { Service } from '../../models/Service.js';
import { seedSectors } from '../../seed/sectors.seed.js';
import { seedCategories } from '../../seed/categories.seed.js';
import { seedServices } from '../../seed/services.seed.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import categoriesRoutes from '../categories.routes.js';
import servicesRoutes from '../services.routes.js';

/**
 * End-to-end tests driving the real Express routers over HTTP.
 *
 * Exercises `GET /api/categories` and `GET /api/services` against a live
 * MongoDB (a dedicated, disposable test database — never the app's own
 * `MONGODB_URI`) to confirm that deprecated catalog entries introduced by
 * the seed refresh (issues #5, #6, #7) are excluded by default and only
 * returned with `?includeDeprecated=true`.
 *
 * Requires a MongoDB reachable at `mongodb://127.0.0.1:27017` (or
 * `SEED_TEST_MONGODB_URI` override). If unavailable, all tests are skipped.
 */

const TEST_DB_NAME = `secsim_catalog_e2e_test_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

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

  await seedSectors();
  await seedCategories();
  await seedServices();

  // Fixture: a category and service that a catalog refresh has deprecated,
  // to verify the list endpoints hide them by default.
  await Category.updateOne({ slug: 'dev-services' }, { $set: { deprecated: true } });
  await Service.updateOne({ shortName: 'CSAM' }, { $set: { deprecated: true } });

  const app = express();
  app.use(express.json());
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/services', servicesRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const token = jwt.sign({ userId: 'test-user', username: 'test', role: 'admin' }, env.JWT_SECRET, {
    expiresIn: '5m',
  });
  authHeader = { Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('GET /api/categories (e2e)', () => {
  test('excludes deprecated categories by default', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/categories`, { headers: authHeader });
    expect(res.status).toBe(200);
    const categories = (await res.json()) as Array<{ slug: string }>;

    expect(categories.some((c) => c.slug === 'dev-services')).toBe(false);
    expect(categories.some((c) => c.slug === 'ops-services')).toBe(true);
  });

  test('includes deprecated categories when includeDeprecated=true', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/categories?includeDeprecated=true`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const categories = (await res.json()) as Array<{ slug: string }>;

    expect(categories.some((c) => c.slug === 'dev-services')).toBe(true);
  });

  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/categories`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/services (e2e)', () => {
  test('excludes deprecated services by default', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?table=INTACT_TOOLBOX&limit=100`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { services: Array<{ shortName: string }> };

    expect(body.services.some((s) => s.shortName === 'CSAM')).toBe(false);
    expect(body.services.some((s) => s.shortName === 'SECINTERP')).toBe(true);
  });

  test('includes deprecated services when includeDeprecated=true', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(
      `${baseUrl}/api/services?table=INTACT_TOOLBOX&limit=100&includeDeprecated=true`,
      { headers: authHeader }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { services: Array<{ shortName: string }> };

    expect(body.services.some((s) => s.shortName === 'CSAM')).toBe(true);
  });

  test('the refreshed Infrastructure list (OTHER_SERVICES) is reachable and non-empty', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?table=OTHER_SERVICES&limit=100`, {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { services: Array<{ shortName: string }>; total: number };

    expect(body.total).toBeGreaterThan(0);
    expect(body.services.some((s) => s.shortName === 'ORO-5GLAB')).toBe(true);
  });
});
