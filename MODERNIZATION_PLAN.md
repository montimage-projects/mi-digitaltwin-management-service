# Modernization Plan — MI Digital Twin Management Platform (secsim)

Derived from [`MODERNIZATION_REPORT.md`](./MODERNIZATION_REPORT.md) · **Baseline at audit:** AMBER
**Test command of record:** `npm test` · **Pass rate at audit:** 29/29 collected tests passing; 5/8 suites failing to collect locally (`server/src/config/env.ts:36` calls `process.exit(1)` at import when `JWT_SECRET` is unset)

Every P0–P4 task's acceptance criteria include the baseline-green assertion: **"`npm test` exits 0 with 8/8 test files collecting and ≥ 29/29 tests passing."** Task 0.1 _establishes_ that bar (at audit time only 3 files collect); every later task must not regress below it. Pre tasks carry **no** green/pass-rate assertion — the baseline is AMBER, restoring full collection is P0's job, and Pre only produces environment notes and agent config files.

## At a glance

| Phase                 | Sprints | Tasks | Closes                                                                                                   | Milestone |
| --------------------- | ------- | ----- | -------------------------------------------------------------------------------------------------------- | --------- |
| Pre Agent environment | 1       | 3     | — (enables ME)                                                                                           | ME        |
| P0 Stabilize          | 1       | 4     | F-BUG-008 (High, suite blocker), F-DEP-004, F-CI-002/006/010                                             | M0        |
| P1 Secure & Patch     | 2       | 18    | 4 Critical (F-BUG-001/002/003, F-DEP-302), 5 High (F-SEC-001/002, F-BUG-004/005, F-DEP-401), waves W1–W2 | M1        |
| P2 Modernize          | 4       | 23    | 4 High (F-DEP-103/104/109/211) + all majors                                                              | M2        |
| P3 Clean & Harden     | 2       | 17    | 4 High (F-CLEAN-001, F-TEST-002/003, F-BUG-015), coverage + duplication                                  | M3        |
| P4 Polish             | 2       | 11    | 5 High (F-PERF-001, F-UX-001/002/003, F-DOCS-001), docs                                                  | M4        |

76 tasks, 12 sprints, one developer.

**Critical path (longest chain, 40 developer-days ≈ 8 weeks elapsed):**
Task Pre.1 → Pre.2 → 0.1 → 0.3 → 1.1 → 1.6 → 3.1 → 4.2 → 4.3 → 4.5 → 4.6 → 6.1 → 6.3 → 6.4 → 6.5 → 10.1
(1+1+1+1+3+3+3+3+3+3+3+3+3+3+3+3 = 40). Nothing in P0 starts before ME; nothing in P1 starts before M0; the W3 runtime-floor task (3.1) precedes every framework major that tracks Node types; TypeScript 7 is last in P2 because it recompiles everything; the setup-path doc repair (10.1, depends on both 0.1 and 6.5) closes the chain.

## Phase Pre — Agent environment

**Goal:** a project environment an AI agent can install, configure, build, and test autonomously. · **Milestone ME:** `CLAUDE.md` and `AGENTS.md` exist at repo root (created via planned `/agent-config create`; neither exists today); recorded build/test commands documented in `CLAUDE.md` and Pre.1 notes.

### Sprint Pre — Agent-runnable environment

#### Task Pre.1: Write the agent-runnable environment notes

**Description**: Produce `docs/AGENT_ENV.md` (or equivalent) covering: toolchain (Node — engines floor `>=20`, dev machine runs v24.11.1, GitLab CI runs node:22-slim), install (`npm ci` from `package-lock.json`; note bun.lock drift caveat until Task 0.2 resolves it), required env vars (`JWT_SECRET` ≥32 chars required; `ENCRYPTION_KEY`, `ADMIN_PASSWORD` currently defaulted — see P1; `.env.example` files exist at root/client/server), the recorded commands (`npm run build`, `typecheck`, `lint`, `test`), and the known local-suite caveat: tests fail without exported `JWT_SECRET` until Task 0.1 lands. Serves milestone ME.

**Closes**: — (milestone-enabling: ME)

**Acceptance Criteria**:

- [ ] Notes file exists and names install, env vars, and all four recorded commands verbatim
- [ ] A fresh agent can reach a built state following only the notes + repo files (commands may still hit the JWT_SECRET caveat; restoring green is 0.1)

**Dependencies**: None · **Effort**: S · **Verify**: `test -f docs/AGENT_ENV.md && grep -c "npm run build" docs/AGENT_ENV.md`

#### Task Pre.2: Create CLAUDE.md

**Description**: File absent → `/agent-config create` targeting `CLAUDE.md`. Include the recorded build/test/lint/typecheck commands and the Pre.1 env notes reference. Serves milestone ME. Do not run the skill while planning.

**Closes**: — (milestone-enabling: ME)

**Acceptance Criteria**:

- [ ] `CLAUDE.md` exists at the repo root
- [ ] `CLAUDE.md` names `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`

**Dependencies**: Pre.1 · **Effort**: S · **Verify**: run `/agent-config create` targeting `CLAUDE.md`

#### Task Pre.3: Create AGENTS.md

**Description**: File absent → `/agent-config create` targeting `AGENTS.md`. Improved against agent-config checklists (subagent definitions; pointers only — recorded commands stay in `CLAUDE.md` and Pre.1 notes). Serves milestone ME.

**Closes**: — (milestone-enabling: ME)

**Acceptance Criteria**:

- [ ] `AGENTS.md` exists at the repo root
- [ ] `AGENTS.md` contains no duplicated command canon (points at `CLAUDE.md`)

**Dependencies**: Pre.1 · **Effort**: S · **Verify**: run `/agent-config create` targeting `AGENTS.md`

## Phase P0 — Stabilize

**Goal:** build green, whole suite runnable everywhere, one lockfile truth, CI gating real. · **Milestone M0:** clean checkout → `npm ci && npm run build && npm test` collects 8/8 suites with ≥29/29 passing, reproducibly in GitHub Actions CI.

### Sprint 0 — Restore the verifiable baseline

#### Task 0.1: Make the test suite runnable without exported secrets

**Description**: `parseEnv()` in `server/src/config/env.ts:42` runs at module import and `process.exit(1)`s without `JWT_SECRET` (F-BUG-008; also carries the merged TEST-dimension duplicate of the same defect) — 5/8 suites die at collection outside CI. Either parse lazily/injectably or add vitest `setupFiles` exporting CI-mirrored test values (`JWT_SECRET: ci-test-jwt-secret-min-32-characters-long`, per `.github/workflows/ci.yml:121`). Prefer the non-exiting parse so app code stops carrying an import-time kill switch.

**Closes**: `F-BUG-008` (keeper for the merged test-bootstrap finding)

**Acceptance Criteria**:

- [ ] In a fresh shell with **no** `JWT_SECRET` exported: `cd server && npx vitest run` collects 8/8 files
- [ ] `npm test` exits 0 with ≥ 29/29 tests passing (baseline bar established)
- [ ] `grep -n "process.exit" server/src/config/env.ts` returns no module-load-time exit (or setupFiles documented in vitest.config.ts)

**Dependencies**: Pre.2, Pre.3 · **Effort**: S · **Verify**: `env -i PATH="$PATH" HOME="$HOME" npm test`

#### Task 0.2: Consolidate lockfiles to one resolution source

**Description**: Both `bun.lock` and `package-lock.json` are committed at root/client/server while every CI path uses `npm ci` against package-lock only (F-DEP-004) — two resolution sources, one maintained. Remove bun.lock from tracking (add to .gitignore), keep package-lock.json as canonical.

**Closes**: `F-DEP-004`

**Acceptance Criteria**:

- [ ] `git ls-files | grep bun.lock` returns empty; `.gitignore` covers `bun.lock`
- [ ] From a temp clean clone: `npm ci` succeeds and `npm run build` exits 0
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: S · **Verify**: `git ls-files | grep -c bun.lock` → 0

#### Task 0.3: Make CI gates real

**Description**: Three decorative/broken gates: build job doesn't require test (`ci.yml:123-126`, F-CI-010); GitHub security scan `|| true` can never fail (`ci.yml:178-179`, F-CI-002 — port GitLab's jq-parse-and-exit pattern); GH matrix tests EOL Node 18 (`ci.yml:19,85`) below the engines floor — drop 18 now (full realignment is 3.1).

**Closes**: `F-CI-010`, `F-CI-002`

**Acceptance Criteria**:

- [ ] `needs:` of the build job includes `test` in `.github/workflows/ci.yml`
- [ ] `grep -n "audit-level=moderate || true" .github/workflows/ci.yml` returns nothing; replacement step exits nonzero on high+count > 0
- [ ] Matrix node-version list contains no `18`
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: S · **Verify**: `gh run watch` on a test PR exercising a deliberate lint failure → pipeline red

