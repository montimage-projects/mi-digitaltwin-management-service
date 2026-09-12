import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';

/**
 * Contract tests for the optional `Service.deployment` sub-document
 * (issue #188, playbook task 0.3 —
 * docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Drives the real `services.routes` router over HTTP with the Mongoose
 * models mocked — no MongoDB required. Verifies that a valid deployment
 * spec is accepted, persisted and returned, and that invalid specs
 * (unknown kind, non-string capability, negative port, …) are rejected
 * with 400 by the Zod validator.
 */

// ── Hoisted mock state ───────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  interface Chain {
    populate(): Chain;
    sort(): Chain;
    skip(): Chain;
    limit(): Chain;
    lean(): Promise<unknown>;
  }
  const chainable = (result: unknown): Chain => ({
    populate: () => chainable(result),
    sort: () => chainable(result),
    skip: () => chainable(result),
    limit: () => chainable(result),
    lean: () => Promise.resolve(result),
  });
  return {
    chainable,
    /** Every `new Service(data)` lands here so findById can echo it back. */
    created: [] as Record<string, unknown>[],
    /** What `Service.find()` resolves to in the list endpoint. */
    findResult: { docs: [] as Record<string, unknown>[] },
  };
});

vi.mock('../../models/Service.js', () => {
  class MockService {
    static find = vi.fn(() => h.chainable(h.findResult.docs));
    static findOne = vi.fn(async () => null);
    static findById = vi.fn((id: unknown) =>
      h.chainable(h.created.find((d) => d._id === id) ?? null)
    );
    static findByIdAndUpdate = vi.fn((id: unknown, update: { $set?: Record<string, unknown> }) =>
      h.chainable({ _id: id, ...(update?.$set ?? {}) })
    );
    static findByIdAndDelete = vi.fn(() => h.chainable(null));
    static countDocuments = vi.fn(async () => h.findResult.docs.length);
    save = vi.fn(async () => this);
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data, { _id: '64b0000000000000000000dd' });
      h.created.push(this as unknown as Record<string, unknown>);
    }
  }
  return { Service: MockService };
});

vi.mock('../../models/Category.js', () => ({
  Category: {
    findById: vi.fn((id: unknown) => h.chainable({ _id: id, name: 'Cat', slug: 'cat' })),
  },
}));

