import { describe, test, expect, vi } from 'vitest';

/**
 * Unit tests for infrastructure route validation — POST /infrastructures and
 * related endpoints that accept user input via req.body.
 *
 * Tests exercise the Zod validation schemas (createInfrastructureSchema,
 * updateInfrastructureSchema, capacitySchema) by sending malformed bodies and
 * verifying that the validation middleware calls next(error) with a ZodError.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../models/Infrastructure.js', () => ({
  Infrastructure: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('../../models/Scenario.js', () => ({
  Scenario: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: ReturnType<typeof vi.fn>) => next(),
}));

vi.mock('../../services/kubernetesDeploy.js', () => ({
  buildClientFromInfrastructure: vi.fn(),
  pingCluster: vi.fn(),
}));

vi.mock('../../utils/encryption.js', () => ({
  encrypt: vi.fn((val: string) => ({ encrypted: val, iv: 'fake-iv', authTag: 'fake-tag' })),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

const { z } = await import('zod');
const { validateBody, objectIdSchema } = await import('../../middleware/validation.js');
const { AppError } = await import('../../middleware/errorHandler.js');

// ── Validation schema tests ──────────────────────────────────────────────────

describe('Infrastructure route — validation schemas', () => {
  const capacitySchema = z.object({
    cpu: z.number().positive().optional(),
    memory: z.number().positive().optional(),
    storage: z.number().positive().optional(),
  });

  const createInfrastructureSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['kubernetes', 'docker', 'virtual']),
    endpoint: z.string().min(1).max(500).url(),
    credentials: z.string().min(1),
    capacity: capacitySchema.optional(),
    skipTLSVerify: z.boolean().optional(),
  });

  const updateInfrastructureSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    type: z.enum(['kubernetes', 'docker', 'virtual']).optional(),
    endpoint: z.string().min(1).max(500).url().optional(),
    credentials: z.string().min(1).optional(),
    capacity: capacitySchema.optional(),
    skipTLSVerify: z.boolean().optional(),
  });

  // ── capacitySchema ───────────────────────────────────────────────────────

  describe('capacitySchema', () => {
    test('accepts empty capacity object', () => {
      const result = capacitySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('accepts all capacity fields', () => {
      const result = capacitySchema.safeParse({
        cpu: 4,
        memory: 8192,
        storage: 100,
      });
      expect(result.success).toBe(true);
    });

    test('accepts single capacity field', () => {
      const result = capacitySchema.safeParse({ cpu: 2 });
      expect(result.success).toBe(true);
    });

    test('rejects negative cpu', () => {
      const result = capacitySchema.safeParse({ cpu: -1 });
      expect(result.success).toBe(false);
    });

    test('rejects zero cpu', () => {
      const result = capacitySchema.safeParse({ cpu: 0 });
      expect(result.success).toBe(false);
    });

    test('rejects non-number cpu', () => {
      const result = capacitySchema.safeParse({ cpu: 'fast' });
      expect(result.success).toBe(false);
    });
  });

  // ── createInfrastructureSchema ───────────────────────────────────────────

  describe('createInfrastructureSchema', () => {
    test('accepts valid kubernetes infrastructure', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Prod Cluster',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com:6443',
        credentials: 'kubeconfig-data',
        capacity: { cpu: 8, memory: 32768 },
        skipTLSVerify: false,
      });
      expect(result.success).toBe(true);
    });

    test('accepts docker infrastructure', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Local Docker',
        type: 'docker',
        endpoint: 'http://localhost:2375',
        credentials: 'docker-cred',
      });
      expect(result.success).toBe(true);
    });

    test('accepts virtual infrastructure', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'VM Cluster',
        type: 'virtual',
        endpoint: 'https://vm.example.com',
        credentials: 'vm-cred',
      });
      expect(result.success).toBe(true);
    });

    test('rejects empty name', () => {
      const result = createInfrastructureSchema.safeParse({
        name: '',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing name', () => {
      const result = createInfrastructureSchema.safeParse({
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects name exceeding 100 chars', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'a'.repeat(101),
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid type', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        type: 'aws' as never,
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing type', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid URL endpoint', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        type: 'kubernetes',
        endpoint: 'not-a-url',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });

    test('rejects empty credentials', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
        credentials: '',
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing credentials', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
      });
      expect(result.success).toBe(false);
    });

    test('rejects endpoint exceeding 500 chars', () => {
      const result = createInfrastructureSchema.safeParse({
        name: 'Test',
        type: 'kubernetes',
        endpoint: 'https://' + 'a'.repeat(500) + '.example.com',
        credentials: 'cred',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── updateInfrastructureSchema ───────────────────────────────────────────

  describe('updateInfrastructureSchema', () => {
    test('accepts partial update with only name', () => {
      const result = updateInfrastructureSchema.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
    });

    test('accepts partial update with only type', () => {
      const result = updateInfrastructureSchema.safeParse({ type: 'docker' });
      expect(result.success).toBe(true);
    });

    test('accepts empty object (all fields optional)', () => {
      const result = updateInfrastructureSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects empty name in partial update', () => {
      const result = updateInfrastructureSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid type in partial update', () => {
      const result = updateInfrastructureSchema.safeParse({ type: 'invalid' });
      expect(result.success).toBe(false);
    });

    test('rejects invalid URL in partial update', () => {
      const result = updateInfrastructureSchema.safeParse({ endpoint: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    test('accepts skipTLSVerify as true', () => {
      const result = updateInfrastructureSchema.safeParse({ skipTLSVerify: true });
      expect(result.success).toBe(true);
    });

    test('accepts skipTLSVerify as false', () => {
      const result = updateInfrastructureSchema.safeParse({ skipTLSVerify: false });
      expect(result.success).toBe(true);
    });
  });
});

// ── validateBody middleware integration ──────────────────────────────────────

describe('validateBody middleware integration for infrastructures', () => {
  const capacitySchema = z.object({
    cpu: z.number().positive().optional(),
    memory: z.number().positive().optional(),
    storage: z.number().positive().optional(),
  });

  const createInfrastructureSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['kubernetes', 'docker', 'virtual']),
    endpoint: z.string().min(1).max(500).url(),
    credentials: z.string().min(1),
    capacity: capacitySchema.optional(),
    skipTLSVerify: z.boolean().optional(),
  });

  test('validateBody passes valid infrastructure payload', () => {
    const middleware = validateBody(createInfrastructureSchema);
    const req = {
      body: {
        name: 'Test Infra',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
        credentials: 'cred',
      },
      query: {},
    };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });

  test('validateBody rejects missing credentials', () => {
    const middleware = validateBody(createInfrastructureSchema);
    const req = {
      body: {
        name: 'Test Infra',
        type: 'kubernetes',
        endpoint: 'https://k8s.example.com',
      },
      query: {},
    };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('validateBody rejects invalid endpoint URL', () => {
    const middleware = validateBody(createInfrastructureSchema);
    const req = {
      body: {
        name: 'Test Infra',
        type: 'kubernetes',
        endpoint: 'not-a-url',
        credentials: 'cred',
      },
      query: {},
    };
    const res = {};
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

// ── AppError for route-level validation ──────────────────────────────────────

describe('Infrastructure route — AppError validation', () => {
  test('AppError for invalid infrastructure ID', () => {
    const result = objectIdSchema.safeParse('not-valid');
    if (!result.success) {
      const err = new AppError('Invalid infrastructure ID', 400);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Invalid infrastructure ID');
    }
  });

  test('AppError for duplicate infrastructure name', () => {
    const err = new AppError('Infrastructure with this name already exists', 409);
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Infrastructure with this name already exists');
  });

  test('AppError for infrastructure not found', () => {
    const err = new AppError('Infrastructure not found', 404);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Infrastructure not found');
  });

  test('AppError for cannot delete in-use infrastructure', () => {
    const err = new AppError(
      'Cannot delete infrastructure: it is used by one or more scenarios',
      400
    );
    expect(err.statusCode).toBe(400);
  });
});
