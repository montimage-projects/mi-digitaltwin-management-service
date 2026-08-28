# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-28

### Breaking Changes

- Upgrade Node.js minimum version to >=22 <25 (#54, #159)
- Migrate Express 4 to Express 5 with @types/express 5 (#178)
- Migrate React 18 to React 19 and fix breaking changes (#179)
- Upgrade TypeScript from 5.9.3 to 7.0.2 (server) and remove deprecated `baseUrl` (client) (#76, #116, #117)
- Bump mongoose 8 to 9 (server) (#69, #169)
- Bump zod 3 to 4 (server) and migrate client zod to v4 with API-compatible schema updates (#68, #177)
- Bump @kubernetes/client-node from 1.4 to 2.0 (server) (#70, #168)
- Bump MongoDB Docker image from 7 to 8 (all deployment paths) (#73, #171)
- Bump eslint from 9 to 10 (server) (#72, #170)
- Bump lucide-react from 0.451 to 1.x (client) (#59, #163)
- Bump concurrently from 8 to 10 (root) (#55, #160)
- Bump lint-staged from 15 to 17 (root) (#56, #161)
- Bump helmet from 7 to 8 (server) (#57, #162)
- Bump tailwindcss from 3 to 4 and tailwind-merge from 2 to 3 (client) (#180)

### Features

- Add plugin system foundation for server extensibility (#102, #144)
- Parallelize Kubernetes deployments with Promise.all, rollback on failure, and batch status query (#100, #142)
- Add lazy-loading of jspdf to reduce ScenarioDetail chunk size (#98, #140)
- Add breadcrumb navigation and prefix-based active nav highlighting (#96, #138)
- Add error states, consistent confirm messages, and NotFound route (#95, #137)
- Add confirmation dialogs for all destructive actions (#94, #136)
- Set up Vitest test framework for client-side testing (#81, #122)
- Add hermetic in-memory MongoDB for all tests (#80, #121)
- Add regression-test policy and backfill regression tests (#84, #125)
- Add route gap backfill with validation and error handling for server routes (#83, #124)
- Add gitleaks secret scanning parity with existing security pipeline (#44, #149)
- Authenticate MongoDB in every deployment path (#41, #148)
- Add Vitest v3 to v4 migration notes (#178)

### Bug Fixes

- Escape user input in services and projects search filters to prevent XSS (#39, #115)
- Stop leaking credential ciphertext through infrastructure API routes (#38, #114)
- Require explicit `ENCRYPTION_KEY` at boot; remove committed fallback key (#37, #113)
- Require real admin credentials and stop default seeding with known defaults (#36, #112)
- Make CI gates real with proper failure conditions (#34, #110)
- Make test suite runnable without exported secrets (#32, #108)
- Fix CSP hardening and token storage security (#43, #155)
- Route workflow outputs through environment variables to prevent shell injection (#45, #150)
- Add SSE premature-end detection and log ring-buffer cap for streaming (#101, #143)
- Replace EOL Alpine 3.20 with 3.24 in GitLab CI (#47, #157)
- Pin tj-actions to SHA with real doc gate via `fetch-depth:0` (#46, #156)
- Repeat security headers per location and minimize health endpoint (#42, #151)
- Remove duplicate DELETE route and add credential-touching validation for users (#82, #123)
- Add type cast for `infrastructure.endpoint` (#85, #126)
- Polish copy, add tooltips, and enlarge tab-close hit area (#97, #139)
- Pin first-party GitHub Actions to SHA and bump to majors (#173)
- Pin and align `@types/bcrypt` with bcrypt 6 runtime (#58, #153)

### Security

- Require `ADMIN_PASSWORD` at boot: removed committed `intact2025` default (#36, #112)
- Refuse admin seeding when `ADMIN_PASSWORD` matches known defaults (#36, #112)
- Require `ENCRYPTION_KEY` at boot: removed committed fallback key (#37, #113)
- CSP hardening and secure token storage (#43, #155)
- Shell injection prevention via environment-variable routing (#45, #150)
- XSS prevention in search filters (#39, #115)
- Credential ciphertext leak fix in infrastructure routes (#38, #114)
- Auth hardening bundle (#40, #147)
- Add gitleaks secret scanning (#44, #149)
- Authenticate MongoDB in every deployment path (#41, #148)

### Performance

- Lazy-load jspdf to reduce ScenarioDetail bundle chunk size (#98, #140)
- Parallelize Kubernetes deploy operations with Promise.all (#100, #142)
- Slim API responses for scenarios list and services picker (#99, #141)

### Documentation

- Sync configuration docs with `env.ts` truth and prune dead runbook commands (#104, #146)
- Regenerate API and backend architecture docs (#103, #145)
- Add tsgo compatibility spike note (#74, #172)
- Add AGENTS.md agent entry-point guide (#31, #107)
- Add CLAUDE.md agent context (#30, #106)
- Add agent-runnable environment notes (#29, #105)
- Consolidate lockfiles to one resolution source (#33, #109)
- Add Vitest v3 to v4 migration notes (#178)

### Dependencies

- Bump js-yaml from 4 to 5 (both workspaces) (#66, #166)
- Bump monaco-editor from 0.52 to 0.56 (client) (#65, #165)
- Bump react-router-dom from 6 to 7 (CVE fix) (#60, #164)
- Bump prettier from 3.9.4 to 3.9.6 (root) (#48, #154)
- Refresh 26 client dependencies to latest minors/patches (radix, axios, RHF, zustand, tanstack, xyflow, eslint) (#175)
- Update prettier/tsx patches and @typescript-eslint 8.x minors (server) (#174)
- Container hygiene: pin images, bind ports, bump nginx (#51, #152)
- Replace archived gaurav-nelson link-check with mlc container (#53, #158)

### Refactoring

- Extract Login styles and BrandPanel; split TopologyCanvas (#89, #130)
- Extract scenario execution and SSE logic into dedicated services (#88, #129)
- Extract `InteractsWithEditor`, `TrlSection`, and payload assembly from ServiceForm (#87, #128)
- Extract ServiceForm logic into `useServiceForm` hook (#86, #127)
- Extract route helpers to eliminate boilerplate (#85, #126)
- Extract ScenarioDetail hooks and fix TypeScript typing (#90, #131)
- Dead-code sweep across the codebase (#92, #133)
- Clean up constants, comments, and module hygiene in lib (#91, #132)

## [Unreleased]

### Security

- Require `ADMIN_PASSWORD` at boot: removed the committed `intact2025`
  default; validation aborts startup when it is unset or shorter than 8
  characters (#36)
- Refuse admin seeding when `ADMIN_PASSWORD` matches a known default
  (`intact2025`, `admin`, `password`, case-insensitive) and flag
  default/example values in startup checks (#36)
- Stop defaulting `SEED_ON_STARTUP=true` in prod templates: Compose files now
  require `ADMIN_PASSWORD` and default seeding off; Render blueprint, K8s
  ConfigMap, and the unified image follow opt-in seeding (#36)
- Require `ENCRYPTION_KEY` at boot: removed the committed fallback key that
  could decrypt every stored cluster credential; validation aborts startup when
  it is unset or shorter than 16 characters (#37)
- Make the placeholder `ENCRYPTION_KEY` startup check fatal in every
  `NODE_ENV` instead of production only — development and staging encrypt the
  same stored credentials production does (#37)

> **Upgrade note (#37).** Deployments that never set `ENCRYPTION_KEY` were
> silently running on the removed built-in fallback. That value can not be
> reused as the running key: the placeholder check rejects it in every
> `NODE_ENV`, by design, and startup aborts. To keep already stored
> `Infrastructure.credentials`, recover the old value from history with
> `git show <pre-upgrade-ref>:server/src/config/env.ts` and use it only in a
> one-off offline re-encryption script that imports
> `server/src/utils/encryption.ts` directly — the schema still accepts it
> there, only the server's startup check refuses it — decrypting each stored
> credential and re-encrypting it under a freshly generated key. Otherwise
> generate a fresh key (`openssl rand -hex 16`) and re-enter every stored
> infrastructure credential through the app. Never swap the key without a
> re-entry plan: AES-256-GCM fails the auth-tag check and throws rather than
> returning garbage.

## [0.1.0] - 2026-07-07

### Added

- Initial MVP v1.0 - INTACT Digital Twin Management Platform
- Complete Sprint 5 - User Management, Settings, Accessibility & Production Deployment
- Service Repository tabbed interface and improved UX
- Scenario editor with execution simulation and service interfaces
- ServiceForm with improved UX and version management
- Sector column display for Critical Infrastructure Services
- Project form validation and scenario editor UX improvements
- Unified Docker deployment with static file serving
- Automatic database seeding and simplified Docker deployment
- MongoDB Atlas support and startup diagnostics
- Automatic database seeding for cloud deployments
- Always-enabled static file serving for client
- Auto-build client on pre-commit for deployment
- Redesigned login page with elegant professional styling
- Dark theme support with execution status tracking
- UI components update and client assets rebuild
- Configurable per-deployment branding profiles
- Partner entity seeded from SECASSURED source
- Kustomize-based Kubernetes deployment
- Scenario deployment directly to Kubernetes

### Changed

- Moved client build output to server/public for simpler deployment
- Rebranded project as a Montimage product
- Migrated from bun dependency to Node.js
- Synced catalog from SECASSURED source with deprecation mechanism
- Restructured documentation and archived completed OpenSpec changes
- Bound Vite dev server to all interfaces

### Fixed

- Resolved GitHub Actions CI failures
- Added explicit Router type annotations for CI compatibility
- Corrected relative links in .github/WORKFLOWS_README.md
- Removed emoji characters from GitHub workflow files
- Resolved CI failures - removed broken links and fixed spell check action
- Removed links to untracked development files in docs/README.md
- Simplified publish-docs job in docs-build workflow
- Updated actions/upload-artifact to v4
- Removed leftover INTACT strings missed by the rebrand
- Resolved upsertRecord legacy-record misclassification
- Removed MAESTRO Configuration section from Settings
- Used mongoose instead of mongodb driver for connection test
- Improved client dist path resolution for Render deployment

### Docs

- Comprehensive documentation refactor and automated workflows
- Removed all emoji icons from documentation
- Updated tasks.md with completion status
- Removed redundant phrase from project description in README

### Chore

- Added DevOps quality assurance setup
- Removed development documents from git tracking
- Removed IDE and agent configuration folders from git tracking
- Removed .windsurf folder from git tracking
- Removed .github/prompts folder from git tracking
- Moved development documents to dev-docs and updated project structure
- Removed obsolete files from documentation and configuration sections
