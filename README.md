# MI Digital Twin Management Service

A centralized platform for managing a comprehensive cybersecurity service repository and orchestrating Digital Twin projects across critical infrastructure. Enables security professionals to design, deploy, and evaluate cybersecurity scenarios in virtualized environments.

## Quick Start

### Prerequisites

- **Bun** v1.0+ (primary runtime)
- **Docker & Docker Compose** (for MongoDB)
- **Node.js** 18+ (optional fallback)

### Setup (3 steps)

```bash
# 1. Start MongoDB
docker-compose up -d mongodb

# 2. Start backend (Express API on :3000)
cd server
cp .env.example .env
bun install && bun run seed && bun run dev

# 3. Start frontend in new terminal (React on :5173)
cd client
cp .env.example .env
bun install && bun run dev
```

**Access:** http://localhost:5173 | **Login:** admin / intact2025

## Documentation Hub

**New to the project?** Start here:

- **[Client Setup](client/README.md)** - React frontend setup, architecture, and development
- **[Server Setup](server/README.md)** - Express backend setup, API reference, and testing
- **[Development Guide](docs/DEVELOPMENT.md)** - Local environment setup and workflow
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment and monitoring

**Reference documentation:**

| Topic                                                    | Description                             |
| -------------------------------------------------------- | --------------------------------------- |
| [Architecture](docs/architecture/overview.md)            | System design, components, request flow |
| [API Reference](docs/API.md)                             | All REST endpoints with examples        |
| [Database](docs/database/schema.md)                      | MongoDB collections and relationships   |
| [Troubleshooting](docs/troubleshooting/common-issues.md) | Common issues and solutions             |

**[→ View all documentation](docs/README.md)**

## Project Structure

Git-tracked folders and files:

```
.github/
  workflows/          # GitHub Actions CI/CD pipelines
  WORKFLOWS_README.md # Workflows documentation

.husky/              # Git hooks configuration

client/              # React frontend (Vite + TypeScript)
  public/            # Static assets
  src/
    components/      # React components (ui, layout, topology, etc.)
    hooks/           # Custom React hooks
    lib/             # API client & utilities
    pages/           # Route pages
    store/           # Zustand state management
    types/           # TypeScript definitions
  package.json
  vite.config.ts
  tsconfig.json
  Dockerfile

server/              # Express backend (Bun + TypeScript)
  src/
    config/          # Configuration & database connection
    middleware/      # Express middleware (auth, validation, error)
    models/          # Mongoose schemas
    routes/          # API route handlers
    seed/            # Database seeding scripts
    utils/           # Utility functions
    validators/      # Zod validation schemas
    app.ts           # Express entry point
  public/            # Static files (client build)
  package.json
  tsconfig.json
  Dockerfile

docs/                # Technical documentation
  architecture/      # System design & components
  database/          # MongoDB schemas & relationships
  design/            # UI patterns & styling
  installation/      # Prerequisites & configuration
  integration/       # External integrations
  playbooks/         # Development & deployment guides
  troubleshooting/   # Issues & debugging
  API.md             # REST API reference
  COMPONENTS.md      # React component reference
  DEVELOPMENT.md     # Development workflow guide
  DEPLOYMENT.md      # Production deployment guide
  README.md          # Documentation index

Configuration Files
  .dockerignore
  .env.example
  .gitignore
  .markdownlintrc
  .prettierrc
  .prettierignore
  bun.lock
  docker-compose.yml
  docker-compose.prod.yml
  docker-compose.atlas.yml
  package.json

Root Documentation
  README.md          # This file
```

**Note:** Development documents are stored in `dev-docs/` and not tracked by git (see .gitignore).

## Key Features

- **Service Repository** - Catalog of 44+ INTACT cybersecurity services (Base on proposal + deliverable)
- **Digital Twin Projects** - Manage projects across critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) (Base on proposal + deliverable)
- **Visual Topology Editor** - Drag-and-drop scenario design with real-time YAML synchronization
- **Infrastructure Management** - Configure Kubernetes, Docker, and VM deployment targets (MOCKUP - TO BE COMPLETED)
- **MAESTRO Integration** - Execute scenarios via the UBITECH orchestrator (MOCKUP - TO BE COMPLETED)
- **Comprehensive Analytics** - Project reports and scenario execution insights

## Tech Stack

### Frontend

- **React 18** with TypeScript
- **Vite** for blazing-fast builds
- **Tailwind CSS** with shadcn/ui components
- **React Query** for server state
- **Zustand** for client state
- **React Flow** for topology visualization

### Backend

- **Bun** runtime with TypeScript
- **Express.js** HTTP framework
- **MongoDB** document database
- **Mongoose** ODM
- **Zod** schema validation
- **JWT** authentication with bcrypt

## Workflows

### For New Developers

1. Follow [Quick Start](#-quick-start) above
2. Read [Development Guide](docs/DEVELOPMENT.md)
3. Explore [Architecture](docs/architecture/overview.md)
4. Check [Frontend Setup](client/README.md) or [Backend Setup](server/README.md)

### For DevOps/Operations

1. Review [Deployment Guide](docs/DEPLOYMENT.md)
2. Check [Prerequisites](docs/installation/prerequisites.md)
3. Follow Docker/Kubernetes setup in deployment guide
4. See [Troubleshooting](docs/troubleshooting/common-issues.md) for issues

### For Contributors

1. Read [Architecture](docs/architecture/overview.md)
2. Understand [Data Flow](docs/architecture/data-flow.md)
3. Follow [Code Style Guide](docs/design/styling.md)
4. Review [Component Reference](docs/COMPONENTS.md)

## Security

- **JWT Authentication** - 24-hour token expiry
- **Password Hashing** - bcrypt with salt rounds
- **Credential Encryption** - AES-256-GCM for stored secrets
- **Validation** - Zod schema validation on all inputs
- **CORS** - Configured for trusted origins only
- **Helmet** - HTTP security headers

## Deployment

**Kubernetes (Kustomize) — recommended for new deployments:**

```bash
kubectl apply -k k8s/overlays/prod # or overlays/dev, overlays/atlas
```

See the [Kubernetes Deployment Playbook](docs/playbooks/kubernetes-deployment.md) for prerequisites and full setup.

**Docker Compose — fully supported:**

Development:

```bash
docker-compose up -d # All services
```

Production:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

MongoDB Atlas:

```bash
docker-compose -f docker-compose.atlas.yml up -d
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## Project Information

- **Status:** Active Development (v0.1.0)
- **License:** Proprietary - Montimage
- **Maintainer:** Montimage

## Support & Contributions

- **Issues & Bugs:** Report via GitHub Issues
- **Documentation:** Contribute improvements to `docs/`
- **Code Guidelines:** See [Code Style](docs/design/styling.md) and [Architecture](docs/architecture/overview.md)

---

**Questions?** Start with the [Development Guide](docs/DEVELOPMENT.md) or [FAQ](docs/troubleshooting/common-issues.md).
