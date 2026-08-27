# Code Review Report

**Date**: 2026-08-26
**Scope**: Full Audit (sampled) — secsim TypeScript monorepo (server Express+Mongoose, client React SPA)
**Files Reviewed**: 26 (+ repo-wide sink grep)
**Mode**: Mode 3 (Large Audit, sampled) — Agent tool unavailable, executed inline per skill degradation path

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 3     |
| Major    | 2     |
| Minor    | 10    |

(Critical≈rubric-Critical, Major≈High, Minor≈Medium/Low)

## Critical Issues

### [Security]: Hardcoded default admin password seeded into every empty DB

**File**: `server/src/config/env.ts:15` (`ADMIN_PASSWORD ... default('intact2025')`); seeded at `server/src/seed/admin.seed.ts:12`; advertised at `server/src/seed/auto-seed.ts:112`
`utils/startup.ts:48-124` validates JWT_SECRET/ENCRYPTION_KEY/CORS defaults but never ADMIN_PASSWORD, so production can boot with the well-known credential.

### [Security]: `.lean()` bypasses toJSON — encrypted cluster credentials returned by API

**File**: `server/src/routes/infrastructures.routes.ts:41,43` (list), `:98,104` (detail), `:145-149,155` (update)
Model strips `credentials` only via `toJSON` transform (`server/src/models/Infrastructure.ts:96-103`); `.lean()` returns plain objects and skips transforms, leaking iv/ciphertext/authTag to clients. Route comment at `infrastructures.routes.ts:79` incorrectly assumes the transform applies.

### [Security]: Committed fallback ENCRYPTION_KEY decrypts all stored infra credentials

**File**: `server/src/config/env.ts:16-19`, used by `server/src/utils/encryption.ts:7-14`
Default `intact-default-encryption-key-2025` turns F-002's leak into plaintext cluster tokens wherever NODE_ENV ≠ production (prod-only guard at `server/src/utils/startup.ts:69-76`).

## Major Issues

### [Security]: User-controlled RegExp injection / ReDoS in search endpoints

**File**: `server/src/routes/services.routes.ts:121,125-129`; `server/src/routes/projects.routes.ts:51,55-59`
`new RegExp(req.query…, 'i')` on unescaped input — `(` / `[` throw → 500; `(a+)+$`-style patterns enable CPU ReDoS.

### [Bug]: Global 401 interceptor hijacks failed logins

**File**: `client/src/lib/api.ts:29-32` + `client/src/pages/Login.tsx:41-45`
Any 401 (including POST /auth/login bad-password) triggers `logout()` + `window.location.href='/login'`; page reloads, wiping the rendered "Invalid username or password" message and typed input.

## Minor Issues

- **[Security]** No RBAC beyond authentication on user management (create/delete/reset-password): `server/src/routes/users.routes.ts:11,35,66,89`. Contained today (single-role enum, `models/User.ts:28-31`) but no defense-in-depth.
- **[Security]** No rate limiting / lockout on `POST /api/auth/login`: `server/src/routes/auth.routes.ts:13`.
- **[Bug]** Dead error branch: `jwt.TokenExpiredError extends JsonWebTokenError`, so expired tokens report "Invalid token": `server/src/middleware/auth.ts:36-43`.
- **[Quality]** `parseEnv()` calls `process.exit(1)` at module import: `server/src/config/env.ts:33-37` — root cause of e2e suites failing at collection without exported JWT_SECRET (tests consume `env.JWT_SECRET`, e.g. `routes/__tests__/scenarios-deploy.e2e.test.ts:146`).
- **[Race]** Execute route does unsynchronized read-modify-write + double `save()` on `scenario.executions`: `server/src/routes/scenarios.routes.ts:252-258,273-284` → concurrent executes risk VersionError/lost records.
- **[Leak]** Partial K8s deploys orphan the namespace + created workloads (no rollback on mid-loop failure): `server/src/services/kubernetesDeploy.ts:332-361`.
- **[Data loss]** Project delete ignores referencing scenarios ("For now, allow deletion"): `server/src/routes/projects.routes.ts:213-226`, contrast guarded infra delete `infrastructures.routes.ts:173-176`.
- **[Bug]** SSE reader loop exits silently on stream close without invoking handlers — UI can hang in "running" on network drop: `client/src/lib/api.ts:446-460` (consumer relies on onEnd/onError, `components/execution/ExecutionConsole.tsx:106-133`).
- **[Bug]** `parseInt` without NaN guard: `?limit=abc` → NaN reaches mongoose → 500: `services.routes.ts:81-88`, `middleware/validation.ts:40-49`.
- **[Bug]** Only users routes skip ObjectId validation → malformed `:id` becomes CastError 500 instead of 400: `users.routes.ts:76,94`.

## Recommendations

1. Remove defaults for ADMIN_PASSWORD and ENCRYPTION_KEY (require env), add ADMIN_PASSWORD to startup checks.
2. Replace `.lean()` on infrastructure GET/PUT with regular queries or explicit projection excluding credentials.
3. Escape user search terms (`querystring.escape`-style regex escape helper) before `new RegExp`, and add express-rate-limit to /auth/login.

## Excluded / Not Reviewed

categories/sectors/partners routes (grep-verified auth only), non-Infrastructure/User models, migrations, branding configs, openapi, ~40 client components/pages, most tests. Binary/generated files skipped.
