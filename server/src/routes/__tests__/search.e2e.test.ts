import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Category } from '../../models/Category.js';
import { Service } from '../../models/Service.js';
import { Project } from '../../models/Project.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import servicesRoutes from '../services.routes.js';
import projectsRoutes from '../projects.routes.js';

/**
 * End-to-end tests for the search/filter query parameters of
 * `GET /api/services` and `GET /api/projects` (issue #39).
 *
 * The routes used to interpolate user input straight into a regular
 * expression, so a lone `(` — an unbalanced metacharacter — threw a
 * `SyntaxError` that `errorHandler` could only report as a 500, and any
 * metacharacter silently changed the meaning of the search. These tests pin
 * both halves of the contract: the endpoints stay on 200, and the term is
 * matched *literally*. A NUL byte is covered too: MongoDB rejects one inside
 * a `$regex` at the wire level, so it has to be stripped before the query is
 * built or the endpoint would still answer 500.
 *
 * Requires a MongoDB reachable at `mongodb://127.0.0.1:27017` (or
 * `SEED_TEST_MONGODB_URI` override). If unavailable, all tests are skipped.
 */

const TEST_DB_NAME = `secsim_search_e2e_test_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;

/** Fixture whose every searchable field carries regex metacharacters. */
const METACHAR_SERVICE = {
  shortName: 'CPPSA',
  title: 'C++ Static Analyzer (EU)',
  provider: 'Acme (EU)',
  description: 'Analyzes C++ code for INTACT',
};

/** Control fixture: no metacharacters anywhere. */
const PLAIN_SERVICE = {
  shortName: 'PLAINSVC',
  title: 'Plain Network Analyzer',
  provider: 'Beta Labs',
  description: 'No metacharacters here',
};

const METACHAR_PROJECT = {
  shortName: 'PRJMETA',
  title: 'Alpha (Pilot)',
  sector: 'Telecommunications' as const,
  leader: 'Gamma (NO)',
  description: 'Pilot deployment',
};

const PLAIN_PROJECT = {
  shortName: 'PRJPLAIN',
  title: 'Bravo Rollout',
  sector: 'Healthcare' as const,
  leader: 'Delta Labs',
  description: 'Rollout deployment',
};

type ServiceListResponse = {
  services: Array<{ shortName: string }>;
  total: number;
};

type ProjectListResponse = Array<{ shortName: string }>;

/** The NUL byte (U+0000): not a metacharacter, but rejected by MongoDB. */
const NUL = String.fromCharCode(0);

/** Build a URL with a single, correctly percent-encoded query parameter. */
const searchUrl = (path: string, param: string, value: string): string =>
  `${baseUrl}${path}?${param}=${encodeURIComponent(value)}`;

const getServices = async (param: string, value: string): Promise<Response> =>
  await fetch(searchUrl('/api/services', param, value), { headers: authHeader });

const getProjects = async (param: string, value: string): Promise<Response> =>
  await fetch(searchUrl('/api/projects', param, value), { headers: authHeader });

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    return;
  }

  const category = await Category.create({
    name: 'Search Fixtures',
    slug: 'search-fixtures',
    description: 'Category owning the #39 search fixtures',
  });

  await Service.create([
    { ...METACHAR_SERVICE, categoryId: category._id },
    { ...PLAIN_SERVICE, categoryId: category._id },
  ]);
  await Project.create([METACHAR_PROJECT, PLAIN_PROJECT]);

  const app = express();
  app.use(express.json());
  app.use('/api/services', servicesRoutes);
  app.use('/api/projects', projectsRoutes);
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

describe('GET /api/services search hardening (e2e)', () => {
  // Acceptance criterion #1 for issue #39.
  test('an unbalanced "(" returns 200 with results, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?search=(`, { headers: authHeader });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName)).toEqual([METACHAR_SERVICE.shortName]);
  });

  test('a metacharacter soup "().*+" returns 200 and matches nothing literally', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', '().*+');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.total).toBe(0);
  });

  test('an unbalanced "(" in provider returns 200 and filters literally', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('provider', '(');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName)).toEqual([METACHAR_SERVICE.shortName]);
  });

  test('a catastrophic-backtracking payload returns 200', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', '('.repeat(50) + 'a');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.total).toBe(0);
  });

  test('an ordinary search still matches, case-insensitively', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', 'analyzer');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName).sort()).toEqual([
      METACHAR_SERVICE.shortName,
      PLAIN_SERVICE.shortName,
    ]);
  });

  // The escape has to be semantic, not merely crash-avoidance: "C++" is a
  // literal substring of a fixture, while "C.*" must not match anything.
  test('"C++" is matched as a literal substring', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', 'C++');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName)).toEqual([METACHAR_SERVICE.shortName]);
  });

  test('"C.*" is not treated as a wildcard', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', 'C.*');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.total).toBe(0);
  });

  // A NUL byte is not a metacharacter, so escaping alone left it in the
  // pattern and MongoDB answered `Regular expression cannot contain an
  // embedded null byte` — a 500. Stripped, the term behaves like an empty one.
  test('a NUL byte in search returns 200, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', NUL);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName).sort()).toEqual([
      METACHAR_SERVICE.shortName,
      PLAIN_SERVICE.shortName,
    ]);
  });

  test('a NUL byte in the middle of a search term returns 200, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('search', `analy${NUL}zer`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName).sort()).toEqual([
      METACHAR_SERVICE.shortName,
      PLAIN_SERVICE.shortName,
    ]);
  });

  test('a NUL byte in provider returns 200, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await getServices('provider', NUL);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ServiceListResponse;
    expect(body.services.map((s) => s.shortName).sort()).toEqual([
      METACHAR_SERVICE.shortName,
      PLAIN_SERVICE.shortName,
    ]);
  });

  test('rejects unauthenticated requests', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/services?search=(`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects search hardening (e2e)', () => {
  test('an unbalanced "(" returns 200 with results, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/projects?search=(`, { headers: authHeader });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body.map((p) => p.shortName)).toEqual([METACHAR_PROJECT.shortName]);
  });

  test('a metacharacter soup "().*+" returns 200 and matches nothing literally', async () => {
    if (!mongoAvailable) return;

    const res = await getProjects('search', '().*+');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body).toHaveLength(0);
  });

  test('an unbalanced "(" in leader returns 200 and filters literally', async () => {
    if (!mongoAvailable) return;

    const res = await getProjects('leader', '(');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body.map((p) => p.shortName)).toEqual([METACHAR_PROJECT.shortName]);
  });

  test('a NUL byte in search returns 200, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await getProjects('search', NUL);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body.map((p) => p.shortName).sort()).toEqual([
      METACHAR_PROJECT.shortName,
      PLAIN_PROJECT.shortName,
    ]);
  });

  test('a NUL byte in leader returns 200, not 500', async () => {
    if (!mongoAvailable) return;

    const res = await getProjects('leader', NUL);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body.map((p) => p.shortName).sort()).toEqual([
      METACHAR_PROJECT.shortName,
      PLAIN_PROJECT.shortName,
    ]);
  });

  test('an ordinary search still matches, case-insensitively', async () => {
    if (!mongoAvailable) return;

    const res = await getProjects('search', 'rollout');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProjectListResponse;
    expect(body.map((p) => p.shortName)).toEqual([PLAIN_PROJECT.shortName]);
  });
});