vi.mock('../../models/Sector.js', () => ({
  Sector: {
    findById: vi.fn((id: unknown) => h.chainable({ _id: id, name: 'Sec', slug: 'sec' })),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

const { errorHandler } = await import('../../middleware/errorHandler.js');
const servicesRoutes = (await import('../services.routes.js')).default;

// ── App fixture ──────────────────────────────────────────────────────────────

let server: ReturnType<Express['listen']>;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/services', servicesRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve(undefined)));
});

beforeEach(() => {
  h.created.length = 0;
  h.findResult.docs = [];
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const post = (body: unknown) =>
  fetch(`${baseUrl}/api/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const put = (id: string, body: unknown) =>
  fetch(`${baseUrl}/api/services/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const VALID_ID = '64b0000000000000000000dd';

const validService = {
  shortName: 'DEPLOY-SVC',
  title: 'Deployable service',
  categoryId: '64b0000000000000000000aa',
  provider: 'Test Provider',
};

/** Every field the spec declares — exercises the whole schema at once. */
const fullDeployment = {
  kind: 'Deployment',
  role: 'monitor',
  attachMode: 'sidecar',
  containerPort: 8080,
  exposePort: false,
  args: ['-i', 'eth0'],
  env: [
    { name: 'HOST_INTERFACE', value: 'eth0' },
    { name: 'TARGET_IP', fromEdge: 'target' },
  ],
  configFiles: [{ mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'security = {};' }],
  volumes: [{ name: 'reports', mountPath: '/reports', emptyDir: true }],
  securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'], privileged: false },
  hostNetwork: false,
  rbac: [{ apiGroups: [''], resources: ['pods'], verbs: ['delete'] }],
  readinessPath: '/health',
  startOrder: 10,
};

// ── POST /api/services ───────────────────────────────────────────────────────

describe('POST /api/services — deployment spec (issue #188)', () => {
  test('accepts, persists and returns a complete valid deployment spec', async () => {
    const res = await post({ ...validService, deployment: fullDeployment });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { deployment?: Record<string, unknown> };
    expect(body.deployment).toMatchObject(fullDeployment);

    // The doc handed to Mongoose carries the validated spec.
    const saved = h.created.find((d) => d.shortName === 'DEPLOY-SVC');
    expect(saved).toBeDefined();
    expect(saved?.deployment).toMatchObject(fullDeployment);
    expect(saved?.save).toHaveBeenCalled();
  });

  test('accepts a service without a deployment spec (field is optional)', async () => {
    const res = await post(validService);
    expect(res.status).toBe(201);

    const body = (await res.json()) as { deployment?: unknown };
    expect(body.deployment).toBeUndefined();
  });

  test('accepts a minimal spec with only the required kind/role', async () => {
    const res = await post({
      ...validService,
      deployment: { kind: 'Job', role: 'attack' },
    });
    expect(res.status).toBe(201);
  });

  test.each([
    ['unknown kind', { kind: 'CronJob', role: 'generic' }],
    ['missing kind', { role: 'generic' }],
    ['unknown role', { kind: 'Deployment', role: 'bogus' }],
    ['negative containerPort', { kind: 'Deployment', role: 'target', containerPort: -1 }],
    ['zero containerPort', { kind: 'Deployment', role: 'target', containerPort: 0 }],
    ['containerPort above 65535', { kind: 'Deployment', role: 'target', containerPort: 70000 }],
    ['non-integer containerPort', { kind: 'Deployment', role: 'target', containerPort: 80.5 }],
    [
      'non-string capability',
      { kind: 'Deployment', role: 'monitor', securityContext: { capabilities: ['NET_ADMIN', 42] } },
    ],
    [
      'unknown fromEdge',
      { kind: 'Deployment', role: 'generic', env: [{ name: 'X', fromEdge: 'bogus' }] },
    ],
    [
      'emptyDir not true',
      {
        kind: 'Deployment',
        role: 'generic',
        volumes: [{ name: 'v', mountPath: '/v', emptyDir: false }],
      },
    ],
    ['relative readinessPath', { kind: 'Deployment', role: 'generic', readinessPath: 'health' }],
    ['unknown top-level key', { kind: 'Deployment', role: 'generic', bogus: 1 }],
    ['non-object deployment', 'not-an-object'],
  ])('rejects %s with 400', async (_label, deployment) => {
    const res = await post({ ...validService, deployment });
    expect(res.status).toBe(400);
  });
});

// ── PUT /api/services/:id ────────────────────────────────────────────────────

describe('PUT /api/services/:id — deployment spec (issue #188)', () => {
  test('accepts and returns a deployment spec update', async () => {
    const res = await put(VALID_ID, {
      deployment: { kind: 'Job', role: 'attack', exposePort: false, startOrder: 30 },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { deployment?: Record<string, unknown> };
    expect(body.deployment).toMatchObject({ kind: 'Job', role: 'attack', startOrder: 30 });
  });

  test.each([
    ['unknown kind', { kind: 'StatefulSet', role: 'generic' }],
    ['negative containerPort', { kind: 'Deployment', role: 'target', containerPort: -80 }],
    [
      'non-string capability',
      { kind: 'Deployment', role: 'monitor', securityContext: { capabilities: [123] } },
    ],
    ['unknown nested key', { kind: 'Deployment', role: 'generic', env: [{ name: 'X', bogus: 1 }] }],
  ])('rejects %s with 400', async (_label, deployment) => {
    const res = await put(VALID_ID, { deployment });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/services ────────────────────────────────────────────────────────

describe('GET /api/services — deployment spec (issue #188)', () => {
  test('returns the stored deployment spec in list responses', async () => {
    h.findResult.docs = [
      {
        _id: VALID_ID,
        shortName: 'MMT-PROBE',
        title: 'MMT Traffic Analysis Probe',
        deployment: {
          kind: 'Deployment',
          role: 'monitor',
          attachMode: 'sidecar',
          securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
        },
      },
    ];

    const res = await fetch(`${baseUrl}/api/services?limit=10`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: { shortName: string; deployment?: Record<string, unknown> }[];
    };
    expect(body.services[0].deployment).toMatchObject({
      kind: 'Deployment',
      role: 'monitor',
      attachMode: 'sidecar',
    });
  });
});
