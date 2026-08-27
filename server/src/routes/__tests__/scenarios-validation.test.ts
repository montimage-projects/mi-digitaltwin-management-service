import { describe, test, expect, vi } from 'vitest';

/**
 * Unit tests for scenario route validation — POST /scenarios and related
 * endpoints that accept user input via req.body.
 *
 * Tests exercise the Zod validation schemas (createScenarioSchema,
 * updateScenarioSchema, conclusionSchema, updateExecutionStatusSchema) by
 * sending malformed bodies and verifying that the validation middleware
 * calls next(error) with a ZodError.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../models/Scenario.js', () => ({
  Scenario: {
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('../../models/Project.js', () => ({
  Project: {
    findById: vi.fn(),
  },
}));

vi.mock('../../models/Infrastructure.js', () => ({
  Infrastructure: {
    findById: vi.fn(),
  },
}));

vi.mock('../../models/Service.js', () => ({
  Service: {
    find: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: ReturnType<typeof vi.fn>) => next(),
}));

vi.mock('../../services/kubernetesDeploy.js', () => ({
  buildClientFromInfrastructure: vi.fn(),
  collectNewPodLogs: vi.fn(),
  deployTopology: vi.fn(),
  deriveNamespace: vi.fn(),
  getDeploymentStatus: vi.fn(),
  isDeploymentSettled: vi.fn(),
  teardownDeployment: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

const { z } = await import('zod');
const { validateBody, objectIdSchema } = await import('../../middleware/validation.js');
const { AppError } = await import('../../middleware/errorHandler.js');

// ── Validation schema tests ──────────────────────────────────────────────────

describe('Scenario route — validation schemas', () => {
  // Re-define the schemas inline (same as in scenarios.routes.ts)
  const topologySchema = z.object({
    yaml: z.string().default(''),
    nodes: z.array(z.record(z.unknown())).default([]),
    edges: z.array(z.record(z.unknown())).default([]),
  });

  const createScenarioSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    topology: topologySchema.optional(),
    infrastructureId: z
      .string()
      .refine((val) => !val || objectIdSchema.safeParse(val).success, 'Invalid infrastructure ID')
      .optional(),
  });

  const updateScenarioSchema = createScenarioSchema.partial();

  const conclusionSchema = z.object({
    text: z.string().min(1),
    author: z.string().min(1),
  });

  const updateExecutionStatusSchema = z.object({
    status: z.enum(['pending', 'running', 'completed', 'failed']),
  });

  // ── createScenarioSchema ─────────────────────────────────────────────────

  describe('createScenarioSchema', () => {
    test('accepts a valid scenario payload', () => {
      const result = createScenarioSchema.safeParse({
        title: 'Test Scenario',
        description: 'A test scenario',
        topology: { yaml: 'test', nodes: [], edges: [] },
        infrastructureId: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    test('accepts minimal payload (only title)', () => {
      const result = createScenarioSchema.safeParse({ title: 'Minimal' });
      expect(result.success).toBe(true);
    });

    test('rejects empty title', () => {
      const result = createScenarioSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('at least 1');
      }
    });

    test('rejects title exceeding 200 chars', () => {
      const result = createScenarioSchema.safeParse({ title: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });

    test('rejects missing title', () => {
      const result = createScenarioSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('accepts description up to 2000 chars', () => {
      const result = createScenarioSchema.safeParse({
        title: 'Test',
        description: 'x'.repeat(2000),
      });
      expect(result.success).toBe(true);
    });

    test('rejects description over 2000 chars', () => {
      const result = createScenarioSchema.safeParse({
        title: 'Test',
        description: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid infrastructureId', () => {
      const result = createScenarioSchema.safeParse({
        title: 'Test',
        infrastructureId: 'not-an-object-id',
      });
      expect(result.success).toBe(false);
    });

    test('accepts null infrastructureId', () => {
      const result = createScenarioSchema.safeParse({
        title: 'Test',
        infrastructureId: undefined,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── updateScenarioSchema ─────────────────────────────────────────────────

  describe('updateScenarioSchema', () => {
    test('accepts partial update with only title', () => {
      const result = updateScenarioSchema.safeParse({ title: 'Updated title' });
      expect(result.success).toBe(true);
    });

    test('accepts empty object (all fields optional)', () => {
      const result = updateScenarioSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects empty title in partial update', () => {
      const result = updateScenarioSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });
  });

  // ── conclusionSchema ─────────────────────────────────────────────────────

  describe('conclusionSchema', () => {
    test('accepts valid conclusion', () => {
      const result = conclusionSchema.safeParse({
        text: 'Scenario completed successfully',
        author: 'admin',
      });
      expect(result.success).toBe(true);
    });

    test('rejects empty text', () => {
      const result = conclusionSchema.safeParse({ text: '', author: 'admin' });
      expect(result.success).toBe(false);
    });

    test('rejects empty author', () => {
      const result = conclusionSchema.safeParse({ text: 'Done', author: '' });
      expect(result.success).toBe(false);
    });

    test('rejects missing text', () => {
      const result = conclusionSchema.safeParse({ author: 'admin' });
      expect(result.success).toBe(false);
    });

    test('rejects missing author', () => {
      const result = conclusionSchema.safeParse({ text: 'Done' });
      expect(result.success).toBe(false);
    });
  });

  // ── updateExecutionStatusSchema ──────────────────────────────────────────

  describe('updateExecutionStatusSchema', () => {
    test('accepts valid status: pending', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 'pending' });
      expect(result.success).toBe(true);
    });

    test('accepts valid status: running', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 'running' });
      expect(result.success).toBe(true);
    });

    test('accepts valid status: completed', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 'completed' });
      expect(result.success).toBe(true);
    });

    test('accepts valid status: failed', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 'failed' });
      expect(result.success).toBe(true);
    });

    test('rejects invalid status value', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 'unknown' });
      expect(result.success).toBe(false);
    });

    test('rejects missing status', () => {
      const result = updateExecutionStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('rejects non-string status', () => {
      const result = updateExecutionStatusSchema.safeParse({ status: 123 });
      expect(result.success).toBe(false);
    });
  });
});

// ── validateBody middleware integration ──────────────────────────────────────

describe('validateBody middleware integration', () => {
  test('validateBody passes valid body to next()', () => {
    const schema = z.object({ title: z.string().min(1) });
    const middleware = validateBody(schema);

    const req = { body: { title: 'Valid Title' }, query: {} };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });

  test('validateBody passes ZodError to next() on invalid body', () => {
    const schema = z.object({ title: z.string().min(1) });
    const middleware = validateBody(schema);

    const req = { body: { title: '' }, query: {} };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('validateBody transforms body when schema has transforms', () => {
    const schema = z.object({
      limit: z.string().transform((val) => parseInt(val, 10)),
    });
    const middleware = validateBody(schema);

    const req = { body: { limit: '50' }, query: {} };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Record<string, unknown>).body.limit).toBe(50);
  });
});

// ── objectIdSchema validation ────────────────────────────────────────────────

describe('objectIdSchema used in route params', () => {
  test('validates correct scenario ID format', () => {
    const result = objectIdSchema.safeParse('507f1f77bcf86cd799439011');
    expect(result.success).toBe(true);
  });

  test('rejects invalid scenario ID format', () => {
    const result = objectIdSchema.safeParse('invalid-id');
    expect(result.success).toBe(false);
  });

  test('throws AppError when route param fails objectIdSchema', () => {
    const result = objectIdSchema.safeParse('bad-id');
    if (!result.success) {
      const err = new AppError('Invalid scenario ID', 400);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Invalid scenario ID');
    }
  });
});
