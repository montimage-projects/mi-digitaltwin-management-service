/**
 * Vitest per-test setup.
 *
 * Mirrors the CI test environment (.github/workflows/ci.yml "Run server
 * tests" step) so the suite can be collected and run in a fresh shell
 * without any secrets exported.
 *
 * Values are injected with `??` so an explicitly exported variable always
 * wins over the CI-mirrored default.
 *
 * The global setup (global-setup.ts) already provides an in-memory MongoDB
 * URI via `process.env.MONGODB_URI`.  This file sets up the remaining env
 * vars.  Tests that need a dedicated test DB still get a unique name by
 * appending `_${Date.now()}` to the base URI.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'ci-test-jwt-secret-min-32-characters-long';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ci-test-admin-secret-9f2K7x';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'ci-test-encryption-key-16chr';
