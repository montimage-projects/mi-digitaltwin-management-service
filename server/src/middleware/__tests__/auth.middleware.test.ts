import { describe, test, expect, beforeEach, vi } from 'vitest';

/**
 * Unit tests for the authentication middleware.
 *
 * `jsonwebtoken` is fully mocked — there is no real JWT verification
 * in the test environment, so the middleware is exercised against fake
 * token strings and decoded payloads only.
 */

// ── Mock jsonwebtoken BEFORE importing the middleware ──────────────────────
// The middleware uses `jwt.JsonWebTokenError` where jwt is the default import,
// so the default export must carry these classes as properties.

const JsonWebTokenError = class JsonWebTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonWebTokenError';
  }
};

const TokenExpiredError = class TokenExpiredError extends Error {
  expiredAt: Date;
  constructor(message: string, expiredAt: Date) {
    super(message);
    this.name = 'TokenExpiredError';
    this.expiredAt = expiredAt;
  }
};

const verifyMock = vi.fn();

vi.mock('jsonwebtoken', () => {
  const defaultExport = {
    verify: verifyMock,
    sign: vi.fn(),
    JsonWebTokenError,
    TokenExpiredError,
  };
  return { default: defaultExport, JsonWebTokenError, TokenExpiredError };
});

// ── Import after mocking ───────────────────────────────────────────────────

const { authMiddleware } = await import('../auth.js');
const { AppError } = await import('../errorHandler.js');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: { authorization: '' },
    ...overrides,
  };
}

function makeRes(): Record<string, unknown> {
  return {};
}

// ── Middleware Tests ───────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('passes to next() when token is valid', () => {
    const decoded = { userId: '507f1f77bcf86cd799439011', username: 'testuser', role: 'admin' };
    verifyMock.mockReturnValue(decoded);

    const req = makeReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Record<string, unknown>).user).toEqual(decoded);
    expect(verifyMock).toHaveBeenCalledWith('valid-token', expect.any(String));
  });

  test('rejects when Authorization header is missing', () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('No token provided');
    expect(err.statusCode).toBe(401);
  });

  test('rejects when Authorization header has no Bearer prefix', () => {
    const req = makeReq({ headers: { authorization: 'Basic dGVzdDp0ZXN0' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.message).toBe('No token provided');
    expect(err.statusCode).toBe(401);
  });

  test('rejects with 401 for invalid JWT signature', () => {
    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('invalid signature');
    });

    const req = makeReq({ headers: { authorization: 'Bearer not-a-real-jwt' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.message).toBe('Invalid token');
    expect(err.statusCode).toBe(401);
  });

  test('rejects with 401 for expired JWT', () => {
    verifyMock.mockImplementation(() => {
      throw new TokenExpiredError('token expired', new Date());
    });

    const req = makeReq({ headers: { authorization: 'Bearer expired-token' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.message).toBe('Token expired');
    expect(err.statusCode).toBe(401);
  });

  test('rejects with 401 for malformed JWT', () => {
    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('jwt malformed');
    });

    const req = makeReq({ headers: { authorization: 'Bearer this.is.malformed' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.message).toBe('Invalid token');
    expect(err.statusCode).toBe(401);
  });

  test('passes decoded payload to req.user on success', () => {
    const decoded = { userId: 'abc123', username: 'alice', role: 'editor' };
    verifyMock.mockReturnValue(decoded);

    const req = makeReq({ headers: { authorization: 'Bearer some-token' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect((req as Record<string, unknown>).user).toEqual(decoded);
    expect((req as Record<string, unknown>).user?.userId).toBe('abc123');
    expect((req as Record<string, unknown>).user?.username).toBe('alice');
    expect((req as Record<string, unknown>).user?.role).toBe('editor');
  });

  test('passes through unexpected errors via next(error)', () => {
    const unexpectedError = new Error('some unexpected error');
    verifyMock.mockImplementation(() => {
      throw unexpectedError;
    });

    const req = makeReq({ headers: { authorization: 'Bearer some-token' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(unexpectedError);
  });

  test('strips "Bearer " prefix before verifying', () => {
    const decoded = { userId: '507f1f77bcf86cd799439011', username: 'testuser', role: 'admin' };
    verifyMock.mockReturnValue(decoded);

    const req = makeReq({ headers: { authorization: 'Bearer my-secret-token' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    // Verify was called with the token without the "Bearer " prefix
    expect(verifyMock).toHaveBeenCalledWith('my-secret-token', expect.any(String));
  });

  test('rejects empty Bearer token as invalid', () => {
    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('jwt malformed');
    });

    const req = makeReq({ headers: { authorization: 'Bearer ' } });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.message).toBe('Invalid token');
    expect(err.statusCode).toBe(401);
  });
});
