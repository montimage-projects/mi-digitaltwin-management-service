import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the environment configuration module.
 *
 * The parser must surface invalid configuration by throwing (so callers,
 * CI and developers get a stack trace instead of a silent import-time
 * kill switch), and must apply schema defaults for optional variables.
 */

const loadEnvModule = async (): Promise<typeof import('../env.js')> => {
  vi.resetModules();
  return await import('../env.js');
};

describe('config/env', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.JWT_SECRET;
    process.env.ADMIN_PASSWORD = 'ci-test-admin-secret-9f2K7x';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
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
    const logged = errorSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
    expect(logged).toContain('JWT_SECRET');
  });

  it('throws instead of exiting when ADMIN_PASSWORD is missing', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    delete process.env.ADMIN_PASSWORD;

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
    expect(logged).toContain('ADMIN_PASSWORD');
  });

  it('throws when ADMIN_PASSWORD is shorter than 8 characters', async () => {
    process.env.JWT_SECRET = 'ci-test-jwt-secret-min-32-characters-long';
    process.env.ADMIN_PASSWORD = 'short';

    await expect(loadEnvModule()).rejects.toThrow(/Environment validation failed/i);
    const logged = errorSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
    expect(logged).toContain('ADMIN_PASSWORD');
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
});
