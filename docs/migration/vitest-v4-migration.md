# Vitest v3 → v4 Migration Notes

## Task 5.1 — Spike / Migration Documentation

**Date:** 2025-07-16  
**Status:** Complete  
**Previous version:** vitest ^3.x (unspecified minor)  
**Current version:** vitest ^4.1.11

---

## Summary

Vitest was already at v4.1.11 in both `client/package.json` and `server/package.json` at the time of this spike. No configuration changes were required — all 8 server test suites and 12 client test suites run and pass under vitest v4.

---

## Key Breaking Changes in Vitest v4 (Not Impacting This Project)

### 1. Config Changes

- **`workspace` → `projects`**: Renamed in v3.2; our configs use `defineConfig` inline, no workspace file.
- **`poolOptions` flattened**: `poolOptions.forks`/`poolOptions.vmThreads` are now top-level options (`execArgv`, `isolate`, `maxWorkers`, `vmMemoryLimit`). Our configs don't use poolOptions.
- **`maxThreads`/`maxForks` → `maxWorkers`**: Top-level rename. Not used in our configs.
- **`singleThread`/`singleFork`** → `maxWorkers: 1, isolate: false`: Not used.

### 2. Coverage Changes

- **`coverage.include` default**: Now only includes files loaded during test run if not specified. Our configs explicitly set `include`, so no change needed.
- **`exclude` simplification**: Now only excludes `node_modules` and `.git` by default. Our configs don't override `exclude`.

### 3. Mocking Changes

- **Constructor spying**: `vi.spyOn` on constructors now works with `function`/`class` keyword implementations. Not impacted.
- **`vi.restoreAllMocks`**: No longer resets automock state. Not used.
- **`vi.fn().getMockName()`**: Returns `vi.fn()` instead of `spy`. Not used in snapshots.

### 4. Environment/Module Runner

- **`vite-node` → Module Runner**: Internal change; no config impact.
- **`VITE_NODE_DEPS_MODULE_DIRECTORIES` → `VITEST_MODULE_DIRECTORIES`**: Env var rename. Not used.
- **`vitest/execute` removed**: Internal API. Not used.

### 5. Browser Provider

- **Object-based provider**: `provider: 'playwright'` → `provider: playwright({...})`. Not used (we use jsdom/node environments).

### 6. Test Runner

- **Standalone mode with filename filter**: Improved UX. Not impacted.
- **`vi.fn().mock.invocationCallOrder`**: Starts at 1 instead of 0. Not used.

---

## Configuration Files Reviewed

### `client/vitest.config.ts`

- Uses `globals: true`, `environment: 'jsdom'`, `setupFiles`, coverage with `provider: 'v8'`.
- All settings are v4-compatible. No changes needed.

### `server/vitest.config.ts`

- Uses `globals: false`, `environment: 'node'`, `globalSetup`, `setupFiles`, `testTimeout: 30000`, coverage with thresholds.
- All settings are v4-compatible. No changes needed.

---

## Test Results

### Client (12 test files, 107 tests)

```
Test Files  12 passed (12)
Tests       107 passed (107)
Duration    2.52s
```

### Server (29 test files, 420 tests)

```
Test Files  29 passed (29)
Tests       420 passed (420)
Duration    5.80s
```

---

## 8 Server Route Test Suites (F-DEP-203 Gate)

The 8 server route test suites that gate this task:

| #   | Suite                                | Tests | Status |
| --- | ------------------------------------ | ----- | ------ |
| 1   | `auth.routes.test.ts`                | —     | PASS   |
| 2   | `users.routes.test.ts`               | —     | PASS   |
| 3   | `scenarios-slim.test.ts`             | —     | PASS   |
| 4   | `scenarios-race.test.ts`             | —     | PASS   |
| 5   | `scenarios-validation.test.ts`       | —     | PASS   |
| 6   | `infrastructures-validation.test.ts` | —     | PASS   |
| 7   | `services-slim.test.ts`              | —     | PASS   |
| 8   | `catalog.e2e.test.ts`                | —     | PASS   |

Plus 21 additional server test files (e2e, middleware, services, seed, utils, CI, config) — all passing.

---

## Coverage Config (from 7.1)

Both `client/vitest.config.ts` and `server/vitest.config.ts` have coverage configured with `provider: 'v8'`. The config remains functional under v4.

Server coverage thresholds (50/40/50/50) are unchanged and still enforced.

---

## Conclusion

No code changes were required for the vitest v3 → v4 migration in this project. The existing configuration is fully compatible with vitest v4. All 8 gate suites and all 527 total tests pass.
