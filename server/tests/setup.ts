/**
 * Vitest global setup.
 *
 * Mirrors the CI test environment (.github/workflows/ci.yml "Run server
 * tests" step) so the suite can be collected and run in a fresh shell
 * without any secrets exported.
 *
 * Values are injected with `??` so an explicitly exported variable always
 * wins over the CI-mirrored default.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'ci-test-jwt-secret-min-32-characters-long';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ci-test-admin-secret-9f2K7x';
