import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the startup environment checks.
 *
 * The ENCRYPTION_KEY guard must be NODE_ENV-independent: a placeholder key
 * decrypts the same stored cluster credentials in development and staging as
 * it does in production, so it aborts the boot in every environment (#37).
 */

const NODE_ENVS = ['development', 'test', 'production'] as const;

/** A key that looks nothing like a placeholder: openssl rand -hex 16. */
const REAL_ENCRYPTION_KEY = 'f3a91c7d2b8e40561a9c4e7b30d85f26';

/** The value CI and `server/tests/setup.ts` inject — must not be flagged. */
const CI_ENCRYPTION_KEY = 'ci-test-encryption-key-16chr';

// Assembled at runtime so this file does not itself carry the fallback that
// #37 removed: `grep -rn` over server/src must come back empty.
const REMOVED_FALLBACK_KEY = ['intact', 'default', 'encryption', 'key', '2025'].join('-');

/** Repository root, resolved from this file so the test is cwd-independent. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Every deployment template that ships a *literal* ENCRYPTION_KEY placeholder.
 *
 * docker-compose.prod.yml, docker-compose.atlas.yml and render.yaml are absent
 * on purpose: they interpolate (`${ENCRYPTION_KEY:?...}`) or generate the value,
 * so there is no committed literal that could boot the server.
 */
const PLACEHOLDER_TEMPLATES = [
  '.env.example',
  join('server', '.env.example'),
  join('k8s', 'base', 'secret.example.yaml'),
] as const;

/**
 * Read the ENCRYPTION_KEY placeholder out of a template, so this test can never
 * drift from what the repository actually ships. Handles both the shell
 * `KEY=value` form (.env.example) and the YAML `KEY: value` form (k8s Secret);
 * commented-out lines never match because the name must start the line.
 */
const readTemplatePlaceholder = (relativePath: string): string | null => {
  const lines = readFileSync(join(REPO_ROOT, relativePath), 'utf8').split('\n');
  for (const line of lines) {
    const match = /^\s*ENCRYPTION_KEY\s*[:=]\s*(\S.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim().replace(/^["']|["']$/g, '');
    if (value.length > 0) return value;
  }
  return null;
};

const loadStartupModule = async (): Promise<typeof import('../startup.js')> => {
  vi.resetModules();
  return await import('../startup.js');
};

const encryptionKeyCheck = async (): Promise<{ status: string; message: string }> => {
  const { validateEnvironment } = await loadStartupModule();
  const result = validateEnvironment().find((entry) => entry.name === 'ENCRYPTION_KEY');
  if (!result) {
    throw new Error('validateEnvironment did not report on ENCRYPTION_KEY');
  }
  return result;
};

const stubValidEnv = (nodeEnv: (typeof NODE_ENVS)[number], encryptionKey: string): void => {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('JWT_SECRET', 'ci-jwt-secret-minimum-32-characters-long');
  vi.stubEnv('ADMIN_PASSWORD', 'ci-admin-secret-9f2K7x');
  vi.stubEnv('ENCRYPTION_KEY', encryptionKey);
};

describe('utils/startup ENCRYPTION_KEY check', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  for (const nodeEnv of NODE_ENVS) {
    it(`reports an error for a placeholder key under NODE_ENV=${nodeEnv}`, async () => {
      stubValidEnv(nodeEnv, 'your-32-character-encryption-key');

      const result = await encryptionKeyCheck();

      expect(result.status).toBe('error');
      expect(result.message).toMatch(/default\/example ENCRYPTION_KEY/i);
    });

    it(`reports an error for the removed committed fallback under NODE_ENV=${nodeEnv}`, async () => {
      stubValidEnv(nodeEnv, REMOVED_FALLBACK_KEY);

      const result = await encryptionKeyCheck();

      expect(result.status).toBe('error');
    });

    it(`accepts a generated key under NODE_ENV=${nodeEnv}`, async () => {
      stubValidEnv(nodeEnv, REAL_ENCRYPTION_KEY);

      const result = await encryptionKeyCheck();

      expect(result.status).toBe('ok');
    });
  }

  // The matcher used to include bare 'default' and 'test' substrings. Now that
  // a match is fatal everywhere, those would lock CI and local dev out.
  it('does not flag the CI-mirrored test key', async () => {
    stubValidEnv('test', CI_ENCRYPTION_KEY);

    const result = await encryptionKeyCheck();

    expect(result.status).toBe('ok');
  });

  // Derived from the templates themselves rather than hard-coded: an operator
  // who applies a shipped template verbatim must never boot (#37).
  it('flags every ENCRYPTION_KEY placeholder shipped in a deployment template', async () => {
    const discovered = PLACEHOLDER_TEMPLATES.map((template) => ({
      template,
      value: readTemplatePlaceholder(template),
    })).filter((entry): entry is { template: string; value: string } => entry.value !== null);

    // Fail loudly if parsing silently found nothing, instead of vacuously
    // passing over an empty list.
    expect(
      discovered.map((entry) => entry.template),
      'every deployment template must yield a parsable ENCRYPTION_KEY placeholder'
    ).toEqual([...PLACEHOLDER_TEMPLATES]);

    for (const { template, value } of discovered) {
      stubValidEnv('development', value);

      const result = await encryptionKeyCheck();

      expect(result.status, `${template} ships "${value}", which must be rejected`).toBe('error');
    }
  });
});
