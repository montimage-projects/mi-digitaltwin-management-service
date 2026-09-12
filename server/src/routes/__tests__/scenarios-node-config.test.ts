import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';

/**
 * Contract tests for per-node config overrides in scenario topology nodes
 * (issue #189, playbook task 0.4 —
 * docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Drives the real `scenarios.routes` router over HTTP with the Mongoose
 * models mocked — no MongoDB required. Verifies that
 * `node.data.config.env`/`args` overrides are accepted, persisted and
 * returned intact (unknown keys preserved), and that malformed overrides
 * (non-string env names, non-string-array args, …) are rejected with 400 by
 * the Zod validator on both create and update.
 */

// ── Hoisted mock state ───────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  interface Chain {
    populate(): Chain;
    sort(): Chain;
    lean(): Promise<unknown>;
  }
  const chainable = (result: unknown): Chain => ({
    populate: () => chainable(result),
    sort: () => chainable(result),
    lean: () => Promise.resolve(result),
  });
  return {
    chainable,
    /** Every `new Scenario(data)` lands here so findById can echo it back. */
    created: [] as Record<string, unknown>[],
    /** Last `$set` update received by `Scenario.findByIdAndUpdate`. */
    lastUpdate: null as Record<string, unknown> | null,
  };
});

vi.mock('../../models/Scenario.js', () => {
  class MockScenario {
    static find = vi.fn(() => h.chainable([]));
    static findById = vi.fn((id: unknown) =>
      h.chainable(h.created.find((d) => String(d._id) === String(id)) ?? null)
    );
    static findByIdAndUpdate = vi.fn((id: unknown, update: { $set?: Record<string, unknown> }) => {
      h.lastUpdate = update ?? null;
      return h.chainable({ _id: id, ...(update?.$set ?? {}) });
    });
    static findByIdAndDelete = vi.fn(() => h.chainable(null));
    static findOneAndUpdate = vi.fn(() => h.chainable(null));
    save = vi.fn(async () => this);
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data, { _id: '64b0000000000000000000bb' });
      h.created.push(this as unknown as Record<string, unknown>);
    }
  }
  return { Scenario: MockScenario };
});

vi.mock('../../models/Project.js', () => ({
  Project: {
    findById: vi.fn((id: unknown) => h.chainable({ _id: id, shortName: 'PROJ', title: 'Project' })),
  },
}));

vi.mock('../../models/Infrastructure.js', () => ({
  Infrastructure: {
    findById: vi.fn(() => h.chainable(null)),
  },
}));

