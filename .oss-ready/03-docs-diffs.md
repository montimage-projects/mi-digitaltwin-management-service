# Docs Plan Diffs

## Tracked files modified

### package.json

```diff
diff --git a/package.json b/package.json
index 80b7a23..769f9f2 100644
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@
   "private": true,
   "type": "module",
   "author": "Montimage",
-  "license": "UNLICENSED",
+  "license": "Apache-2.0",
   "repository": {
     "type": "git",
     "url": "git+https://github.com/montimage-projects/mi-digitaltwin-management-service.git"
```

### README.md

```diff
diff --git a/README.md b/README.md
index 7721621..4437cc8 100644
--- a/README.md
+++ b/README.md
@@ -116,6 +116,7 @@ Configuration Files
   package.json

 Root Documentation
+  CHANGELOG.md       # Release history
   README.md          # This file
```

@@ -126,7 +127,7 @@ Root Documentation

- **Service Repository** - Catalog of 44+ INTACT cybersecurity services (Base on proposal + deliverable)
- **Digital Twin Projects** - Manage projects across critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) (Base on proposal + deliverable)
- **Visual Topology Editor** - Drag-and-drop scenario design with real-time YAML synchronization
  -- **Infrastructure Management** - Configure Kubernetes, Docker, and VM deployment targets (MOCKUP - TO BE COMPLETED)
  +- **Infrastructure Management** - Configure Kubernetes, Docker, and VM deployment targets (planned feature)
- **Kubernetes Execution** - Deploy a scenario topology directly to a Kubernetes cluster, with live progress and pod logs streamed over SSE and one-click teardown
- **Comprehensive Analytics** - Project reports and scenario execution insights

@@ -217,11 +218,12 @@ See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## Project Information

- **Status:** Active Development (v0.1.0)
  -- **License:** Proprietary - Montimage
  +- **License:** Apache 2.0
- **Maintainer:** Montimage

## Support & Contributions

+- **Changelog:** See [CHANGELOG.md](CHANGELOG.md) for release history

- **Issues & Bugs:** Report via GitHub Issues
- **Documentation:** Contribute improvements to `docs/`
- **Code Guidelines:** See [Code Style](docs/design/styling.md) and [Architecture](docs/architecture/overview.md)

````

### docs/WORKFLOWS.md

```diff
diff --git a/docs/WORKFLOWS.md b/docs/WORKFLOWS.md
index bbb752c..dd4d0b1 100644
--- a/docs/WORKFLOWS.md
+++ b/docs/WORKFLOWS.md
@@ -493,6 +493,10 @@ For workflow issues or questions:
 3. Check project issues for similar problems
 4. Contact documentation team

+## GitLab CI
+
+The project also provides a `.gitlab-ci.yml` at the repository root that mirrors the GitHub Actions CI pipeline. It runs on pushes to `main` and merge requests, executing the same quality, typecheck, test, build, and security audit jobs using GitLab-native CI syntax.
+
 ---

 **Last Updated:** January 12, 2026
````

### docs/playbooks/kubernetes-deployment.md

```diff
diff --git a/docs/playbooks/kubernetes-deployment.md b/docs/playbooks/kubernetes-deployment.md
index 1c795fe..9216629 100644
--- a/docs/playbooks/kubernetes-deployment.md
+++ b/docs/playbooks/kubernetes-deployment.md
@@ -83,7 +83,7 @@ docker push <your-registry>/<image>:<tag>

 Then edit `k8s/base/deployment.yaml` and replace the placeholder image
-reference (marked `# TODO: replace with your built/pushed image`) with
+reference (marked `# REQUIRED: replace with your built/pushed image`) with
 `<your-registry>/<image>:<tag>`.
