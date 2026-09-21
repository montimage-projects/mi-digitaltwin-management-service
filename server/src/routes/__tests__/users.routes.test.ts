/**
 * Tests for user management routes (CRUD, password change, deletion).
 *
 * Uses a minimal Express app wired with the users routes, exercised via
 * `fetch()` against `http://127.0.0.1:<port>`.  `jsonwebtoken` and
 * `User` are fully mocked — there is no database or real JWT signing in
 * the test environment.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';

// ── Hoisted mock setup ───────────────────────────────────────────────────────

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

const { errorHandler } = await import('../../middleware/errorHandler.js');

// ── Mock User model ──────────────────────────────────────────────────────────

const findCalls: { selector?: Record<string, unknown>; select?: string }[] = [];
const findOneCalls: { query?: Record<string, unknown> }[] = [];
const findByIdCalls: { id?: string }[] = [];
const findByIdAndDeleteCalls: { id?: string }[] = [];
const comparePasswordCalls: { password: string }[] = [];

const testUser: Record<string, unknown> = {
  _id: '507f1f77bcf86cd799439011',
  username: 'testuser',
  role: 'admin',
  passwordHash: '$2a$12$hashedpassword',
  createdAt: new Date(),
  updatedAt: new Date(),
  comparePassword: async function (this: Record<string, unknown>, candidate: string) {
    comparePasswordCalls.push({ password: candidate });
    return candidate === 'correct-password';
  },
  toJSON: function (this: Record<string, unknown>) {
    const obj = { ...this };
    delete obj.passwordHash;
    return obj;
  },
  save: vi.fn(function (this: Record<string, unknown>) {
    return Promise.resolve(this);
  }),
};

const otherUser: Record<string, unknown> = {
  ...testUser,
  _id: '507f1f77bcf86cd799439012',
  username: 'otheruser',
};

// Chainable query builder mock for Mongoose find()
const queryBuilder = {
  select: vi.fn(function (this: Record<string, unknown>) {
    return this;
  }),
  sort: vi.fn(function (this: Record<string, unknown>) {
    return Promise.resolve([testUser]);
  }),
};

vi.mock('../../models/User.js', () => {
  const MockUser = vi.fn(function (this: Record<string, unknown>, props: Record<string, unknown>) {
    // When called as a constructor (new User({...}))
    return Object.assign({ ...testUser, ...props } as Record<string, unknown>, {
      save: vi.fn(function (this: Record<string, unknown>) {
        return Promise.resolve(this);
      }),
    });
  }) as unknown;

  // Add static methods
  MockUser.find = vi.fn(function (this: unknown) {
    findCalls.push({});
    return Object.assign({} as Record<string, unknown>, queryBuilder);
  });
  MockUser.findOne = vi.fn(function (this: unknown, query: Record<string, unknown>) {
    findOneCalls.push({ query });
    if (query?.username === 'testuser') {
      return Promise.resolve({
        ...testUser,
        _id: '507f1f77bcf86cd799439011',
      } as unknown);
    }
    if (query?.username === 'existinguser') {
      return Promise.resolve({
        ...testUser,
        _id: '507f1f77bcf86cd799439012',
        username: 'existinguser',
      } as unknown);
    }
    return Promise.resolve(null);
  });
  MockUser.findById = vi.fn(function (this: unknown, id: string) {
    findByIdCalls.push({ id });
    if (id === '507f1f77bcf86cd799439011') {
      return Promise.resolve({
        ...testUser,
        _id: '507f1f77bcf86cd799439011',
      } as unknown);
    }
    if (id === '507f1f77bcf86cd799439012') {
      return Promise.resolve({
        ...otherUser,
        _id: '507f1f77bcf86cd799439012',
      } as unknown);
    }
    return Promise.resolve(null);
  });
  MockUser.findByIdAndDelete = vi.fn(function (this: unknown, id: string) {
    findByIdAndDeleteCalls.push({ id });
    if (id === '507f1f77bcf86cd799439011') {
      return Promise.resolve(null);
    }
    if (id === '507f1f77bcf86cd799439012') {
      return Promise.resolve({
        ...otherUser,
        _id: '507f1f77bcf86cd799439012',
      } as unknown);
    }
    return Promise.resolve(null);
  });

  return { User: MockUser };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-jwt-token-string';
const EXPIRED_TOKEN = 'expired-jwt-token-string';
const ADMIN_USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Debug middleware to inspect req.user
  app.use('/api/users', (req, _res, next) => {
    console.log('DEBUG req.user:', JSON.stringify((req as Record<string, unknown>).user));
    next();
  });

  // Import and register the users router
  const usersRouter = (await import('../users.routes.js')).default;
  app.use('/api/users', usersRouter);

  app.use(errorHandler);
  return app;
}

function adminToken(userId: string = ADMIN_USER_ID): string {
  verifyMock.mockReturnValue({
    userId,
    username: 'testuser',
    role: 'admin',
  });
  return VALID_TOKEN;
}

function userToken(userId: string = OTHER_USER_ID): string {
  verifyMock.mockReturnValue({
    userId,
    username: 'otheruser',
    role: 'user',
  });
  return VALID_TOKEN;
}

// ── GET /api/users ───────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('returns list of users with valid admin token', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty('username', 'testuser');
      expect(body[0]).not.toHaveProperty('passwordHash');
    } finally {
      server.close();
    }
  });
});

// ── POST /api/users ──────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('creates a new user with valid input', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'newuser', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.username).toBe('newuser');
      expect(body.role).toBe('admin');
      expect(body).not.toHaveProperty('passwordHash');
    } finally {
      server.close();
    }
  });

  test('returns 409 for duplicate username', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Username already exists');
    } finally {
      server.close();
    }
  });

  test('returns 400 for missing username', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ password: 'password123' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for missing password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'newuser' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for short username', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'ab', password: 'password123' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for short password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'newuser', password: 'short' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });
});

// ── PUT /api/users/:id ───────────────────────────────────────────────────────

describe('PUT /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('updates user username with valid admin token', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'updateduser' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('updateduser');
    } finally {
      server.close();
    }
  });

  test('returns 400 when no fields provided', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 403 for non-admin user', async () => {
    userToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'updateduser' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Insufficient permissions');
    } finally {
      server.close();
    }
  });

  test('returns 404 for non-existent user', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/000000000000000000000000`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'ghost' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'User not found');
    } finally {
      server.close();
    }
  });

  test('returns 409 for duplicate username', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ username: 'existinguser' }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Username already exists');
    } finally {
      server.close();
    }
  });
});

// ── PUT /api/users/:id/password ──────────────────────────────────────────────

describe('PUT /api/users/:id/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('changes password with correct current password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'correct-password',
          newPassword: 'newpassword123',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message', 'Password updated successfully');
    } finally {
      server.close();
    }
  });

  test('returns 401 for incorrect current password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'wrong-password',
          newPassword: 'newpassword123',
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Current password is incorrect');
    } finally {
      server.close();
    }
  });

  test('returns 400 when new password is same as current', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'correct-password',
          newPassword: 'correct-password',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'New password must be different from current password');
    } finally {
      server.close();
    }
  });

  test('returns 400 for missing current password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ newPassword: 'newpassword123' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 400 for short new password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'correct-password',
          newPassword: 'short',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });

  test('returns 403 when non-admin tries to change another user password', async () => {
    userToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'correct-password',
          newPassword: 'newpassword123',
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Insufficient permissions');
    } finally {
      server.close();
    }
  });

  test('returns 404 for non-existent user', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/users/000000000000000000000000/password`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
          body: JSON.stringify({
            currentPassword: 'correct-password',
            newPassword: 'newpassword123',
          }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'User not found');
    } finally {
      server.close();
    }
  });

  test('admin can change another user password without current password check', async () => {
    adminToken(ADMIN_USER_ID);
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({
          currentPassword: 'any-value',
          newPassword: 'newpassword123',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message', 'Password updated successfully');
    } finally {
      server.close();
    }
  });
});

// ── PATCH /api/users/:id/password (admin-only reset) ─────────────────────────

describe('PATCH /api/users/:id/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('resets password with valid admin token', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ password: 'admin-reset-pass' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message', 'Password updated successfully');
    } finally {
      server.close();
    }
  });

  test('returns 403 for non-admin user', async () => {
    userToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ password: 'admin-reset-pass' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Insufficient permissions');
    } finally {
      server.close();
    }
  });

  test('returns 400 for short password', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
        body: JSON.stringify({ password: 'short' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Validation error');
    } finally {
      server.close();
    }
  });
});

// ── DELETE /api/users/:id ────────────────────────────────────────────────────

describe('DELETE /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('deletes user with valid admin token', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message', 'User deleted successfully');
    } finally {
      server.close();
    }
  });

  test('returns 400 when trying to delete own account', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Cannot delete your own account');
    } finally {
      server.close();
    }
  });

  test('returns 403 for non-admin user', async () => {
    // Set up a non-admin token with a DIFFERENT userId than the target
    verifyMock.mockReturnValue({
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      username: 'nonadmin',
      role: 'user',
    });
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      // Debug: log verifyMock call count
      console.log('verifyMock calls:', verifyMock.mock.calls.length);
      console.log('verifyMock last call:', verifyMock.mock.calls[verifyMock.mock.calls.length - 1]);
      console.log(
        'verifyMock last result:',
        verifyMock.mock.results[verifyMock.mock.results.length - 1]
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Insufficient permissions');
    } finally {
      server.close();
    }
  });

  test('returns 404 for non-existent user', async () => {
    adminToken();
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/000000000000000000000000`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'User not found');
    } finally {
      server.close();
    }
  });
});

// ── Authentication guards ────────────────────────────────────────────────────

describe('Authentication guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comparePasswordCalls.length = 0;
    findCalls.length = 0;
    findOneCalls.length = 0;
    findByIdCalls.length = 0;
    findByIdAndDeleteCalls.length = 0;
  });

  test('returns 401 for PUT without token', async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'updateduser' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'No token provided');
    } finally {
      server.close();
    }
  });

  test('returns 401 for DELETE without token', async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'No token provided');
    } finally {
      server.close();
    }
  });

  test('returns 401 for PUT /:id/password without token', async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${ADMIN_USER_ID}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'correct-password',
          newPassword: 'newpassword123',
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'No token provided');
    } finally {
      server.close();
    }
  });

  test('returns 401 for expired token', async () => {
    verifyMock.mockImplementation(() => {
      throw new TokenExpiredError('token expired', new Date());
    });

    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/${OTHER_USER_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${EXPIRED_TOKEN}` },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Token expired');
    } finally {
      server.close();
    }
  });
});
