import { describe, test, expect, vi } from 'vitest';

/**
 * Unit tests for the validation middleware (validate, validateBody, validateQuery).
 *
 * All Express Request/Response/NextFunction objects are hand-rolled stubs —
 * no real Express is loaded. Zod schemas exercise the parse / safeParse paths
 * so that every branch in the middleware is covered.
 */

// ── Imports ──────────────────────────────────────────────────────────────────

const { validate, validateBody, validateQuery, objectIdSchema, paginationSchema } =
  await import('../validation.js');
const { z } = await import('zod');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  body: Record<string, unknown> = {},
  query: Record<string, string> = {}
): Record<string, unknown> {
  return { body, query };
}

function makeRes(): Record<string, unknown> {
  return {};
}

// ── validate() ───────────────────────────────────────────────────────────────

describe('validate', () => {
  test('calls next() when body matches the schema', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate(schema);

    const req = makeReq({ name: 'test' });
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });

  test('calls next(error) when body does not match the schema', () => {
    const schema = z.object({ name: z.string().min(3) });
    const middleware = validate(schema);

    const req = makeReq({ name: 'ab' }); // too short
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('passes unknown error types through next(error)', () => {
    // A schema with a refine that throws a non-Zod error
    const schema = z.object({ value: z.number() }).refine(() => {
      throw new Error('custom validation failure');
    });
    const middleware = validate(schema);

    const req = makeReq({ value: 42 });
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toBe('custom validation failure');
  });
});

// ── validateBody() ───────────────────────────────────────────────────────────

describe('validateBody', () => {
  test('parses and assigns req.body on success', () => {
    const schema = z.object({ name: z.string(), age: z.number().optional() });
    const middleware = validateBody(schema);

    const req = makeReq({ name: 'Alice' }); // age is optional
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
    expect((req as Record<string, unknown>).body).toEqual({ name: 'Alice' });
  });

  test('calls next(error) on validation failure', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = validateBody(schema);

    const req = makeReq({ email: 'not-an-email' });
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('handles empty body with optional schema', () => {
    const schema = z.object({ name: z.string().optional() });
    const middleware = validateBody(schema);

    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
  });
});

// ── validateQuery() ──────────────────────────────────────────────────────────

describe('validateQuery', () => {
  test('parses and assigns req.query on success', () => {
    const schema = z.object({ page: z.string().optional() });
    const middleware = validateQuery(schema);

    const req = makeReq({}, { page: '1' });
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
    expect((req as Record<string, unknown>).query).toEqual({ page: '1' });
  });

  test('calls next(error) when query params fail validation', () => {
    const schema = z.object({ limit: z.coerce.number().positive() });
    const middleware = validateQuery(schema);

    const req = makeReq({}, { limit: '-5' });
    const res = makeRes();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

// ── objectIdSchema ───────────────────────────────────────────────────────────

describe('objectIdSchema', () => {
  test('validates a correct 24-char hex string', () => {
    const result = objectIdSchema.safeParse('507f1f77bcf86cd799439011');
    expect(result.success).toBe(true);
  });

  test('rejects a string that is too short', () => {
    const result = objectIdSchema.safeParse('507f1f77bcf86cd7994390');
    expect(result.success).toBe(false);
  });

  test('rejects a string that is too long', () => {
    const result = objectIdSchema.safeParse('507f1f77bcf86cd79943901100');
    expect(result.success).toBe(false);
  });

  test('rejects non-hex characters', () => {
    const result = objectIdSchema.safeParse('507f1f77bcf86cd7994390gh');
    expect(result.success).toBe(false);
  });

  test('rejects empty string', () => {
    const result = objectIdSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  test('accepts uppercase hex', () => {
    const result = objectIdSchema.safeParse('507F1F77BCF86CD799439011');
    expect(result.success).toBe(true);
  });
});

// ── paginationSchema ─────────────────────────────────────────────────────────

describe('paginationSchema', () => {
  test('returns defaults when no params provided', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ limit: 20, skip: 0 });
    }
  });

  test('transforms string limit to number', () => {
    const result = paginationSchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(typeof result.data.limit).toBe('number');
    }
  });

  test('caps limit at 100', () => {
    const result = paginationSchema.safeParse({ limit: '999' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });

  test('transforms string skip to number', () => {
    const result = paginationSchema.safeParse({ skip: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skip).toBe(10);
    }
  });

  test('handles both limit and skip together', () => {
    const result = paginationSchema.safeParse({ limit: '25', skip: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ limit: 25, skip: 50 });
    }
  });
});