#### Task 0.4: Rebalance pre-commit hooks

**Description**: Hook is advisory where it matters and heavy where it hurts (`.husky/pre-commit:12-19`, F-CI-006): drop npm-audit from the hook (CI owns it), align local `--max-warnings=0` with CI's tolerated-12 reality (fix the 12 warnings OR relax hook to match CI — pick one bar), document the `--no-verify` bypass policy in CONTRIBUTING.

**Closes**: `F-CI-006`

**Acceptance Criteria**:

- [ ] `.husky/pre-commit` contains no `npm audit` invocation
- [ ] Local and CI warning thresholds are identical (stated in one line in CONTRIBUTING)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: S · **Verify**: `git commit --dry-run` on a dirty file runs lint-staged without audit step

## Phase P1 — Secure & Patch

**Goal:** eliminate the committed-secret class and exploitable holes; ship waves W1–W2. · **Milestone M1:** `npm audit --json` reports 0 high+critical; tj-actions pinned to commit SHA; no EOL base image in pipelines; `grep -rn "intact2025\|intact-default-encryption" server/ docker-compose* k8s/ render.yaml` returns nothing outside test fixtures.

### Sprint 1 — Secrets and exploitable holes

#### Task 1.1: Require real admin credentials; stop seeding defaults

**Description**: ADMIN_PASSWORD defaults to committed `intact2025` and SEED_ON_STARTUP installs it in prod paths (F-BUG-001 + F-SEC-002). Remove the default (mirror JWT_SECRET), add ADMIN_PASSWORD to `validateEnvironment()`, refuse seeding when the password matches any known-default list, document rotation.

**Closes**: `F-BUG-001`, `F-SEC-002`

**Acceptance Criteria**:

- [ ] Server refuses to boot without ADMIN_PASSWORD set (exit message names it)
- [ ] Seeding aborts with error when password ∈ {intact2025, admin, password} ; compose/render/k8s templates no longer default SEED_ON_STARTUP=true without ADMIN_PASSWORD present
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.3 · **Effort**: M · **Verify**: `docker compose -f docker-compose.prod.yml up server` with unset ADMIN_PASSWORD → startup fails fast

#### Task 1.2: Require explicit ENCRYPTION_KEY

**Description**: Committed fallback key decrypts all stored cluster credentials; production-only guard leaves dev/staging exposed (F-BUG-003). Remove default; make the startup guard NODE_ENV-independent.

**Closes**: `F-BUG-003`

**Acceptance Criteria**:

- [ ] Boot without ENCRYPTION_KEY fails in every NODE_ENV
- [ ] `grep -rn "intact-default-encryption-key" server/src` returns nothing
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.3 · **Effort**: S · **Verify**: `env -u ENCRYPTION_KEY npm run dev:server` → exits with named error

#### Task 1.3: Stop leaking credential ciphertext through infra routes

**Description**: `.lean()` on infrastructures list/detail/update bypasses the toJSON transform stripping credentials (F-BUG-002). Use `.select('-credentials')` (or drop `.lean()`), fix the wrong comment at :79, add a regression test asserting no iv/ciphertext/authTag fields in responses.

**Closes**: `F-BUG-002`

**Acceptance Criteria**:

- [ ] GET /api/infrastructures, GET /:id, PUT /:id responses contain no `credentials` subobject (integration assertion in suite)
- [ ] `npm test` holds ≥ 29/29 including the new assertion

**Dependencies**: 0.3 · **Effort**: S · **Verify**: `curl -s localhost:3000/api/infrastructures | grep -c ciphertext` → 0 (with seeded data)

#### Task 1.4: Safe search helper replacing raw RegExp sinks

**Description**: Five sinks build `new RegExp(userInput,'i')` — throw-on-metachar 500s and ReDoS, and defeat the text index (F-BUG-004; keeper for the merged PERF-dimension duplicate). Extract one escaped-search helper (or `$text`/anchored queries) used by services + projects routes.

**Closes**: `F-BUG-004`

**Acceptance Criteria**:

- [ ] `GET /api/services?search=(` returns 200 with results, not 500
- [ ] `grep -cn "new RegExp(" server/src/routes` returns 0 unescaped occurrences
- [ ] `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.3 · **Effort**: S · **Verify**: `curl -s "localhost:3000/api/services?search=%28%29.*%2B"` → 200

#### Task 1.5: Auth hardening bundle

**Description**: Five small fixes: strict rate-limit on POST /api/auth/login (F-BUG-012); requireRole('admin') on users management routes (F-BUG-006); pin `{algorithms:['HS256']}` in jwt sign/verify (F-SEC-007); check `jwt.TokenExpiredError` before `jwt.JsonWebTokenError` so expired sessions report accurately (F-BUG-007); exempt the login request from the global 401-redirect interceptor so failed logins show errors (F-BUG-005, client/src/lib/api.ts:29-32).

**Closes**: `F-BUG-012`, `F-BUG-006`, `F-SEC-007`, `F-BUG-007`, `F-BUG-005`

**Acceptance Criteria**:

- [ ] 6th consecutive failed login from one IP gets 429
- [ ] Non-admin token calling DELETE /api/users/:id gets 403
- [ ] Failed login attempt renders error toast in UI without page reload
- [ ] `grep -n "algorithms" server/src/middleware/auth.ts` shows HS256 pin; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.3 · **Effort**: M · **Verify**: `for i in {1..8}; do curl -XPOST localhost:3000/api/auth/login -d '{"username":"admin","password":"x"}' -w "%{http_code}\n" -o /dev/null; done` shows 429s

#### Task 1.6: Authenticate MongoDB in every deployment path

**Description**: No Mongo auth anywhere: compose files lack MONGO_INITDB_*, k8s StatefulSet has no auth env, app connects credential-less (F-SEC-001). Enable root + app-user auth, wire via compose env/k8s Secret, `authSource=admin` in URI, TLS flag where topology allows.

**Closes**: `F-SEC-001`

**Acceptance Criteria**:

- [ ] `docker compose -f docker-compose.prod.yml up` → mongod requires auth; unauthenticated `mongosh` ping fails
- [ ] App boots against authed Mongo using compose-provided credentials; e2e suites updated for authenticated local URI
- [ ] `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 1.1 · **Effort**: M · **Verify**: `docker compose -f docker-compose.prod.yml exec mongo mongosh --quiet --eval "db.runCommand({connectionStatus:1})" ` without creds → unauthorized

#### Task 1.7: Edge/header hygiene

**Description**: nginx add_header inheritance suppresses security headers on HTML routes (F-SEC-006); unauthenticated /api/health discloses NODE_ENV + DB state (F-SEC-009). Repeat header set per location (or shared include) in client/nginx.conf; minimize public health body.

**Closes**: `F-SEC-006`, `F-SEC-009`

**Acceptance Criteria**:

- [ ] `curl -I https://<host>/` shows X-Frame-Options, Referrer-Policy, Permissions-Policy
- [ ] Public GET /api/health returns `{"status":"ok"}` only; detail gated behind auth
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.3 · **Effort**: S · **Verify**: `curl -sI localhost:3000/api/health | grep -c NODE_ENV` → 0

#### Task 1.8: CSP and token storage

**Description**: scriptSrc carries 'unsafe-inline'+'unsafe-eval' (F-SEC-003) and the JWT sits in localStorage (F-SEC-004). Move to nonced/hashed Vite output; drop unsafe-eval unless Monaco provably needs it (scope via wasm-unsafe-eval otherwise); move token to httpOnly SameSite cookie or in-memory + silent re-auth; expiry-aware logout.

**Closes**: `F-SEC-003`, `F-SEC-004`

**Acceptance Criteria**:

- [ ] Response CSP contains no `'unsafe-inline'` for script-src (or documented nonce mechanism)
- [ ] Browser localStorage contains no JWT after login (devtools check scripted in e2e)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 1.5 · **Effort**: M · **Verify**: `curl -sI localhost:3000/ | grep -i content-security-policy`

#### Task 1.9: Secret scanning parity (delegate)

**Description**: GitHub CI has no secret scan; GitLab job only counts stale artifacts; no pre-commit hook (F-SEC-005). Run `/security-setup` to add gitleaks diff-mode to GitHub CI + pre-commit and full-history scheduled scan; commit `.gitleaks.toml` baseline.

**Closes**: `F-SEC-005`

**Acceptance Criteria**:

- [ ] gitleaks job exists in `.github/workflows/ci.yml` and fails on planted test secret
- [ ] `.gitleaks.toml` committed; pre-commit runs gitleaks on staged diff
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.3 · **Effort**: M · **Verify**: run `/security-setup`; then plant `aws_secret_access_key=dummy` in scratch commit → CI red

#### Task 1.10: Fix workflow shell-injection vectors