vi.mock('../../models/Service.js', () => ({
  Service: {
    find: vi.fn(() => h.chainable([])),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../services/kubernetesDeploy.js', () => ({
  buildClientFromInfrastructure: vi.fn(),
  teardownDeployment: vi.fn(),
}));

vi.mock('../../services/scenarioExecution.js', () => ({
  executeScenario: vi.fn(),
}));

vi.mock('../../services/scenarioSSE.js', () => ({
  runSSEStream: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

const { errorHandler } = await import('../../middleware/errorHandler.js');
const scenariosRoutes = (await import('../scenarios.routes.js')).default;

// ── App fixture ──────────────────────────────────────────────────────────────

let server: ReturnType<Express['listen']>;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', scenariosRoutes);
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
  h.lastUpdate = null;
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ID = '64b0000000000000000000aa';
const SCENARIO_ID = '64b0000000000000000000bb';

const post = (body: unknown) =>
  fetch(`${baseUrl}/api/projects/${PROJECT_ID}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const put = (id: string, body: unknown) =>
  fetch(`${baseUrl}/api/scenarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const nodeWithConfig = () => ({
  id: 'node-mag',
  type: 'service',
  position: { x: 10, y: 20 },
  data: {
    serviceId: '64b0000000000000000000cc',
    label: 'MAG',
    config: {
      env: [{ name: 'ATTACK_PROFILE', value: 'synflood' }],
      args: ['mag', 'synflood', '--target-ip', '10.0.0.5'],
      // Forward-compatible keys must round-trip untouched (task 3.3).
      configFiles: [{ mountPath: '/opt/mag/mag.conf', content: 'profile=synflood' }],
    },
  },
});

const scenarioBody = (nodes: unknown[]) => ({
  title: 'Attack scenario',
  topology: { yaml: '', nodes, edges: [] },
});

interface ScenarioDoc {
  topology?: { nodes?: Record<string, unknown>[] };
}

// ── POST /api/projects/:projectId/scenarios — node config overrides ─────────

describe('POST /api/projects/:projectId/scenarios — node config overrides', () => {
  test('accepts and persists config.env and config.args overrides intact', async () => {
    const res = await post(scenarioBody([nodeWithConfig()]));
    expect(res.status).toBe(201);

    const body = (await res.json()) as ScenarioDoc;
    const node = body.topology?.nodes?.[0] as Record<string, unknown>;
    // React Flow fields and unknown config keys survive the round-trip.
    expect(node.position).toEqual({ x: 10, y: 20 });
    const data = node.data as Record<string, unknown>;
    expect(data.label).toBe('MAG');
    const config = data.config as Record<string, unknown>;
    expect(config.env).toEqual([{ name: 'ATTACK_PROFILE', value: 'synflood' }]);
    expect(config.args).toEqual(['mag', 'synflood', '--target-ip', '10.0.0.5']);
    expect(config.configFiles).toEqual([
      { mountPath: '/opt/mag/mag.conf', content: 'profile=synflood' },
    ]);
  });

  test('accepts nodes without data or config (unchanged behavior)', async () => {
    const res = await post(scenarioBody([{ id: 'n1' }, { id: 'n2', data: { label: 'x' } }]));
    expect(res.status).toBe(201);
  });

  test('accepts an empty config object', async () => {
    const res = await post(scenarioBody([{ id: 'n1', data: { serviceId: 's', config: {} } }]));
    expect(res.status).toBe(201);
  });

  test('rejects config.args as a non-array', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).args = 'mag synflood';
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects config.args containing non-strings', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).args = ['mag', 42];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects config.env as a non-array', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = 'ATTACK_PROFILE=synflood';
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects env entries without a name', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = [{ value: 'synflood' }];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects env entries with a non-string name', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = [{ name: 42, value: 'x' }];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects env entries with a non-string value', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = [{ name: 'A', value: 1 }];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('rejects env entries with an unknown fromEdge value', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = [{ name: 'A', fromEdge: 'bogus' }];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(400);
  });

  test('accepts env entries with a valid fromEdge value', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).env = [
      { name: 'TARGET_URL', fromEdge: 'target' },
    ];
    const res = await post(scenarioBody([node]));
    expect(res.status).toBe(201);
  });

  test('rejects config as a non-object', async () => {
    const res = await post(scenarioBody([{ id: 'n1', data: { serviceId: 's', config: 'env' } }]));
    expect(res.status).toBe(400);
  });

  test('rejects a non-object data field', async () => {
    const res = await post(scenarioBody([{ id: 'n1', data: 'oops' }]));
    expect(res.status).toBe(400);
  });
});

// ── PUT /api/scenarios/:id — node config overrides ──────────────────────────

describe('PUT /api/scenarios/:id — node config overrides', () => {
  test('persists config overrides via $set intact', async () => {
    const res = await put(SCENARIO_ID, scenarioBody([nodeWithConfig()]));
    expect(res.status).toBe(200);

    const set = h.lastUpdate?.$set as { topology?: { nodes?: Record<string, unknown>[] } };
    const node = set?.topology?.nodes?.[0] as Record<string, unknown>;
    const config = (node.data as Record<string, unknown>).config as Record<string, unknown>;
    expect(config.env).toEqual([{ name: 'ATTACK_PROFILE', value: 'synflood' }]);
    expect(config.args).toEqual(['mag', 'synflood', '--target-ip', '10.0.0.5']);
    expect(config.configFiles).toBeTruthy();
  });

  test('rejects malformed config.args on update', async () => {
    const node = nodeWithConfig();
    (node.data.config as Record<string, unknown>).args = [42];
    const res = await put(SCENARIO_ID, scenarioBody([node]));
    expect(res.status).toBe(400);
  });
});
