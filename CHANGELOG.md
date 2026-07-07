# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