**Description**: docs-required.yml interpolates untrusted tj-actions outputs straight into `run:` scripts (F-CI-003). Route every `${{ steps.*.outputs.* }}` through `env:` indirection.

**Closes**: `F-CI-003`

**Acceptance Criteria**:

- [ ] `grep -n 'run:.*${{' .github/workflows/docs-required.yml` returns 0 direct interpolations into scripts
- [ ] Workflow still functions on a PR renaming a doc file
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.3 · **Effort**: S · **Verify**: actionlint run + manual fork-PR simulation with `evil$(touch pwned).md`

### Sprint 2 — Upgrade waves W1–W2

#### Task 2.1: Defuse tj-actions + real doc gate

**Description**: Pin tj-actions/changed-files to the full commit SHA of v47.0.6 at all 3 sites; audit whether workflows ran 2025-03-14/15 and rotate exposed secrets if so (F-DEP-401, CVE-2025-30066 history). Same file: make docs-required.yml enforce a real policy using fetch-depth:0 outputs instead of impossible HEAD~1 diffs (F-CI-004).

**Closes**: `F-DEP-401`, `F-CI-004`

**Acceptance Criteria**:

- [ ] All `tj-actions/changed-files@` refs are 40-char SHAs (`grep -n "tj-actions" .github/workflows/*`)
- [ ] docs-required job exits nonzero on a PR deleting a doc it must update; passes on compliant PR
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 1.10 · **Effort**: M · **Verify**: `grep -rE "uses: tj-actions/changed-files@v[0-9]" .github/workflows/ | wc -l` → 0

#### Task 2.2: Replace EOL Alpine CI image (Critical)

**Description**: alpine:3.20 passed EOL 2026-04-01, used by verify_image_signatures + security_findings_overview jobs (F-DEP-302). Bump to 3.24 (or current stable) in `.gitlab-ci.yml:363` and `.gitlab/ci/secure-container-pipeline.yml:10`; rebuild jobs.

**Closes**: `F-DEP-302`

**Acceptance Criteria**:

- [ ] `grep -rn "alpine:3.20" .gitlab-ci.yml .gitlab/` returns nothing
- [ ] Signature-verification pipeline job green on next tag build
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 2.1 · **Effort**: S · **Verify**: `grep -rn "alpine:" .gitlab-ci.yml .gitlab/ci/ | grep -v "3.2[2-9]" | wc -l` → 0

#### Task 2.3: Root patch/minor batch (W2)

**Description**: prettier 3.9.4→3.9.6 (F-DEP-003). Lockfile refresh only; no majors in this task.

**Closes**: `F-DEP-003`

**Acceptance Criteria**:

- [ ] `npm outdated` (root workspace) shows no patch/minor residue for root devDeps
- [ ] `npm run format:check` green; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.2 · **Effort**: S · **Verify**: `npm ls prettier | grep 3.9.6`

#### Task 2.4: Client patch/minor batch (W2)

**Description**: 26-package caret-range refresh (radix ×12, axios, RHF, zustand, tanstack, xyflow, ts-eslint minors…) — F-DEP-115. Single PR; no majors.

**Closes**: `F-DEP-115`

**Acceptance Criteria**:

- [ ] `cd client && npm outdated` lists no wanted-behind entries
- [ ] `npm run build && npm run typecheck` green; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.2 · **Effort**: S · **Verify**: `(cd client && npx npm-check-updates -p)` review or `npm outdated` empty

#### Task 2.5: Server patch/minor batch (W2)

**Description**: prettier/tsx patches + @typescript-eslint 8.x minors (F-DEP-212). Gate on lint+typecheck+vitest.

**Closes**: `F-DEP-212`

**Acceptance Criteria**:

