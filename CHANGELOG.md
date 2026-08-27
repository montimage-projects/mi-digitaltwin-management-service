# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
