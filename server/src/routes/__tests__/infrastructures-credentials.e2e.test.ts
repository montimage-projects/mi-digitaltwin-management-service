import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * Regression tests for issue #38 (F-BUG-002): infrastructure routes must never
 * return the encrypted credential blob.
 *
 * The list/detail/create/update handlers read with `.lean()`, which returns a
 * plain object straight from MongoDB and therefore bypasses the schema's
 * `toJSON` transform (the only thing that used to strip `credentials`). Without
 * an explicit projection the `iv` / `encrypted` / `authTag` ciphertext reached
 * every API consumer.
 *
 * MongoDB is real (a disposable test database); if it is unreachable the tests
 * skip — and say so, because a silent skip on a security regression guard is
 * indistinguishable from a pass.
 */

const { env } = await import('../../config/env.js');
const { encrypt, decrypt } = await import('../../utils/encryption.js');
const { Infrastructure } = await import('../../models/Infrastructure.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const infrastructuresRoutes = (await import('../infrastructures.routes.js')).default;

const TEST_DB_NAME = `secsim_infra_creds_e2e_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

/** Every field name that must never appear in an API response. */
const SECRET_FIELDS = ['iv', 'encrypted', 'authTag'] as const;

const PLAINTEXT_CREDENTIALS = 'super-secret-bearer-token';

let mongoAvailable = true;
let server: ReturnType<Express['listen']>;
let baseUrl: string;
let authHeader: Record<string, string>;
let infraId: string;
let storedCredentials: { iv: string; encrypted: string; authTag: string };

/**
 * Assert that a response body carries no credential material, at both the
 * structural level (no `credentials` subobject, no leaked secret field names)
 * and the raw level (none of the stored ciphertext values appear anywhere).
 */
function expectNoCredentials(body: unknown, rawText: string): void {
  const entries = Array.isArray(body) ? body : [body];

  for (const entry of entries) {
    expect(entry).not.toHaveProperty('credentials');
    expect(entry).not.toHaveProperty('__v');
    for (const field of SECRET_FIELDS) {
      expect(entry).not.toHaveProperty(field);
    }
  }

  for (const value of Object.values(storedCredentials)) {
    expect(rawText).not.toContain(value);
  }
}

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
    console.warn(
      '[issue #38] MongoDB unreachable — credential-leak regression tests SKIPPED, not passed.'
    );
    return;
  }

  const infrastructure = await Infrastructure.create({
    name: `k8s-creds-${Date.now()}`,
    type: 'kubernetes',
    endpoint: 'https://10.0.0.2:6443',
    credentials: encrypt(PLAINTEXT_CREDENTIALS),
    status: 'inactive',
  });
  infraId = infrastructure._id.toString();
  storedCredentials = {
    iv: infrastructure.credentials.iv,
    encrypted: infrastructure.credentials.encrypted,
    authTag: infrastructure.credentials.authTag,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/infrastructures', infrastructuresRoutes);
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const token = jwt.sign(
    { userId: 'test-user', username: 'tester', role: 'admin' },
    env.JWT_SECRET,
    {
      expiresIn: '5m',
    }
  );
  authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(() => resolve(undefined)));
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('infrastructure routes never leak credential ciphertext (#38)', () => {
  test('GET /api/infrastructures returns no credentials', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/infrastructures`, { headers: authHeader });
    expect(res.status).toBe(200);

    const rawText = await res.text();
    const body = JSON.parse(rawText) as unknown[];
    expect(body.length).toBeGreaterThan(0);
    expectNoCredentials(body, rawText);
  });

  test('GET /api/infrastructures/:id returns no credentials', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/infrastructures/${infraId}`, { headers: authHeader });
    expect(res.status).toBe(200);

    const rawText = await res.text();
    const body = JSON.parse(rawText) as Record<string, unknown>;
    expect(body.name).toBeTruthy();
    expectNoCredentials(body, rawText);
  });

  test('PUT /api/infrastructures/:id returns no credentials and still persists them', async () => {
    if (!mongoAvailable) return;

    const rotated = 'rotated-bearer-token';
    const res = await fetch(`${baseUrl}/api/infrastructures/${infraId}`, {
      method: 'PUT',
      headers: authHeader,
      body: JSON.stringify({ endpoint: 'https://10.0.0.3:6443', credentials: rotated }),
    });
    expect(res.status).toBe(200);

    const rawText = await res.text();
    const body = JSON.parse(rawText) as Record<string, unknown>;
    expect(body.endpoint).toBe('https://10.0.0.3:6443');
    expectNoCredentials(body, rawText);

    // Projecting credentials out of the response must not stop them being written.
    const stored = await Infrastructure.findById(infraId).lean();
    expect(stored?.credentials).toBeTruthy();
    expect(decrypt(stored!.credentials)).toBe(rotated);
  });

  test('POST /api/infrastructures returns no credentials', async () => {
    if (!mongoAvailable) return;

    const res = await fetch(`${baseUrl}/api/infrastructures`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        name: `k8s-created-${Date.now()}`,
        type: 'kubernetes',
        endpoint: 'https://10.0.0.4:6443',
        credentials: 'brand-new-token',
      }),
    });
    expect(res.status).toBe(201);

    const rawText = await res.text();
    const body = JSON.parse(rawText) as Record<string, unknown>;
    expect(body._id).toBeTruthy();
    expectNoCredentials(body, rawText);
    expect(rawText).not.toContain('brand-new-token');
  });
});