```

## New files

### LICENSE

```diff
diff --git a/LICENSE b/LICENSE
new file mode 100644
index 0000000..dfa9001
--- /dev/null
+++ b/LICENSE
@@ -0,0 +1,201 @@
+                                 Apache License
+                           Version 2.0, January 2004
+                        http://www.apache.org/licenses/
+
+   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION
+
+   1. Definitions.
+...
+   Copyright 2026 Montimage
+
+   Licensed under the Apache License, Version 2.0 (the "License");
+   you may not use this file except in compliance with the License.
+   You may obtain a copy of the License at
+
+       http://www.apache.org/licenses/LICENSE-2.0
+
+   Unless required by applicable law or agreed to in writing, software
+   distributed under the License is distributed on an "AS IS" BASIS,
+   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+   See the License for the specific language governing permissions and
+   limitations under the License.
```

### CONTRIBUTING.md

````diff
diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
new file mode 100644
index 0000000..d391d22
--- /dev/null
+++ b/CONTRIBUTING.md
@@ -0,0 +1,98 @@
+# Contributing to MI Digital Twin Management Service
+
+Welcome! We appreciate your interest in contributing. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.
+
+## How to Report Issues
+
+Report bugs and request features via [GitHub Issues](https://github.com/montimage-projects/mi-digitaltwin-management-service/issues). Include:
+
+- A clear, descriptive title
+- Steps to reproduce (for bugs)
+- Expected vs actual behavior
+- Environment details (OS, Node version, browser)
+
+## Branch Strategy
+
+- Branch from `main`
+- Naming convention: `feat/<issue-number>-<description>` or `fix/<issue-number>-<description>`
+- Keep branches short-lived and focused on a single concern
+
+## Commit Conventions
+
+Use [Conventional Commits](https://www.conventionalcommits.org/):
+
+- `feat:` — new feature
+- `fix:` — bug fix
+- `docs:` — documentation
+- `refactor:` — code restructuring
+- `chore:` — maintenance, tooling, dependencies
+- `test:` — adding or updating tests
+
+Examples:
+
+- `feat: add scenario deployment to Kubernetes`
+- `fix: resolve CI pipeline failures`
+- `docs: update API reference with new endpoints`
+
+## Pull Request Process
+
+1. Fork the repository or create a feature branch
+2. Make your changes on the branch
+3. Open a pull request against `main`
+4. Ensure all CI checks pass (quality, typecheck, test, build, security)
+5. Request review from a maintainer
+6. Address feedback and update the PR as needed
+7. A maintainer merges once all checks pass and reviews are approved
+
+## Coding Standards
+
+- **ESLint** — run `npm run lint` before pushing
+- **Prettier** — run `npm run format:check` to verify formatting
+- **TypeScript** — strict mode enabled; run `npm run typecheck` to verify
+- Follow existing patterns in the codebase
+
+## Testing
+
+- Tests use **Vitest** in the server workspace
+- Run `npm test` before pushing to verify nothing is broken
+- Add tests for new features and bug fixes
+
+## Development Setup
+
+Requirements:
+
+- **Node.js** 20+
+- **Docker & Docker Compose** (for MongoDB)
+
+```bash
+# Clone and install
+git clone https://github.com/montimage-projects/mi-digitaltwin-management-service.git
+cd mi-digitaltwin-management-service
+npm install
+
+# Configure environment
+cp .env.example .env
+
+# Start infrastructure
+docker-compose up -d
+
+# Start development servers
+npm run dev
+```
+
+The backend runs on http://localhost:3000, the frontend on http://localhost:5173.
+
+## Project Structure
+
+```
+.github/workflows/     # GitHub Actions CI/CD pipelines
+.husky/                # Git hooks configuration
+client/                # React frontend (Vite + TypeScript)
+server/                # Express backend (TypeScript)
+docs/                  # Technical documentation
+k8s/                   # Kubernetes manifests (Kustomize)
+```
+
+- `client/` — React 18, Vite, Tailwind CSS, shadcn/ui, React Query, Zustand
+- `server/` — Express.js, MongoDB/Mongoose, Zod, JWT auth
+- `docs/` — Architecture, API reference, deployment guides, playbooks
````

### CODE_OF_CONDUCT.md

```diff
diff --git a/CODE_OF_CONDUCT.md b/CODE_OF_CONDUCT.md
new file mode 100644
index 0000000..e202104
--- /dev/null
+++ b/CODE_OF_CONDUCT.md
@@ -0,0 +1,59 @@
+# Contributor Covenant Code of Conduct
+
+## Our Pledge
+
+We as members, contributors, and leaders pledge to make participation in our
+community a harassment-free experience for everyone...
+...
+## Enforcement
+
+Instances of abusive, harassing, or otherwise unacceptable behavior may be
+reported to the community leaders responsible for enforcement at
+developer@montimage.eu.
+...
+
+## Attribution
+
+This Code of Conduct is adapted from the [Contributor Covenant][homepage],
+version 2.0...
+
+[homepage]: https://www.contributor-covenant.org
```

### SECURITY.md

```diff
diff --git a/SECURITY.md b/SECURITY.md
new file mode 100644
index 0000000..52cfdfb
--- /dev/null
+++ b/SECURITY.md
@@ -0,0 +1,43 @@
+# Security Policy
+
+## Supported Versions
+...
+## Reporting a Vulnerability
+...
+2. Email your findings to developer@montimage.eu
+...
+## Security Best Practices
+...
```

### .github/ISSUE_TEMPLATE/bug_report.md

```diff
diff --git a/.github/ISSUE_TEMPLATE/bug_report.md b/.github/ISSUE_TEMPLATE/bug_report.md
new file mode 100644
index 0000000..2bb16f8
--- /dev/null
+++ b/.github/ISSUE_TEMPLATE/bug_report.md
@@ -0,0 +1,40 @@
+---
+name: Bug Report
+about: Report a bug to help us improve
+title: '[BUG] '
+labels: bug
+assignees: ''
+---
+## Bug Description
+...
+### (40 lines total)
```

### .github/ISSUE_TEMPLATE/feature_request.md

```diff
diff --git a/.github/ISSUE_TEMPLATE/feature_request.md b/.github/ISSUE_TEMPLATE/feature_request.md
new file mode 100644
index 0000000..45c82b5
--- /dev/null
+++ b/.github/ISSUE_TEMPLATE/feature_request.md
@@ -0,0 +1,31 @@
+---
+name: Feature Request
+about: Suggest an idea for this project
+title: '[FEATURE] '
+labels: enhancement
+assignees: ''
+---
+## Problem Statement
+...
+### (31 lines total)
```

### .github/PULL_REQUEST_TEMPLATE.md

```diff
diff --git a/.github/PULL_REQUEST_TEMPLATE.md b/.github/PULL_REQUEST_TEMPLATE.md
new file mode 100644
index 0000000..ae8a318
--- /dev/null
+++ b/.github/PULL_REQUEST_TEMPLATE.md
@@ -0,0 +1,33 @@
+## Description
+...
+### (33 lines total)
```

### .gitlab-ci.yml

```diff
diff --git a/.gitlab-ci.yml b/.gitlab-ci.yml
new file mode 100644
index 0000000..88e276e
--- /dev/null
+++ b/.gitlab-ci.yml
@@ -0,0 +1,87 @@
+image: node:20-alpine
+
+cache:
+  key: $CI_COMMIT_REF_SLUG
+  paths:
+    - node_modules/
+    - client/node_modules/
+    - server/node_modules/
+
+workflow:
+  rules:
+    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
+    - if: $CI_COMMIT_BRANCH == "main"
+    - if: $CI_COMMIT_BRANCH == "develop"
+
+stages:
+  - quality
+  - typecheck
+  - test
+  - security
+  - build
+
+quality:
+  stage: quality
+  script:
+    - npm ci
+    - npm run format:check
+    - npm run lint
+  ...
+
+typecheck: ...
+test: ...
+security: ...
+build: ...
```

### CHANGELOG.md

````diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
new file mode 100644
index 0000000..b5bde9d
--- /dev/null
+++ b/CHANGELOG.md
@@ -0,0 +1,73 @@
+# Changelog
+
+All notable changes to this project will be documented in this file.
+
+The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
+and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
+
+## [0.1.0] - 2026-07-07
+
+### Added
+- Initial MVP...
+- ...
+
+### Changed
+- ...
+
+### Fixed
+- ...
+
+### Docs
+- ...
+
+### Chore
+- ...
+```
````