- [ ] server `npm outdated` shows no patch/minor residue besides tracked majors
- [ ] `npm run lint && npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.2 · **Effort**: S · **Verify**: `cd server && npm outdated | grep -E "prettier|tsx"`

#### Task 2.6: Container hygiene batch

**Description**: Pin ghcr app image to immutable tag+digest in k8s/base/deployment.yaml:50 and confirm embedded Node ≥22 (F-DEP-303); pin mongo-express to 1.0.2 or remove from dev compose given upstream deprecation, bind published ports to 127.0.0.1 and env-source its basic-auth (F-DEP-304 + F-SEC-008); opportunistic nginx-unprivileged 1.31.2→1.31.4 (F-DEP-305).

**Closes**: `F-DEP-303`, `F-DEP-304`, `F-SEC-008`, `F-DEP-305`

**Acceptance Criteria**:

- [ ] k8s base Deployment image ref ends in `@sha256:` digest; overlays inherit
- [ ] `docker-compose.yml` mongo-express ports prefixed `127.0.0.1:` and credentials from env (or service removed)
- [ ] `npm test` / build unaffected - baseline-green holds (>= 29/29 passing)

**Dependencies**: 0.3 · **Effort**: S · **Verify**: `grep -A2 "image:" k8s/base/deployment.yaml | grep sha256`

#### Task 2.7: First-party action majors

**Description**: checkout v4→v7 (19 sites), setup-node v4→v7 (11), cache v4→v6 (5), upload-artifact v4→v7 (1), github-script v7→v9 (2 sites — SPIKE first: inline scripts must not `require('@actions/github')` or shadow injected `getOctokit`) — F-DEP-402…406. Pin each to SHA while at it. **Batching exemption:** these five are workflow YAML ref bumps of first-party actions — config-only, instantly reversible per-line, and verified by the same pipeline run; the one-major-per-task rule exists to attribute package-upgrade breakage, which does not apply here. If any single bump goes red, revert that one ref line independently.

**Closes**: `F-DEP-402`, `F-DEP-403`, `F-DEP-404`, `F-DEP-405`, `F-DEP-406`

**Acceptance Criteria**:

- [ ] No `actions/*@v4|@v7` mutable refs remain in `.github/workflows/`
- [ ] github-script steps reviewed: `grep -n "require(" .github/workflows/docs-quality.yml docs-required.yml` clean; workflows green on push
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 2.1 · **Effort**: M · **Verify**: `grep -rhoE "uses: actions/[a-z-]+@[^ ]+" .github/workflows/ | sort -u`

#### Task 2.8: Replace archived third-party actions; pin GitLab component

**Description**: gaurav-nelson/github-action-markdown-link-check repo archived 2026-04-20 (F-DEP-407) — replace with maintained link-check (mlc container or equivalent), SHA-pinned. Resolve secassured/ci-cd-components v1.2.4 to commit SHA on the GitLab instance and pin the include (F-DEP-408).

**Closes**: `F-DEP-407`, `F-DEP-408`

**Acceptance Criteria**:

- [ ] docs-validate.yml uses replacement action pinned to SHA; link-check job green
- [ ] `.gitlab-ci.yml:2` include ref is a commit SHA
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 2.1 · **Effort**: S · **Verify**: `grep -n "include:" -A2 .gitlab-ci.yml`

## Phase P2 — Modernize

**Goal:** runtime/toolchain current (W3), then every major bumped — one task each, blast radius ascending, dependents after dependencies. · **Milestone M2:** `npm outdated` shows no major-gap entries among in-scope packages, or each survivor carries a written deferral rationale in Deferred below; suite green throughout.

### Sprint 3 — Runtime/toolchain (W3) + root majors

#### Task 3.1: Raise the Node floor and align all runtimes

**Description**: engines `>=20` permits EOL Node 20 and GH matrix tests Node 18 (F-DEP-005); GitLab image trails dev by an LTS (F-DEP-213); @types/node lag on both workspaces (F-DEP-113, F-DEP-209). Set engines `>=22 <25`, GH matrix → [22,24], GitLab image → matching current 22.x or 24 LTS slim, bump @types/node both sides. Migration source: https://endoflife.date/nodejs (verified at audit). Also bumps CI image patch (F-DEP-306).

**Closes**: `F-DEP-005`, `F-DEP-213`, `F-DEP-113`, `F-DEP-209`, `F-DEP-306`, `F-CI-001`

**Acceptance Criteria**:

- [ ] `grep '"node"' package.json` shows `>=22`; matrix has no EOL versions
- [ ] `npm test`, build, typecheck green on both matrix nodes in CI - baseline-green holds (>= 29/29 passing)
- [ ] Both CI systems inject identical test env vars (JWT_SECRET etc.) — diff documented in PR

**Dependencies**: 1.6 · **Effort**: M · **Verify**: `node -e "process.exit(require('./package.json').engines.node.includes('>=22')?0:1)"`

#### Task 3.2: concurrently 8→10

**Description**: Root dev orchestrator two majors behind (F-DEP-001). Requires the ≥22 floor from 3.1. Verified breaking changes: Node <22 dropped, ESM-only exports, removed flags. Source: github.com/open-cli-tools/concurrently/releases.

**Closes**: `F-DEP-001`

**Acceptance Criteria**:

- [ ] `npm run dev` starts both workspaces with prefixed output
- [ ] `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 3.1 · **Effort**: S · **Verify**: `npm ls concurrently | grep 10.`

#### Task 3.3: lint-staged 15→17

**Description**: Two majors (F-DEP-002); v17 needs Node ≥22 (3.1) and git ≥2.32. Inline package.json config unaffected by optional yaml peer. Source: github.com/lint-staged/lint-staged/releases (spike noted for v16 boundary).

**Closes**: `F-DEP-002`

**Acceptance Criteria**:

- [ ] Staged-commit lint run executes on a sample commit
- [ ] `npm run lint:fix` path unchanged behaviorally
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 3.1 · **Effort**: S · **Verify**: stage a badly-formatted file and commit → hook reformats

#### Task 3.4: helmet 7→8

**Description**: Single-touchpoint major (app.ts:4,30) — F-DEP-205. Verify response headers after bump; v8 CSP/header defaults may change app-wide. Migration source: not retrieved — spike (first AC produces the v8 header-diff).

**Closes**: `F-DEP-205`

**Acceptance Criteria**:

- [ ] Header-diff note produced (before/after curl output committed to PR description)
- [ ] `npm test` + smoke: SPA served, API CORS unchanged - baseline-green holds (>= 29/29 passing)

**Dependencies**: 3.1 · **Effort**: S · **Verify**: `npm ls helmet | grep 8.`

#### Task 3.5: Align @types/bcrypt with bcrypt 6

**Description**: Typings trail runtime lib by a major (F-DEP-207). Cheap standalone bump.

**Closes**: `F-DEP-207`

**Acceptance Criteria**:

- [ ] `npm run typecheck` green with types 6
- [ ] bcrypt compare/sign flows covered by 7.2 tests still pass
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: S · **Verify**: `npm ls @types/bcrypt | grep 6.`

### Sprint 4 — Client majors

#### Task 4.1: lucide-react 0.451→1.x

**Description**: 37 importing files (F-DEP-110). Migration source: not retrieved — spike (first AC: changelog review + icon-name diff compile).

**Closes**: `F-DEP-110`

**Acceptance Criteria**:

- [ ] `npx tsc --noEmit` green across client after bump
- [ ] Visual smoke: sidebar/table icon rendering intact
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 3.1 · **Effort**: S · **Verify**: `(cd client && npm ls lucide-react | grep 1.)`

#### Task 4.2: react-router-dom 6→7 (CVE-driven — front of wave)

**Description**: Two moderate CVEs (GHSA-wrjc-x8rr-h8h6 open redirect, GHSA-337j-9hxr-rhxg SSR injection) fixable ONLY in 7.x (F-DEP-103). 19 importing files. json()/defer() removal verified; remaining breaking changes NOT retrievable upstream (docs 404 at audit) — SPIKE: first AC produces the migration guide. After landing, `npm audit` clears the react-router advisories.

**Closes**: `F-DEP-103`

**Acceptance Criteria**:

- [ ] Migration-guide spike note exists in PR (upstream doc or CHANGELOG-derived)
- [ ] `npm audit --json | jq '.metadata.vulnerabilities'` shows 0 total
- [ ] Navigation smoke: all routes render; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 3.1 · **Effort**: M · **Verify**: `cd client && npm ls react-router-dom | grep 7.18`

#### Task 4.3: React 19 (atomic: react + react-dom + @types/react*)

**Description**: F-DEP-101 + F-DEP-102 in ONE PR (47 files import react). Known breakages from react.dev upgrade guide (verified): createRoot required, defaultProps/string refs removed, useRef arg required, JSX namespace move. Source: https://react.dev/blog/2024/04/25/react-19-upgrade-guide.

**Closes**: `F-DEP-101`, `F-DEP-102`

**Acceptance Criteria**:

- [ ] `grep -rn "ReactDOM.render\|findDOMNode" client/src` returns nothing
- [ ] Build + typecheck green; canvas/editor pages smoke-tested manually
- [ ] `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 4.2 · **Effort**: M · **Verify**: `(cd client && npm ls react react-dom | grep -c "19\.")` → 2

#### Task 4.4: zod v4 (client)

**Description**: 4 importing files + feeds @hookform/resolvers (F-DEP-108). Verified breaks: error customization unified, z.record arity, string-format top-level move. Source: https://zod.dev/v4/changelog.

**Closes**: `F-DEP-108`

**Acceptance Criteria**:

- [ ] All forms validate correctly (manual pass over ProjectForm/ServiceForm/ScenarioForm/Login)
- [ ] typecheck green; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 4.2 · **Effort**: M · **Verify**: `(cd client && npm ls zod | grep 4.)`

#### Task 4.5: tailwindcss 3→4 (+ tailwind-merge 3 paired)

**Description**: F-DEP-106 + F-DEP-107 in one PR (57 className-bearing files). Run official codemod `npx @tailwindcss/upgrade`; config JS → CSS-first; renamed utilities swept. Source: https://tailwindcss.com/docs/upgrade-guide (verified).

**Closes**: `F-DEP-106`, `F-DEP-107`

**Acceptance Criteria**:

- [ ] Codemod diff reviewed; `grep -rn "@tailwind" client/src` shows `@import "tailwindcss"`
- [ ] Build output CSS size compared (record delta in PR); visual smoke on Login/tables/editor
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 4.3 · **Effort**: M · **Verify**: `(cd client && npm ls tailwindcss | grep 4.)`

#### Task 4.6: Vite 8 + plugin-react 6 (atomic)

**Description**: F-DEP-104 + F-DEP-105. Rolldown switch, Lightning CSS, CJS interop change; browser target raised. Source: https://vite.dev/guide/migration (verified). Re-check chunk sizes afterward (feeds M4 budget).

**Closes**: `F-DEP-104`, `F-DEP-105`

**Acceptance Criteria**:

- [ ] `npm run build` green with rolldown options; dev HMR works
- [ ] Chunk-size table posted in PR (baseline: index 487.06 kB, ScenarioDetail 718.84 kB minified)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 4.5 · **Effort**: M · **Verify**: `(cd client && npm ls vite | grep 8.)`

#### Task 4.7: monaco-editor 0.52→0.56

**Description**: Via @monaco-editor/react wrapper (F-DEP-114, Low). Spike: installed CHANGELOG ends at 0.52 — first AC reviews 0.53–0.56 release notes.

**Closes**: `F-DEP-114`

**Acceptance Criteria**:

- [ ] YAML editor loads, edit + save round-trips in ScenarioDetail
- [ ] Build green
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 4.6 · **Effort**: S · **Verify**: `(cd client && npm ls monaco-editor | grep 0.56)`

#### Task 4.8: js-yaml v4/v5 reconciliation

**Description**: Client declares ^4.3.1 while latest is 5.x and server overrides to ^4.3.1 (F-DEP-112) — coordinated decision required to avoid divergent duplicates. SPIKE: produce v5 breaking-change note, decide bump-both or hold-both; never split versions across workspaces.

**Closes**: `F-DEP-112`

**Acceptance Criteria**:

- [ ] Decision recorded in PR (bump-both or hold-with-rationale); `npm ls js-yaml` shows one resolved version tree
- [ ] Topology YAML parse round-trip test green
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.2 · **Effort**: S · **Verify**: `npm ls js-yaml | sort -u | wc -l` (single version line)

### Sprint 5 — Server majors

#### Task 5.1: vitest 3→4

**Description**: Test runner major; gate is the 8-suite suite itself (F-DEP-203). Migration source: not retrieved — spike (first AC produces v4 migration notes).

**Closes**: `F-DEP-203`

**Acceptance Criteria**:

- [ ] All 8 suites collect and pass under v4
- [ ] Coverage config (from 7.1) still functional
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: M · **Verify**: `(cd server && npm ls vitest | grep 4.)`

#### Task 5.2: zod v4 (server)

**Description**: env schema + validators (9 files, F-DEP-204). Verified breaks: unified error param, ip()/cidr() moves (relevant to validation.ts), coerce semantics. Source: https://zod.dev/v4/changelog. Must keep env.ts boot behavior identical (coordinates with 4.8).

**Closes**: `F-DEP-204`

**Acceptance Criteria**:

- [ ] Boot with valid/invalid env mirrors pre-upgrade messages
- [ ] Validation middleware unit tests (from 7.7) green; `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 5.1 · **Effort**: M · **Verify**: `(cd server && npm ls zod | grep 4.)`

#### Task 5.3: mongoose 8→9

**Description**: 17 model/repository files (F-DEP-202). Full 8→9 migration guide NOT retrieved (releases index only) — SPIKE: first AC produces the guide; audit deprecated query options (`new: true` usage).

**Closes**: `F-DEP-202`

**Acceptance Criteria**:

- [ ] Migration guide summarized in PR; `grep -rn "returnOriginal\|new: true" server/src` audited
- [ ] Seed + integration tests green against Mongo (7.4 harness)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.1 · **Effort**: M · **Verify**: `(cd server && npm ls mongoose | grep 9.)`

#### Task 5.4: @kubernetes/client-node 1.4→2.0

**Description**: Exact-pinned 1.4.0 (F-DEP-201); v2 moves fetch→undici, drops Node 20/23 (floor already raised by 3.1). Revalidate the ip-address/js-yaml overrides (server/package.json:23-26) afterwards — remove any that become unnecessary. Source: github.com/kubernetes-client/javascript/releases (verified).

**Closes**: `F-DEP-201`

**Acceptance Criteria**:

- [ ] kubernetesDeploy.test.ts (44 tests) green under v2 fake-client API
- [ ] Overrides block pruned or justified; live-deploy smoke against kind/test cluster
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 3.1 · **Effort**: M · **Verify**: `(cd server && npm ls @kubernetes/client-node | grep 2.)`

#### Task 5.5: Express 5 (+ @types/express 5, atomic)

**Description**: Largest server surface — 18 importing files (F-DEP-206 + F-DEP-208). Verified breaks: wildcard path syntax, req.body undefined default, req.query getter, res.send/status signatures, async-error forwarding. Codemod available: `npx codemod @expressjs/v5-migration-recipe`. Source: https://expressjs.com/en/guide/migrating-5.html (verified). e2e suites are the behavioral net.

**Closes**: `F-DEP-206`, `F-DEP-208`

**Acceptance Criteria**:

- [ ] All 4 route e2e suites green under Express 5
- [ ] `grep -rn "res.send(.*,.*status)\|app.all('\*'" server/src` audited/cleaned; async handlers rely on auto-forwarding
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.3 · **Effort**: M · **Verify**: `(cd server && npm ls express | grep 5.)`

### Sprint 6 — Toolchain tail

#### Task 6.1: ESLint 10 (repo-wide pairs)

**Description**: eslint+@eslint/js majors in both workspaces (F-DEP-111, F-DEP-210). SPIKE: verify typescript-eslint 8.x compat matrix with eslint 10 first; flat-config already in use.

**Closes**: `F-DEP-111`, `F-DEP-210`

**Acceptance Criteria**:

- [ ] Compat matrix note in PR; `npm run lint` green in both workspaces with no new unfixable errors
- [ ] Warning count ≤ 12 (audit baseline)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 4.6 · **Effort**: M · **Verify**: `npm run lint 2>&1 | tail -1` both workspaces

#### Task 6.2: MongoDB 7→8 staged upgrade

**Description**: One major behind, supported until 2027-08 (F-DEP-301) across prod compose, dev compose, k8s StatefulSet, CI service. Staged featureCompatibilityVersion advancement; verify no removed server params in use. Source: mongodb lifecycles page — SPIKE for FCV runbook.

**Closes**: `F-DEP-301`

**Acceptance Criteria**:

- [ ] FCV runbook in PR; staging upgrade executed with backup/restore rehearsal
- [ ] Integration tests green against 8.x; compose/k8s/CI manifests updated consistently
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.5 · **Effort**: M · **Verify**: `docker compose exec mongo mongosh --eval "db.adminCommand({getParameter:1,featureCompatibilityVersion:1})"` → 8.0

#### Task 6.3: TypeScript 7 compatibility spike

**Description**: TS7 is the native Go compiler (GA 2026-07-08, verified) — two-major jump on BOTH workspaces (F-DEP-109, F-DEP-211) that recompiles everything and gates eslint/vitest interplay. This spike produces the go/no-go artifact: compat of typescript-eslint 8.x, vite plugin, vitest, tsx with tsgo; strict-by-default and removed-flag audit (baseUrl, moduleResolution:node).

**Closes**: — (serves milestone M2: compatibility spike enabling closure of `F-DEP-109`/`F-DEP-211`)

**Acceptance Criteria**:

- [ ] Written compat matrix committed (tool × status × evidence command)
- [ ] Go/no-go decision recorded; if NO-GO → both majors move to Deferred with this rationale and revisit trigger (next minor releases)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 6.1 · **Effort**: M · **Verify**: `docs/ts7-compat.md` exists with dated matrix

#### Task 6.4: TypeScript 7 — client

**Description**: Execute the 6.3 decision on client (70 files, F-DEP-109): tsconfig adjustments for strict-default/esnext-module defaults, removed-flag cleanup.

**Closes**: `F-DEP-109`

**Acceptance Criteria**:

- [ ] `(cd client && npx tsc --noEmit)` green under 7.0.x
- [ ] Build output byte-comparable (±2%) vs 5.9 baseline; `npm test` green — OR deferral recorded per 6.3 NO-GO - baseline-green holds (>= 29/29 passing)

**Dependencies**: 6.3 · **Effort**: M · **Verify**: `(cd client && npm ls typescript | grep 7.)` or Deferred entry

#### Task 6.5: TypeScript 7 — server

**Description**: Same for server (51 files, F-DEP-211) — last P2 task; everything recompiles through it.

**Closes**: `F-DEP-211`

**Acceptance Criteria**:

- [ ] Server typecheck + build green under 7.0.x (or deferral recorded)
- [ ] `npm test` full suite green; Dockerfile.unified build succeeds - baseline-green holds (>= 29/29 passing)

**Dependencies**: 6.4 · **Effort**: M · **Verify**: `(cd server && npm ls typescript | grep 7.)` or Deferred entry

## Phase P3 — Clean & Harden

**Goal:** measure coverage, backfill tests on the dangerous paths, then de-duplicate and decompose. · **Milestone M3:** a coverage tool is configured and CI reports a number with an enforced threshold (coverage was Not Assessed at audit — measurement before improvement); no logic block repeated ≥3× from the DEAD findings survives; `as unknown as` count in server/src/routes is 0.

### Sprint 7 — Measurement and characterization tests

#### Task 7.1: Coverage tooling + CI threshold

**Description**: Install @vitest/coverage-v8, add `test:coverage` script + coverage config (F-TEST-005); publish report artifact and enforce an initial threshold in CI (F-CI-005). Initial threshold: 0-fail reporting mode first (measurement), raise after 7.6/7.7 land.

**Closes**: `F-TEST-005`, `F-CI-005`

**Acceptance Criteria**:

- [ ] `npm run test:coverage` prints a line/branch percentage
- [ ] CI uploads coverage artifact; threshold config present (even if initially informational)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1 · **Effort**: S · **Verify**: `cd server && npm run test:coverage 2>&1 | grep -i "all files"`

#### Task 7.2: Authentication surface tests (delegate)

**Description**: `/test-coverage` on server auth: requireAuth middleware (valid/expired/malformed/missing token) and login route (success/wrong-password/unknown user/rate-limit trigger) — F-TEST-003. Exemplar: kubernetesDeploy.test.ts mocking style.

**Closes**: `F-TEST-003`

**Acceptance Criteria**:

- [ ] New test files cover every 401/403 branch of middleware/auth.ts and auth.routes.ts
- [ ] `npm test` green with new tests counted - baseline-green holds (>= 29/29 passing)

**Dependencies**: 7.1 · **Effort**: M · **Verify**: run `/test-coverage on server/src/middleware/auth.ts server/src/routes/auth.routes.ts, then npm test`

#### Task 7.3: Encryption utils tests

**Description**: Round-trip fidelity, distinct IVs per call, corrupted-ciphertext failure mode for utils/encryption.ts (F-TEST-004).

**Closes**: `F-TEST-004`

**Acceptance Criteria**:

- [ ] Dedicated crypto test file with the four assertions
- [ ] Wired into default suite run
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.1 · **Effort**: S · **Verify**: `npx vitest run src/utils/__tests__ -t encryption` (path adjusted as created)

#### Task 7.4: Hermetic MongoDB for tests

**Description**: e2e suites silently skip without a live Mongo (F-TEST-006). Adopt mongodb-memory-server locally (CI keeps service container) or emit explicit skip markers + fail when zero DB suites ran.

**Closes**: `F-TEST-006`

**Acceptance Criteria**:

- [ ] Fresh machine without Mongo: `npm test` exercises (not skips) the DB suites - baseline-green holds (>= 29/29 passing)
- [ ] Suite count stable across machines
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.1 · **Effort**: M · **Verify**: `systemctl is-active mongod` stopped → `npm test` still runs DB suites

#### Task 7.5: Client test framework (delegate)

**Description**: `/test-coverage` bootstrap for client: vitest + @testing-library/react + config + `test` script (F-TEST-002), seeded with Login form and one ProjectTable interaction test.

**Closes**: `F-TEST-002`

**Acceptance Criteria**:

- [ ] `(cd client && npm test)` runs and passes ≥ 2 component tests - baseline-green holds (>= 29/29 passing)
- [ ] Root `test` script extended to client suite (or documented exclusion)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.1 · **Effort**: M · **Verify**: `cd client && npm test`

#### Task 7.6: Route gap backfill — credential-touching writes (delegate)

**Description**: `/test-coverage` on projects/users/partners write paths incl. delete-guard behavior (F-TEST-007 part 1) — the modules whose failure costs data.

**Closes**: `F-TEST-007` (part 1 of 2)

**Acceptance Criteria**:

- [ ] Users/projects/partners routes have e2e coverage of create/update/delete happy+error paths
- [ ] Coverage report shows these files nonzero
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.4 · **Effort**: M · **Verify**: run `/test-coverage on server/src/routes/{projects,users,partners}, then npm run test:coverage`

#### Task 7.7: Route gap backfill — validation & error handling (delegate)

**Description**: `/test-coverage` on middleware/validation.ts + errorHandler.ts + remaining route modules (services/categories/sectors) (F-TEST-007 part 2). Raises the CI coverage threshold set in 7.1 to its real value.

**Closes**: `F-TEST-007`

**Acceptance Criteria**:

- [ ] Validation middleware unit-tested per schema; errorHandler 400-vs-500 mapping tested
- [ ] Enforced coverage threshold raised above initial and documented
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.6 · **Effort**: M · **Verify**: `npm run test:coverage` meets the enforced threshold

#### Task 7.8: Regression-test policy

**Description**: Require failing-then-passing test per src-touching bugfix; backfill one test each for recent fixes (bootstrap/pipeline commits d24f7f1, 9d06662) (F-TEST-008).

**Closes**: `F-TEST-008`

**Acceptance Criteria**:

- [ ] CONTRIBUTING states the policy with example
- [ ] ≥ 2 backfilled regression tests present and green
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.2 · **Effort**: S · **Verify**: `git log --oneline --since="<policy date>" --name-only | grep test | wc -l` grows per fix

### Sprint 8 — Deduplicate and decompose (tests now cover the seams)

#### Task 8.1: Route middleware/helper extraction

**Description**: Eliminate the 36×try/catch + 29×safeParse + 28×findById-404 boilerplate and the drifted users-route variant (F-BUG-015 + F-CLEAN-005, absorbing the DEAD-dimension verbatim-block duplicate): validateObjectIdParam, asyncHandler, entity-loader helpers applied across all 9 route files; fix NaN pagination parsing (F-BUG-014); add project-delete scenario guard (F-BUG-011).

**Closes**: `F-BUG-015`, `F-BUG-014`, `F-BUG-011`, `F-CLEAN-005`

**Acceptance Criteria**:

- [ ] `grep -rc "safeParse" server/src/routes/*.ts | awk -F: '{s+=$2} END{print s}'` drops ≥ 60%
- [ ] Malformed :id on ANY route returns 400 (parametrized test)
- [ ] Deleting a project with scenarios is blocked/cascades per chosen policy (test)
- [ ] `npm test` green - baseline-green holds (>= 29/29 passing)

**Dependencies**: 7.6 · **Effort**: M · **Verify**: `npm test` + grep counts above

#### Task 8.2: ServiceForm decomposition — part 1

**Description**: Extract StandardsEditor + VersionsEditor sections with own state from the 1218-line component (F-CLEAN-001 part 1). Client tests from 7.5 are the net.

**Closes**: `F-CLEAN-001` (part 1)

**Acceptance Criteria**:

- [ ] ServiceForm main function < 700 lines; extracted components unit-render in isolation
- [ ] Form submit payload byte-identical (snapshot test)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.5 · **Effort**: M · **Verify**: `awk '/function ServiceForm/,/^}/' client/src/components/services/ServiceForm.tsx | wc -l` < 700

#### Task 8.3: ServiceForm decomposition — part 2

**Description**: Extract InteractsWithEditor + TrlSection + payload assembly (F-CLEAN-001 part 2).

**Closes**: `F-CLEAN-001`

**Acceptance Criteria**:

- [ ] ServiceForm main function < 300 lines; all sections isolated
- [ ] Existing form tests green; manual save flow verified
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 8.2 · **Effort**: M · **Verify**: same measurement < 300

#### Task 8.4: Extract scenario execution/SSE services

**Description**: Move SSE stream/poll machinery + execute orchestration out of routes into services (F-CLEAN-004); rewrite the push()+save() race into atomic updates (F-BUG-009).

**Closes**: `F-CLEAN-004`, `F-BUG-009`

**Acceptance Criteria**:

- [ ] scenarios.routes.ts handlers < 40 lines each; execution-stream service owns poll loop
- [ ] Concurrent-execute race test (two parallel POSTs) loses no records
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.7 · **Effort**: M · **Verify**: `npm test` incl. new race test

#### Task 8.5: Component extractions — Login & TopologyCanvas

**Description**: Login 450-line inline style → stylesheet + BrandPanel component (F-CLEAN-002); TopologyCanvasInner → ServicePalette + orchestration split (F-CLEAN-003).

**Closes**: `F-CLEAN-002`, `F-CLEAN-003`

**Acceptance Criteria**:

- [ ] Login.tsx contains no `<style>` block; styles imported
- [ ] Palette dropdowns isolated components with own state; canvas interactions unaffected (manual smoke)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.5 · **Effort**: M · **Verify**: `grep -c "<style" client/src/pages/Login.tsx` → 0

#### Task 8.6: ScenarioDetail hooks + honest typing

**Description**: Split 485-line page into useScenarioTopology/useWorkspaceTabSync + section wiring (F-CLEAN-007); type augmented Express Request and Execution subdoc DTOs eliminating the 17 double-casts (F-CLEAN-012).

**Closes**: `F-CLEAN-007`, `F-CLEAN-012`

**Acceptance Criteria**:

- [ ] ScenarioDetail.tsx < 250 lines; hooks unit-tested
- [ ] `grep -rn "as unknown as" server/src/routes | wc -l` → 0
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 7.5, 8.4 · **Effort**: M · **Verify**: greps above

#### Task 8.7: Constants, comments, module hygiene

**Description**: Single connect-with-retry util reconciling bootstrap vs database retry policies (F-CLEAN-006); name MAX_LIST_LIMIT both sides (F-CLEAN-008); REPOSITORY_TABLES const (F-CLEAN-009); delete narration comments (F-CLEAN-010); split sse.ts/types.ts from api.ts (F-CLEAN-011).

**Closes**: `F-CLEAN-006`, `F-CLEAN-008`, `F-CLEAN-009`, `F-CLEAN-010`, `F-CLEAN-011`

**Acceptance Criteria**:

- [ ] One retry util exists; contradictory second implementation deleted
- [ ] `grep -rn "limit: 1000" client/src | wc -l` → references one constant; api.ts < 300 lines with sse.ts/types.ts extracted
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 8.1 · **Effort**: M · **Verify**: greps above + `npm test`

#### Task 8.8: Dead-code sweep (delegate)

**Description**: `/code-review mode cleanup` executing the DEAD decisions: logger adopt-or-delete (118 console.* sites, F-DEAD-003), half-wired service-version path decision (F-DEAD-004), unused infra get (005), mutation-shell hook + ApiError type (006), card.tsx deletion (007), type unexports (008), branding single-source (009), shared date formatters (010).

**Closes**: `F-DEAD-003`, `F-DEAD-004`, `F-DEAD-005`, `F-DEAD-006`, `F-DEAD-007`, `F-DEAD-008`, `F-DEAD-009`, `F-DEAD-010`

**Acceptance Criteria**:

- [ ] Every listed decision implemented or explicitly recorded in PR description with rationale
- [ ] `npm run build && npm test` green; no dead-symbol regressions (`ts-prune` or grep spot-checks clean) - baseline-green holds (>= 29/29 passing)

**Dependencies**: 8.7 · **Effort**: M · **Verify**: run `/code-review` with args `mode:cleanup`; then `npm test`

#### Task 8.9: CI cache/install hygiene

**Description**: Cache ~/.npm only (drop node_modules pull-push waste), stop swallowing npm ci errors (F-CI-009).

**Closes**: `F-CI-009`

**Acceptance Criteria**:

- [ ] `.gitlab-ci.yml` cache paths exclude node_modules; no `2>/dev/null` on npm ci
- [ ] Pipeline green with cache hit logged
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 2.7 · **Effort**: S · **Verify**: inspect pipeline log cache section

## Phase P4 — Polish

**Goal:** UX safety, performance budgets, docs matching code. · **Milestone M4:** UX High findings closed; build chunks at-or-below audited sizes with ScenarioDetail strictly reduced; every documented setup command executes in a fresh shell.

### Sprint 9 — UX safety and performance

#### Task 9.1: Destructive-action safety

**Description**: AlertDialog-confirm topology Reset (renamed Clear canvas) (F-UX-001); beforeunload + dirty-tab/back confirms in scenario editor (F-UX-002); confirm Tear Down (F-UX-003).

**Closes**: `F-UX-001`, `F-UX-002`, `F-UX-003`

**Acceptance Criteria**:

- [ ] Reset/Tear Down unreachable without explicit dialog confirmation (component tests)
- [ ] Dirty navigation triggers beforeunload + in-app confirm; clean navigation does not
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 8.6 · **Effort**: M · **Verify**: `(cd client && npm test)` incl. new dialog tests

#### Task 9.2: Error states and consistent confirms

**Description**: isError handling with Retry distinct from empty states (F-UX-004); onError toasts for delete mutations (F-UX-005); standardize AlertDialog idiom (F-UX-006); catch-all NotFound route (F-UX-008).

**Closes**: `F-UX-004`, `F-UX-005`, `F-UX-006`, `F-UX-008`

**Acceptance Criteria**:

- [ ] With API down, pages render error+Retry, not "No projects found"
- [ ] All four tables use shared AlertDialog; unknown URL renders NotFound with nav links
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 9.1 · **Effort**: M · **Verify**: component tests + manual API-kill smoke

#### Task 9.3: Navigation orientation

**Description**: Prefix-based active nav highlighting + breadcrumbs on detail/editor pages (F-UX-007).

**Closes**: `F-UX-007`

**Acceptance Criteria**:

- [ ] On /projects/:id the Projects nav item is highlighted; breadcrumb renders trail
- [ ] Trunk test passes: stranger can orient from any deep page screenshot
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 9.2 · **Effort**: M · **Verify**: manual walkthrough + snapshot test

#### Task 9.4: Copy and target polish

**Description**: Plain-language labels for Atomic/Composite, gloss NIS2, friendly enum messages (F-UX-011,012); Deploy disabled-state helper text (009); enlarge tab-close hit area (010).

**Closes**: `F-UX-009`, `F-UX-010`, `F-UX-011`, `F-UX-012`

**Acceptance Criteria**:

- [ ] No raw zod enum text reachable via form validation failures (test asserts custom message)
- [ ] Tab-close control ≥ 24px effective target; Deploy tooltip/helper explains requirement
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 9.1 · **Effort**: S · **Verify**: component tests

#### Task 9.5: PDF lazy-loading + chunk budget

**Description**: Dynamic-import pdf-export inside the Export onClick (F-PERF-001); record new chunk sizes vs audited baseline (index 487.06 kB, ScenarioDetail 718.84 kB minified).

**Closes**: `F-PERF-001`

**Acceptance Criteria**:

- [ ] jspdf absent from initial ScenarioDetail chunk (`grep -l jspdf server/public/assets/ScenarioDetail-*.js` after build → no match)
- [ ] ScenarioDetail chunk measurably below 718.84 kB; figure posted in PR
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 4.6 · **Effort**: S · **Verify**: `npm run build` output table

#### Task 9.6: Server response slimming

**Description**: Projection for project-scenario list (drop topology/executions from list payloads) (F-PERF-002); slim picker endpoint for the 1000-service dropdown (F-PERF-006); reuse 8.1 helpers.

**Closes**: `F-PERF-002`, `F-PERF-006`

**Acceptance Criteria**:

- [ ] List response excludes topology/executions fields (contract test)
- [ ] Scenario open transfers < 100 kB for picker data on seed catalog (measured in test)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 8.1 · **Effort**: M · **Verify**: contract tests + `npm test`

#### Task 9.7: K8s call parallelization + deploy rollback

**Description**: Promise.all batch Deployment/Service creation; single label-selector status query replacing serial loops (F-PERF-003, F-PERF-004); best-effort teardown on mid-deploy failure (F-BUG-010).

**Closes**: `F-PERF-003`, `F-PERF-004`, `F-BUG-010`

**Acceptance Criteria**:

- [ ] Deploy of N-node topology issues calls concurrently (fake-client assertion)
- [ ] Injected mid-loop failure tears down created resources (test); status poll uses one list call per tick
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.4, 8.4 · **Effort**: M · **Verify**: `npx vitest run src/services/__tests__/kubernetesDeploy.test.ts`

#### Task 9.8: Client streaming resilience + bounded memory

**Description**: SSE reader notifies onError on premature stream end (F-BUG-013); ExecutionConsole ring-buffer cap + windowed render (F-PERF-008); cap retained executions server-side (F-PERF-009); contain drag-time re-renders by keeping node-position updates local to the canvas and lifting only debounced commits (F-PERF-007).

**Closes**: `F-BUG-013`, `F-PERF-008`, `F-PERF-009`, `F-PERF-007`

**Acceptance Criteria**:

- [ ] Abrupt stream close flips console to error state (component test)
- [ ] Log array capped at configured max under simulated 2000-line stream; executions array capped per policy constant
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 9.6 · **Effort**: M · **Verify**: `(cd client && npm test)` + server contract test

### Sprint 10 — Documentation alignment

#### Task 10.1: Repair the setup path (delegate)

**Description**: `/doc-manager` executing the fix for F-DOCS-001 (make dev/start load .env via `--env-file` OR correct all four doc sites to export vars), plus F-DOCS-005 (client-testing section) and F-DOCS-012 (counts/repo-name). The code-side .env loading alternative is legitimate here since DOCS-001's root cause straddles both.

**Closes**: `F-DOCS-001`, `F-DOCS-005`, `F-DOCS-012`

**Acceptance Criteria**:

- [ ] Fresh-shell reproduction of README quick start reaches a running dev server (or documented export path verified)
- [ ] `grep -rn "health-check\|memory-profiling" docs/` cleaned per 10.3 overlap avoided — only 001/005/012 touched here
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 0.1, 6.5 · **Effort**: M · **Verify**: run `/doc-manager`; then fresh-shell quick-start walkthrough

#### Task 10.2: Regenerate API/architecture/schema docs (delegate)

**Description**: `/doc-manager` regenerating: API.md missing/incorrect endpoints (F-DOCS-002,003), backend architecture Bun-era drift (006), partners collection omission (010), phantom hooks/ directory (011).

**Closes**: `F-DOCS-002`, `F-DOCS-003`, `F-DOCS-006`, `F-DOCS-010`, `F-DOCS-011`

**Acceptance Criteria**:

- [ ] Every endpoint in API.md matches a registered route (scripted diff check)
- [ ] backend.md runtime/tree matches current src (spot-check list in PR)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 5.5 · **Effort**: M · **Verify**: run `/doc-manager`; scripted route-vs-docs diff green

#### Task 10.3: Sync configuration documentation (delegate)

**Description**: `/doc-manager` syncing configuration.md zod snippet + .env.example with env.ts truth (F-DOCS-007); branding default table (008); prune dead .env.prod vars (009); remove nonexistent health-check/memory-profiling runbook commands (004). Last task on the critical path — documents the final version set.

**Closes**: `F-DOCS-004`, `F-DOCS-007`, `F-DOCS-008`, `F-DOCS-009`

**Acceptance Criteria**:

- [ ] Documented env schema diff vs env.ts is empty (var name/validator comparison scripted)
- [ ] Every command in DEPLOYMENT.md exists in some package.json (`grep`-verifiable list)
- [ ] `npm test` exits 0 with >= 29/29 tests passing - baseline-green holds

**Dependencies**: 6.5 · **Effort**: S · **Verify**: run `/doc-manager`; scripted checks above

## Dependency table

| Task  | Depends on   | Blocks                             | Wave |
| ----- | ------------ | ---------------------------------- | ---- |
| Pre.1 | —            | Pre.2, Pre.3                       | W0   |
| Pre.2 | Pre.1        | 0.1                                | W0   |
| Pre.3 | Pre.1        | 0.1                                | W0   |
| 0.1   | Pre.2, Pre.3 | 0.2, 0.3, 0.4, 3.5, 5.1, 7.1, 10.1 | W0   |
| 0.2   | 0.1          | 2.3, 2.4, 2.5                      | W0   |
| 0.3   | 0.1          | 1.1–1.10, 2.1, 2.2, 2.6            | W1   |
| 0.4   | 0.1          | —                                  | W0   |
| 1.1   | 0.3          | 1.6                                | W1   |
| 1.2   | 0.3          | —                                  | W1   |
| 1.3   | 0.3          | —                                  | W1   |
| 1.4   | 0.3          | —                                  | W1   |
| 1.5   | 0.3          | 1.8                                | W1   |
| 1.6   | 1.1          | 3.1                                | W1   |
| 1.7   | 0.3          | —                                  | W1   |
| 1.8   | 1.5          | —                                  | W1   |
| 1.9   | 0.3          | —                                  | W1   |
| 1.10  | 0.3          | 2.1                                | W1   |
| 2.1   | 1.10         | 2.2, 2.7, 2.8                      | W2   |
| 2.2   | 2.1          | —                                  | W2   |
| 2.3   | 0.2          | —                                  | W2   |
| 2.4   | 0.2          | —                                  | W2   |
| 2.5   | 0.2          | —                                  | W2   |
| 2.6   | 0.3          | —                                  | W2   |
| 2.7   | 2.1          | 8.9                                | W2   |
| 2.8   | 2.1          | —                                  | W2   |
| 3.1   | 1.6          | 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.4  | W3   |
| 3.2   | 3.1          | —                                  | W3   |
| 3.3   | 3.1          | —                                  | W3   |
| 3.4   | 3.1          | —                                  | W4   |
| 3.5   | 0.1          | —                                  | W4   |
| 4.1   | 3.1          | —                                  | W4   |
| 4.2   | 3.1          | 4.3, 4.4                           | W4   |
| 4.3   | 4.2          | 4.5                                | W4   |
| 4.4   | 4.2          | —                                  | W4   |
| 4.5   | 4.3          | 4.6                                | W4   |
| 4.6   | 4.5          | 4.7, 6.1, 9.5                      | W4   |
| 4.7   | 4.6          | —                                  | W4   |
| 4.8   | 5.2          | —                                  | W4   |
| 5.1   | 0.1          | 5.2, 5.3                           | W4   |
| 5.2   | 5.1          | 4.8                                | W4   |
| 5.3   | 5.1          | 5.5                                | W4   |
| 5.4   | 3.1          | 9.7                                | W4   |
| 5.5   | 5.3          | 6.2, 10.2                          | W4   |
| 6.1   | 4.6          | 6.3                                | W4   |
| 6.2   | 5.5          | —                                  | W4   |
| 6.3   | 6.1          | 6.4                                | W4   |
| 6.4   | 6.3          | 6.5                                | W4   |
| 6.5   | 6.4          | 10.1, 10.3                         | W4   |
| 7.1   | 0.1          | 7.2, 7.3, 7.4, 7.5                 | W5   |
| 7.2   | 7.1          | 7.8                                | W5   |
| 7.3   | 7.1          | —                                  | W5   |
| 7.4   | 7.1          | 7.6                                | W5   |
| 7.5   | 7.1          | 8.2, 8.5, 8.6                      | W5   |
| 7.6   | 7.4          | 7.7, 8.1                           | W5   |
| 7.7   | 7.6          | 8.4                                | W5   |
| 7.8   | 7.2          | —                                  | W5   |
| 8.1   | 7.6          | 8.7, 9.6                           | W6   |
| 8.2   | 7.5          | 8.3                                | W6   |
| 8.3   | 8.2          | —                                  | W6   |
| 8.4   | 7.7          | 8.6, 9.7                           | W6   |
| 8.5   | 7.5          | —                                  | W6   |
| 8.6   | 7.5, 8.4     | 9.1                                | W6   |
| 8.7   | 8.1          | 8.8                                | W6   |
| 8.8   | 8.7          | —                                  | W6   |
| 8.9   | 2.7          | —                                  | W6   |
| 9.1   | 8.6          | 9.2, 9.4                           | W7   |
| 9.2   | 9.1          | 9.3                                | W7   |
| 9.3   | 9.2          | —                                  | W7   |
| 9.4   | 9.1          | —                                  | W7   |
| 9.5   | 4.6          | —                                  | W7   |
| 9.6   | 8.1          | 9.8                                | W7   |
| 9.7   | 5.4, 8.4     | —                                  | W7   |
| 9.8   | 9.6          | —                                  | W7   |
| 10.1  | 0.1, 6.5     | —                                  | W8   |
| 10.2  | 5.5          | —                                  | W8   |
| 10.3  | 6.5          | —                                  | W8   |

## Execution waves

| Wave | Tasks (all prerequisites met — may run in parallel within the wave)             |
| ---- | ------------------------------------------------------------------------------- |
| 1    | Pre.1                                                                           |
| 2    | Pre.2, Pre.3                                                                    |
| 3    | 0.1                                                                             |
| 4    | 0.2, 0.3, 0.4, 3.5, 5.1, 7.1                                                    |
| 5    | 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.9, 1.10, 2.3, 2.4, 2.5, 2.6, 7.2, 7.3, 7.4, 7.5 |
| 6    | 1.6, 1.8, 2.1, 5.2, 5.3, 7.6, 7.8                                               |
| 7    | 2.2, 2.7, 2.8, 3.1, 4.8, 5.5, 6.2, 7.7, 8.1, 8.2, 8.5, 10.2                     |
| 8    | 3.2, 3.3, 3.4, 4.1, 4.2, 5.4, 8.3, 8.4, 8.7, 8.9, 9.6                           |
| 9    | 4.3, 4.4, 8.6, 8.8, 9.7, 9.8                                                    |
| 10   | 4.5, 9.1                                                                        |
| 11   | 4.6, 9.2                                                                        |
| 12   | 4.7, 6.1, 9.3                                                                   |
| 13   | 6.3                                                                             |
| 14   | 6.4                                                                             |
| 15   | 6.5                                                                             |
| 16   | 10.1, 10.3                                                                      |

## Milestones

| ID  | Phase | Exit condition (measurable)                                                                                                                                                   | Verify with                                                              |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ME  | Pre   | `CLAUDE.md` and `AGENTS.md` exist; recorded build/test commands documented in `CLAUDE.md` + Pre.1 notes                                                                       | `test -f CLAUDE.md && test -f AGENTS.md && grep -c "npm test" CLAUDE.md` |
| M0  | P0    | Clean checkout: `npm ci && npm run build && npm test` → 8/8 suites, ≥29/29 tests; GH CI green including build-needs-test                                                      | fresh clone + CI run link                                                |
| M1  | P1    | `npm audit --json` → 0 high+critical; tj-actions SHA-pinned; `grep -rn "alpine:3.20\|intact2025"` clean outside fixtures; gitleaks active in GH CI                            | commands at left                                                         |
| M2  | P2    | `npm outdated` shows no major-gap entries among in-scope deps, or survivor listed in Deferred with rationale; suite green                                                     | `npm outdated` per workspace                                             |
| M3  | P3    | `npm run test:coverage` reports a number; CI threshold enforced; duplication: no ≥3× repeated block from DEAD findings survives; `as unknown as` in server/src/routes = 0     | coverage output + greps                                                  |
| M4  | P4    | F-UX-001/002/003 confirmed dialogs in place; ScenarioDetail chunk < 718.84 kB (posted figure); README quick-start succeeds in fresh shell; every DEPLOYMENT.md command exists | build log + scripted doc checks                                          |

## Deferred and out of scope

None — every counted finding (138 rows, including merged keepers) is closed by ≥ 1 scheduled task. If Task 6.3's spike returns NO-GO for TypeScript 7, F-DEP-109 and F-DEP-211 move here at execution time with that rationale; revisit when typescript-eslint/vitest/vite-plugin compatibility matrices support tsgo (trigger: next minor releases of those tools).

| ID                                                       | Severity | Why deferred | Revisit when |
| -------------------------------------------------------- | -------- | ------------ | ------------ |
| (empty — contingency row reserved for TS7 NO-GO outcome) | —        | —            | —            |

## Risks

| Risk                                                                 | Affects             | Mitigation                                                                                  |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| TS7 (native compiler) breaks typescript-eslint/vitest/vite toolchain | Tasks 6.3–6.5       | Spike-first (6.3) with written NO-GO path into Deferred; suite stays green on 5.9 meanwhile |
| React 19 peer-range conflicts with Radix/xyflow/react-query          | Task 4.3            | Land react-router 7 first (4.2); run `npm ls` peer audit in PR; revert-safe single PR       |
| Express 5 query-parser/body behavior shifts vs e2e expectations      | Task 5.5            | e2e suites are the net (7.4 hermetic Mongo first); codemod recipe; staged rollout           |
| mongoose 9 undocumented-in-report breaking changes                   | Task 5.3            | First AC produces the migration guide (spike); integration tests via 7.4 harness            |
| @kubernetes/client-node v2 undici switch alters proxy/auth wiring    | Tasks 5.4, 9.7      | 44 existing fake-client tests; live kind-cluster smoke before merge                         |
| Coverage threshold set before a real baseline exists                 | Tasks 7.1, 7.7      | Informational mode first; enforce only after 7.6/7.7 backfill                               |
| Dual CI systems re-diverge after alignment                           | Tasks 0.3, 3.1      | Declare GitHub authoritative in CONTRIBUTING; GitLab mirrored configs checked in same PRs   |
| Credential rotation (1.1/1.2) locks out existing deployments         | Tasks 1.1, 1.2, 1.6 | Rotation runbook + staged rollout; migration note for running instances                     |
| Single-developer bus factor across 76 tasks                          | Whole plan          | Waves enable parallel contractors; every task self-contained with Verify command            |
