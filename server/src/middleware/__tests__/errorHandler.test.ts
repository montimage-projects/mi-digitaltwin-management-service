import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the error handler (errorHandler, notFoundHandler).
 *
 * Exercises every error-class branch: AppError, ZodError, MongoDB duplicate
 * key (11000), Mongoose ValidationError, and the catch-all 500 path.
 */

// ── Mock logger ──────────────────────────────────────────────────────────────

const loggerError = vi.fn();
vi.mock('../../utils/logger.js', () => ({
  logger: { error: loggerError },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

const { errorHandler, notFoundHandler, AppError } = await import('../errorHandler.js');
const { z } = await import('zod');
type ZodError = import('zod').ZodError;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(): Record<string, unknown> {
  return {};
}

function makeRes(): Record<string, unknown> {
  const res: Record<string, unknown> = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

function getStatus(res: Record<string, unknown>): number | undefined {
  const statusCalls = (res.status as ReturnType<typeof vi.fn>).mock.calls;
  return statusCalls.length > 0 ? (statusCalls[0][0] as number) : undefined;
}

function getJsonBody(res: Record<string, unknown>): unknown {
  return (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
}

// ── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AppError branch (custom application errors) ─────────────────────────────

describe('errorHandler — AppError', () => {
  test('returns the AppError status code and message', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new AppError('Not found', 404);

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(404);
    expect(getJsonBody(res)).toEqual({ error: 'Not found' });
  });

  test('returns 400 for bad-request AppError', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new AppError('Bad request', 400);

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(400);
    expect(getJsonBody(res)).toEqual({ error: 'Bad request' });
  });

  test('returns 500 for operational AppError', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new AppError('Service unavailable', 503);

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(503);
    expect(getJsonBody(res)).toEqual({ error: 'Service unavailable' });
  });
});

// ── ZodError branch (validation errors → 400) ───────────────────────────────

describe('errorHandler — ZodError', () => {
  test('returns 400 with validation details', () => {
    const req = makeReq();
    const res = makeRes();

    const schema = z.object({ name: z.string().min(1), age: z.number() });
    let zodErr: ZodError;
    try {
      schema.parse({ name: '', age: 'not-a-number' });
    } catch (e) {
      zodErr = e as ZodError;
    }

    errorHandler(zodErr, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(400);
    const body = getJsonBody(res) as { error: string; details: unknown[] };
    expect(body.error).toBe('Validation error');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
    // Each detail should have path and message
    const paths = body.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('age');
    expect(body.details[0].message).toBeDefined();
  });

  test('ZodError with single missing field', () => {
    const req = makeReq();
    const res = makeRes();

    const schema = z.object({ email: z.string().email() });
    let zodErr: ZodError;
    try {
      schema.parse({});
    } catch (e) {
      zodErr = e as ZodError;
    }

    errorHandler(zodErr, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(400);
    const body = getJsonBody(res) as { error: string; details: { path: string }[] };
    expect(body.details[0].path).toBe('email');
  });
});

// ── MongoDB duplicate key (11000) ───────────────────────────────────────────

describe('errorHandler — MongoDB duplicate key', () => {
  test('returns 409 for MongoServerError code 11000', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('Duplicate key') as Error & { name: string; code: number };
    err.name = 'MongoServerError';
    err.code = 11000;

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(409);
    expect(getJsonBody(res)).toEqual({ error: 'Duplicate entry' });
  });

  test('does NOT match 11000 when name is different', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('Some error') as Error & { name: string; code: number };
    err.name = 'OtherError';
    err.code = 11000;

    errorHandler(err, req as never, res as never, vi.fn());

    // Falls through to the catch-all 500
    expect(getStatus(res)).toBe(500);
    expect(getJsonBody(res)).toEqual({ error: 'Internal server error' });
  });
});

// ── Mongoose ValidationError ─────────────────────────────────────────────────

describe('errorHandler — Mongoose ValidationError', () => {
  test('returns 400 for Mongoose ValidationError', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('Validation failed') as Error & { name: string };
    err.name = 'ValidationError';

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(400);
    const body = getJsonBody(res) as { error: string; details: string };
    expect(body.error).toBe('Validation error');
    expect(typeof body.details).toBe('string');
  });
});

// ── Catch-all unexpected error → 500 ────────────────────────────────────────

describe('errorHandler — unexpected errors', () => {
  test('returns 500 for unknown errors', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('Something went wrong');

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(500);
    expect(getJsonBody(res)).toEqual({ error: 'Internal server error' });
  });

  test('logs the error via logger.error', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('Unexpected crash');
    (err as Error & { stack?: string }).stack = 'Error: Unexpected crash\n    at ...';

    errorHandler(err, req as never, res as never, vi.fn());

    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith('Unexpected error', {
      name: 'Error',
      message: 'Unexpected crash',
      stack: expect.stringContaining('Unexpected crash'),
    });
  });

  test('handles errors without a stack trace', () => {
    const req = makeReq();
    const res = makeRes();

    const err = new Error('No stack');
    delete (err as Error & { stack?: string }).stack;

    errorHandler(err, req as never, res as never, vi.fn());

    expect(getStatus(res)).toBe(500);
    expect(loggerError).toHaveBeenCalledWith('Unexpected error', {
      name: 'Error',
      message: 'No stack',
      stack: undefined,
    });
  });
});

// ── notFoundHandler ──────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
  test('returns 404 with Not found message', () => {
    const req = makeReq();
    const res = makeRes();

    notFoundHandler(req as never, res as never);

    expect(getStatus(res)).toBe(404);
    expect(getJsonBody(res)).toEqual({ error: 'Not found' });
  });
});
