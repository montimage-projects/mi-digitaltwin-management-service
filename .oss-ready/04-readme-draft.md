# MI Digital Twin Management Service

A centralized platform for managing a comprehensive cybersecurity service repository and orchestrating Digital Twin projects across critical infrastructure. Enables security professionals to design, deploy, and evaluate cybersecurity scenarios in virtualized environments.

[![CI](https://github.com/montimage-projects/mi-digitaltwin-management-service/actions/workflows/ci.yml/badge.svg)](https://github.com/montimage-projects/mi-digitaltwin-management-service/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D20.0-brightgreen)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## Description

The MI Digital Twin Management Service is a full-stack web application developed by Montimage for the INTACT project. It provides a centralized catalog of 44+ cybersecurity services and tools, enabling security professionals to design Digital Twin scenarios via a drag-and-drop topology editor, deploy them directly to Kubernetes clusters, and monitor execution in real time through server-sent events (SSE).

The platform supports multiple critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) and offers project-based organization, role-based access control, infrastructure targeting, and comprehensive analytics. Built with a modern React frontend and an Express/TypeScript API backed by MongoDB, it serves as the management plane for cybersecurity Digital Twin operations.

## Key Features

- **Service Repository** — Searchable catalog of 44+ cybersecurity services organized by category, sector, and provider with tabbed INTACT Toolbox and Critical Infrastructure Services views, version management, and TRL tracking.
- **Digital Twin Projects** — Project-based organization across critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) with scenario grouping, metadata, and sector-aware analytics.
- **Visual Topology Editor** — Drag-and-drop scenario design using React Flow with real-time YAML synchronization and Monaco-based YAML editor.
- **Infrastructure Management** — Register and manage Kubernetes deployment targets with connection testing and status tracking.
- **Kubernetes Execution** — Deploy scenario topologies directly to Kubernetes clusters with one-click teardown, live progress streaming over SSE, pod log streaming, and per-service status tracking.
- **Comprehensive Analytics** — Dashboard with aggregate statistics, project/scenario counts, sector distribution, and service category breakdowns.
- **User Management** — Role-based authentication with JWT, user CRUD, and password reset capabilities.
- **PDF Export** — Export scenario designs and execution results to PDF.
- **Configurable Branding** — Per-deployment branding profiles with customizable app name, organization, and logo.

## Tech Stack

### Frontend

| Technology                | Purpose                   |
| ------------------------- | ------------------------- |
| **React 18**              | UI library                |
| **TypeScript**            | Type-safe development     |
| **Vite**                  | Build tool and dev server |
| **Tailwind CSS**          | Utility-first styling     |
| **shadcn/ui + Radix**     | Accessible UI components  |
| **TanStack React Query**  | Server state management   |
| **Zustand**               | Client state management   |
| **React Flow (xyflow)**   | Topology visualization    |
| **React Router v6**       | Client-side routing       |
| **react-hook-form + Zod** | Form validation           |
| **Axios**                 | HTTP client               |
| **Monaco Editor**         | YAML code editor          |
| **Lucide React**          | Icon library              |
| **jsPDF**                 | PDF export                |

### Backend

| Technology                  | Purpose                    |
| --------------------------- | -------------------------- |
| **Node.js 20+**             | Runtime                    |
| **TypeScript**              | Type-safe development      |
| **Express.js**              | HTTP framework             |
| **MongoDB 7**               | Document database          |
| **Mongoose**                | ODM and schema validation  |
| **Zod**                     | Request validation         |
| **JWT + bcrypt**            | Authentication             |
| **@kubernetes/client-node** | Kubernetes API integration |
| **Helmet**                  | HTTP security headers      |
| **Compression**             | gzip response compression  |
| **Morgan**                  | HTTP request logging       |

## Quick Start

### Prerequisites

- **Node.js** 20+ (runtime)
- **Docker & Docker Compose** (for MongoDB)
- **npm** (workspaces enabled)

### Setup (3 steps)

```bash
# 1. Start MongoDB
docker-compose up -d mongodb

# 2. Start backend (Express API on :3000)
cd server
cp .env.example .env
npm install && npm run seed && npm run dev

# 3. Start frontend in new terminal (React on :5173)
cd client
cp .env.example .env
npm install && npm run dev
```

**Access:** http://localhost:5173 | **Default credentials:** admin / intact2025

### Docker (unified deployment)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

For MongoDB Atlas:

```bash
docker-compose -f docker-compose.atlas.yml up -d
```

## Usage

1. **Login** — Authenticate at `/login` with the admin credentials. JWT tokens expire after 24 hours.
2. **Dashboard** — View aggregate statistics: total services, projects, infrastructures, and active deployments.
3. **Service Catalog** — Browse the INTACT Toolbox and Critical Infrastructure Services tabs. Filter by category, provider, or sector. View service details including versions, TRL, inputs/outputs, and standards.
4. **Projects** — Create a project, select a critical infrastructure sector (Telecom, Healthcare, Transportation, Nuclear), and add scenarios.
5. **Topology Editor** — Drag services from the palette onto the React Flow canvas, connect them to design your Digital Twin scenario. The YAML representation updates in real time in the Monaco editor.
6. **Deploy** — Assign a Kubernetes infrastructure target and execute the scenario. Monitor live progress and pod logs via SSE. Tear down with one click.

## API Overview

