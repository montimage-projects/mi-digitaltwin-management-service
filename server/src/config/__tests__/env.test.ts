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
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.JWT_SECRET;
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
});
