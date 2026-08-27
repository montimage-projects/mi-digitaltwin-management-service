import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the environment configuration module.
 *
 * The parser must surface invalid configuration by throwing (so callers,
 * CI and developers get a stack trace instead of a silent import-time
 * kill switch), and must apply schema defaults for optional variables.
 */

const TEST_ENCRYPTION_KEY = 'ci-test-encryption-key-16chr';

const loadEnvModule = async (): Promise<typeof import('../env.js')> => {
  vi.resetModules();
  return await import('../env.js');
};

/** Flatten everything the parser logged so a test can assert on the offending name. */
const loggedErrors = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls
    .flat()
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join('\n');

describe('config/env', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.JWT_SECRET;
    delete process.env.MONGODB_URI; // clear in-memory server URI set by global-setup
    process.env.ADMIN_PASSWORD = 'ci-test-admin-secret-9f2K7x';
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ENCRYPTION_KEY;
    errorSpy.mockRestore();
  });

  it('applies schema defaults when optional variables are absent', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';

    const { env } = await loadEnvModule();

    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toBe('mongodb://localhost:27017/intact');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.ADMIN_USERNAME).toBe('admin');
    expect(env.BRANDING_PROFILE).toBe('default');
  });

  it('transforms PORT to a number when provided as a string', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.PORT = '8080';

    const { env } = await loadEnvModule();

    expect(env.PORT).toBe(8080);
  });

  it('throws instead of exiting when JWT_SECRET is missing', async () => {
    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
  });

  it('throws when JWT_SECRET is shorter than 32 characters', async () => {
    process.env.JWT_SECRET = 'too-short';

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(errorSpy).toHaveBeenCalled();
    expect(loggedErrors(errorSpy)).toContain('JWT_SECRET');
  });

  it('throws instead of exiting when ADMIN_PASSWORD is missing', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    delete process.env.ADMIN_PASSWORD;

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(errorSpy).toHaveBeenCalled();
    expect(loggedErrors(errorSpy)).toContain('ADMIN_PASSWORD');
  });

  it('throws when ADMIN_PASSWORD is shorter than 8 characters', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.ADMIN_PASSWORD = 'short';

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(loggedErrors(errorSpy)).toContain('ADMIN_PASSWORD');
  });

  it('keeps a strong custom ADMIN_PASSWORD verbatim', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';

    const { env } = await loadEnvModule();

    expect(env.ADMIN_PASSWORD).toBe('correct-horse-battery-staple');
  });

  it('exports the known-default admin password list', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';

    const { DEFAULT_ADMIN_PASSWORDS } = await loadEnvModule();

    expect(DEFAULT_ADMIN_PASSWORDS).toEqual(['intact2025', 'admin', 'password']);
  });

  it('throws instead of exiting when ENCRYPTION_KEY is missing', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    delete process.env.ENCRYPTION_KEY;

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(errorSpy).toHaveBeenCalled();
    expect(loggedErrors(errorSpy)).toContain('ENCRYPTION_KEY');
  });

  // The schema has no NODE_ENV branch, so a missing ENCRYPTION_KEY must abort
  // the boot in development and test exactly as it does in production (#37).
  for (const nodeEnv of ['development', 'test', 'production'] as const) {
    it(`throws when ENCRYPTION_KEY is missing under NODE_ENV=${nodeEnv}`, async () => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
      delete process.env.ENCRYPTION_KEY;

      await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
      expect(loggedErrors(errorSpy)).toContain('ENCRYPTION_KEY');
    });
  }

  it('throws when ENCRYPTION_KEY is shorter than 16 characters', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.ENCRYPTION_KEY = 'too-short';

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(loggedErrors(errorSpy)).toContain('ENCRYPTION_KEY');
  });

  it('keeps a caller-supplied ENCRYPTION_KEY verbatim (no committed fallback)', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.ENCRYPTION_KEY = 'operator-supplied-encryption-key';

    const { env } = await loadEnvModule();

    expect(env.ENCRYPTION_KEY).toBe('operator-supplied-encryption-key');
  });
});

/**
 * Source-hygiene guard for #37: no committed encryption-key fallback may
 * survive anywhere under `server/src`.
 *
 * The banned literal is assembled at runtime so this test file does not
 * itself contain it — the acceptance criterion greps the whole tree and must
 * come back empty, and a guard that plants the string it bans would defeat it.
 */
describe('config/env source hygiene', () => {
  const serverSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const bannedKey = ['intact', 'default', 'encryption', 'key'].join('-');

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'node_modules' || entry.name === 'dist') return [];
      const full = join(dir, entry.name);
      return entry.isDirectory() ? sourceFiles(full) : [full];
    });

  it('ships no hard-coded encryption-key fallback under server/src', () => {
    const offenders = sourceFiles(serverSrc)
      .filter((file) => readFileSync(file, 'utf8').includes(bannedKey))
      .map((file) => relative(serverSrc, file));

    expect(offenders).toEqual([]);
  });
});