| Method          | Endpoint                                            | Description                    |
| --------------- | --------------------------------------------------- | ------------------------------ |
| POST            | `/api/auth/login`                                   | Authenticate and receive JWT   |
| GET             | `/api/auth/me`                                      | Current user info              |
| POST            | `/api/auth/logout`                                  | Invalidate session             |
| GET             | `/api/health`                                       | Health check (DB status)       |
| GET/POST        | `/api/services`                                     | List / create services         |
| GET/PUT/DELETE  | `/api/services/:id`                                 | Get / update / delete service  |
| POST            | `/api/services/:id/versions`                        | Add service version            |
| GET/POST        | `/api/projects`                                     | List / create projects         |
| GET/PUT/DELETE  | `/api/projects/:id`                                 | Get / update / delete project  |
| GET/POST        | `/api/projects/:projectId/scenarios`                | List / create scenarios        |
| GET/PUT/DELETE  | `/api/scenarios/:id`                                | Get / update / delete scenario |
| POST            | `/api/scenarios/:id/execute`                        | Deploy to Kubernetes           |
| DELETE          | `/api/scenarios/:id/executions/:executionId`        | Tear down deployment           |
| GET             | `/api/scenarios/:id/executions/:executionId/events` | SSE execution stream           |
| GET/POST        | `/api/infrastructures`                              | List / create targets          |
| GET/PUT/DELETE  | `/api/infrastructures/:id`                          | Get / update / delete          |
| POST            | `/api/infrastructures/:id/test`                     | Test connection                |
| GET             | `/api/categories`                                   | List service categories        |
| GET             | `/api/sectors`                                      | List critical infra sectors    |
| GET             | `/api/partners`                                     | List project partners          |
| GET/POST/DELETE | `/api/users`                                        | Manage users                   |
| PATCH           | `/api/users/:id/password`                           | Reset user password            |

See the full [API Reference](docs/API.md) for request/response schemas.

## Project Structure

```
.github/
  workflows/              # GitHub Actions CI/CD pipelines
  ISSUE_TEMPLATE/         # Bug report & feature request templates
  PULL_REQUEST_TEMPLATE.md
  WORKFLOWS_README.md    # Workflows documentation

.husky/                  # Git hooks (lint-staged, pre-commit)

client/                  # React frontend (Vite + TypeScript)
  public/                # Static assets
  src/
    components/          # UI, layout, topology, execution, scenarios
    hooks/               # Custom React hooks
    lib/                 # API client, branding, PDF export
    pages/               # Route-level page components
    store/               # Zustand state management
    types/               # TypeScript definitions

server/                  # Express backend (TypeScript)
  src/
    config/              # Environment, database, branding
    middleware/          # Auth, validation, error handling, static serving
    models/              # Mongoose schemas (8 models)
    routes/              # API route handlers (9 modules)
    seed/                # Database seeding scripts
    services/            # Kubernetes deployment service
    utils/               # Startup checks, encryption, logging
    validators/          # Zod validation schemas
    docs/                # OpenAPI specification

docs/                    # Technical documentation
  architecture/          # System design & component overviews
  database/              # MongoDB schemas & relationships
  design/                # UI patterns & styling
  installation/          # Prerequisites & configuration
  integration/           # External services & K8s execution
  playbooks/             # Development & deployment guides
  troubleshooting/       # Common issues & debugging

k8s/                     # Kubernetes manifests (Kustomize)
  base/
  components/
  overlays/              # dev, prod, atlas overlays
```

## Documentation

| Document                                                         | Description                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| [Documentation Index](docs/README.md)                            | Complete documentation hub with role-based navigation |
| [Architecture Overview](docs/architecture/overview.md)           | System design, components, request flow               |
| [API Reference](docs/API.md)                                     | All REST endpoints with request/response examples     |
| [Component Reference](docs/COMPONENTS.md)                        | UI components, props, and usage patterns              |
| [Development Guide](docs/DEVELOPMENT.md)                         | Local environment setup and workflow                  |
| [Deployment Guide](docs/DEPLOYMENT.md)                           | Production deployment, Docker, K8s, monitoring        |
| [Database Schema](docs/database/schema.md)                       | MongoDB collections and relationships                 |
| [UI Patterns](docs/design/ui-patterns.md)                        | Component patterns and best practices                 |
| [Kubernetes Execution](docs/integration/kubernetes-execution.md) | Direct deployment to Kubernetes                       |
| [External Services](docs/integration/external-services.md)       | Third-party integrations                              |
| [Troubleshooting](docs/troubleshooting/common-issues.md)         | Common issues and solutions                           |

## CI/CD

### GitHub Actions

The [CI workflow](.github/workflows/ci.yml) runs on every push and pull request to `main` and `develop`:

| Job               | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| **Code Quality**  | Formatting check, ESLint (client + server) — matrix on Node 18, 20, 22           |
| **Type Check**    | TypeScript strict mode type checking                                             |
| **Test**          | Vitest server tests with MongoDB 7 service container — matrix on Node 18, 20, 22 |
| **Build**         | Client production build + server type check (requires quality + typecheck)       |
| **Security Scan** | `npm audit` with moderate severity threshold                                     |

Additional documentation workflows: validation, quality checks, and build/publish.

### GitLab CI

The [`.gitlab-ci.yml`](.gitlab-ci.yml) mirror pipeline runs on `main`, `develop`, and merge request events with the same stages: quality, typecheck, test, security, and build.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy, commit conventions (Conventional Commits), pull request process, and coding standards (ESLint, Prettier, TypeScript strict mode).

All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Related Publications

_This project is developed as part of the INTACT project. Related publications will be listed here._

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.

Copyright 2026 Montimage.

## Support

- **Issues & Feature Requests** — [GitHub Issues](https://github.com/montimage-projects/mi-digitaltwin-management-service/issues)
- **Security Vulnerabilities** — See [SECURITY.md](SECURITY.md) for responsible disclosure process
- **Changelog** — See [CHANGELOG.md](CHANGELOG.md) for release history
- **Documentation** — Contribute improvements to the [docs/](docs/) directory
