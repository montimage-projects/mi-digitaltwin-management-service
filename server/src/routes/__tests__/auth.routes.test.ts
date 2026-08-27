import { describe, test, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';

/**
 * Unit tests for the authentication routes (login, me, logout).
 *
 * Uses a minimal Express app wired with only the auth routes, exercised
 * via `fetch()` against `http://127.0.0.1:<port>`.  `jsonwebtoken` and
 * `User` are fully mocked — there is no database or real JWT signing in
 * the test environment.
 */

// ── Hoisted mock setup (vi.mock is hoisted, so variables must be too) ─────

const { verifyMock, signMock, JsonWebTokenError, TokenExpiredError } = vi.hoisted(() => {
  class JsonWebTokenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  }
  class TokenExpiredError extends Error {
    expiredAt: Date;
    constructor(message: string, expiredAt: Date) {
      super(message);
      this.name = 'TokenExpiredError';
      this.expiredAt = expiredAt;
    }
  }
  return {
    verifyMock: vi.fn(),
    signMock: vi.fn(() => 'test-jwt-token'),
    JsonWebTokenError,
    TokenExpiredError,
  };
});

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: verifyMock,
    sign: signMock,
    JsonWebTokenError,
    TokenExpiredError,
  },
  JsonWebTokenError,
  TokenExpiredError,
}));

// ── Import after mocking ───────────────────────────────────────────────────

const jwt = await import('jsonwebtoken').then(
  (m) => m.default as typeof import('jsonwebtoken').default
);
const { User } = await import('../../models/User.js');
const { validate } = await import('../../middleware/validation.js');
const { loginSchema } = await import('../../validators/auth.validator.js');
const { authMiddleware } = await import('../../middleware/auth.js');
const { errorHandler, AppError } = await import('../../middleware/errorHandler.js');

// ── Mock User model ───────────────────────────────────────────────────────

const comparePasswordCalls: { password: string }[] = [];
const findOneCalls: { username: string | undefined }[] = [];
const findByIdCalls: { id: string | undefined }[] = [];

vi.mock('../../models/User.js', () => ({
  User: {
    findOne: vi.fn(function (this: unknown, query: { username?: string }) {
      findOneCalls.push({ username: query?.username });
      if (query?.username === 'testuser') {
        return Promise.resolve({
          _id: '507f1f77bcf86cd799439011',
          username: 'testuser',
          role: 'admin',
          passwordHash: '$2a$12$hashedpassword',
          comparePassword: async function (this: Record<string, unknown>, candidate: string) {
            comparePasswordCalls.push({ password: candidate });
            return candidate === 'correct-password';
          },
          toJSON: function (this: Record<string, unknown>) {
            const obj = { ...this };
            delete obj.passwordHash;
            return obj;
          },
        } as import('../../models/User.js').IUser);
      }
      return Promise.resolve(null);
    }),
    findById: vi.fn(function (this: unknown, id: string) {
      findByIdCalls.push({ id });
      if (id === '507f1f77bcf86cd799439011') {
        return Promise.resolve({
          _id: '507f1f77bcf86cd799439011',
          username: 'testuser',
          role: 'admin',
          passwordHash: '$2a$12$hashedpassword',
          comparePassword: async function (this: Record<string, unknown>, candidate: string) {
            comparePasswordCalls.push({ password: candidate });
            return candidate === 'correct-password';
          },
          toJSON: function (this: Record<string, unknown>) {
            const obj = { ...this };
            delete obj.passwordHash;
            return obj;
          },
        } as import('../../models/User.js').IUser);
      }
      return Promise.resolve(null);
    }),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-jwt-token-string';
const EXPIRED_TOKEN = 'expired-jwt-token-string';
const INVALID_TOKEN = 'not-a-real-jwt';
const MALFORMED_TOKEN = 'this.is.malformed.token';

function buildApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // POST /login
  app.post('/login', validate(loginSchema), async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username: username.toLowerCase() });
      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new AppError('Invalid credentials', 401);
      }
      const token = jwt.sign(
        { userId: user._id, username: user.username, role: user.role },
        'ci-test-jwt-secret-min-32-characters-long',
        { expiresIn: '24h' }
      );
      res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  // GET /me
  app.get('/me', authMiddleware, async (req, res, next) => {
    try {
      const userId = (req as Record<string, unknown>).user?.userId as string;
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }
      res.json({ id: user._id, username: user.username, role: user.role });
    } catch (error) {
      next(error);
    }
  });

  // POST /logout
  app.post('/logout', (_req, res) => {
    res.json({ message: 'Logged out successfully' });
  });

  app.use(errorHandler);
  return app;
}

// ── Login Route Tests ──────────────────────────────────────────────────────

describe('POST /login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findOneCalls.length = 0;
  });

  test('returns token and user on valid credentials', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'correct-password' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user.username).toBe('testuser');
      expect(body.user.role).toBe('admin');
    } finally {
      server.close();
    }
  });

  test('returns 401 for wrong password', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrong-password' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Invalid credentials');
    } finally {
      server.close();
    }
  });

  test('returns 401 for unknown user', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'unknownuser', password: 'some-password' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Invalid credentials');
      expect(comparePasswordCalls).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  test('returns 400 for missing username', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'correct-password' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for missing password', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for empty username', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '', password: 'correct-password' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for empty password', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: '' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('lowercases username before lookup', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'TESTUSER', password: 'correct-password' }),
      });

      expect(res.status).toBe(200);
      expect(findOneCalls[0]?.username).toBe('testuser');
    } finally {
      server.close();
    }
  });
});

// ── Me Route Tests ─────────────────────────────────────────────────────────

describe('GET /me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdCalls.length = 0;
  });

  test('returns user with valid token', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockReturnValue({
      userId: '507f1f77bcf86cd799439011',
      username: 'testuser',
      role: 'admin',
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('testuser');
      expect(body.role).toBe('admin');
    } finally {
      server.close();
    }
  });

  test('returns 401 when no token is provided', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'No token provided');
    } finally {
      server.close();
    }
  });

  test('returns 401 when token is not a Bearer token', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'No token provided');
    } finally {
      server.close();
    }
  });

  test('returns 401 for invalid token signature', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('invalid signature');
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: `Bearer ${INVALID_TOKEN}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Invalid token');
    } finally {
      server.close();
    }
  });

  test('returns 401 for expired token', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockImplementation(() => {
      throw new TokenExpiredError('token expired', new Date());
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: `Bearer ${EXPIRED_TOKEN}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Token expired');
    } finally {
      server.close();
    }
  });

  test('returns 401 for malformed token', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('jwt malformed');
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: `Bearer ${MALFORMED_TOKEN}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Invalid token');
    } finally {
      server.close();
    }
  });

  test('returns 404 when user is not found in database', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockReturnValue({
      userId: '000000000000000000000000',
      username: 'ghost',
      role: 'admin',
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'User not found');
    } finally {
      server.close();
    }
  });

  test('returns 401 for empty Bearer token', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    verifyMock.mockImplementation(() => {
      throw new JsonWebTokenError('jwt malformed');
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/me`, {
        headers: { Authorization: 'Bearer ' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    } finally {
      server.close();
    }
  });
});

// ── Logout Route Tests ─────────────────────────────────────────────────────

describe('POST /logout', () => {
  test('always succeeds with a message', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/logout`, { method: 'POST' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message', 'Logged out successfully');
    } finally {
      server.close();
    }
  });

  test('succeeds even without a token (stateless logout)', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/logout`, { method: 'POST' });

      expect(res.status).toBe(200);
    } finally {
      server.close();
    }
  });
});
