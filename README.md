# MI Digital Twin Management Service

A centralized, enterprise-grade platform for managing a comprehensive cybersecurity service repository and orchestrating Digital Twin projects across critical infrastructure. Enables security professionals to design, deploy, and evaluate cybersecurity scenarios in virtualized environments.

## 🚀 Quick Start

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

## 📚 Documentation Hub

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

## 🏗️ Project Structure

Git-tracked folders and files:

```
├── .github/                     # GitHub workflows & configuration
│   └── workflows/              # CI/CD pipeline definitions
│
├── .husky/                      # Git hooks configuration
│   └── pre-commit              # Pre-commit hook
│
├── client/                      # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── ui/            # shadcn/ui base components
│   │   │   ├── layout/        # Layout components
│   │   │   ├── topology/      # Topology editor
│   │   │   ├── services/      # Service components
│   │   │   ├── projects/      # Project components
│   │   │   ├── scenarios/     # Scenario components
│   │   │   ├── infrastructure/# Infrastructure components
│   │   │   ├── workspace/     # Workspace components
│   │   │   └── execution/     # Execution components
│   │   ├── pages/             # Route pages
│   │   ├── lib/               # API client & utilities
│   │   ├── store/             # Zustand stores
│   │   └── hooks/             # Custom React hooks
│   ├── public/                # Static assets
│   ├── package.json           # Dependencies
│   ├── vite.config.ts         # Vite configuration
│   ├── tsconfig.json          # TypeScript config
│   ├── README.md              # Client documentation
│   └── Dockerfile             # Client container build
│
├── server/                      # Express backend (Bun + TypeScript)
│   ├── src/
│   │   ├── routes/            # API route handlers
│   │   ├── models/            # Mongoose schemas
│   │   ├── middleware/        # Express middleware
│   │   ├── validators/        # Zod validation schemas
│   │   ├── config/            # Configuration
│   │   ├── seed/              # Database seeding
│   │   ├── migrations/        # Database migrations
│   │   ├── utils/             # Utility functions
│   │   ├── docs/              # API documentation
│   │   └── app.ts             # Express entry point
│   ├── public/                # Static files
│   │   └── assets/            # Asset files
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── README.md              # Server documentation
│   └── Dockerfile             # Server container build
│
├── docs/                        # Technical documentation
│   ├── architecture/           # System design & architecture
│   ├── database/               # MongoDB schemas & relationships
│   ├── design/                 # UI patterns & styling conventions
│   ├── installation/           # Setup & configuration
│   ├── integration/            # External services & integrations
│   ├── playbooks/              # Deployment & development guides
│   ├── troubleshooting/        # Common issues & debugging
│   ├── API.md                  # REST API reference
│   ├── COMPONENTS.md           # React component reference
│   ├── DEVELOPMENT.md          # Development workflow guide
│   ├── DEPLOYMENT.md           # Production deployment guide
│   └── README.md               # Documentation index
│
├── .dockerignore               # Docker build ignore patterns
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore patterns
├── .prettierrc                 # Prettier formatting config
├── .prettierignore             # Prettier ignore patterns
├── bun.lock                     # Dependency lock file
├── docker-compose.yml          # Local development stack
├── docker-compose.prod.yml     # Production deployment stack
├── docker-compose.atlas.yml    # MongoDB Atlas variant
├── package.json                # Root monorepo config
│
├── CLAUDE.md                   # AI assistant configuration
├── DEPLOYMENT.md               # Deployment information
├── DOCUMENTATION_REFACTOR.md   # Documentation changes summary
└── README.md                   # This file
```

## ✨ Key Features

- **Service Repository** - Catalog of 44+ INTACT cybersecurity services
- **Digital Twin Projects** - Manage projects across critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear)
- **Visual Topology Editor** - Drag-and-drop scenario design with real-time YAML synchronization
- **Infrastructure Management** - Configure Kubernetes, Docker, and VM deployment targets
- **MAESTRO Integration** - Execute scenarios via the UBITECH orchestrator
- **Comprehensive Analytics** - Project reports and scenario execution insights

## 🔧 Tech Stack

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

## 📖 Workflows

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

## 🔐 Security

- **JWT Authentication** - 24-hour token expiry
- **Password Hashing** - bcrypt with salt rounds
- **Credential Encryption** - AES-256-GCM for stored secrets
- **Validation** - Zod schema validation on all inputs
- **CORS** - Configured for trusted origins only
- **Helmet** - HTTP security headers

## 📦 Deployment

**Development:**

```bash
docker-compose up -d  # All services
```

**Production:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**MongoDB Atlas:**

```bash
docker-compose -f docker-compose.atlas.yml up -d
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## 🤝 Project Information

- **Status:** Active Development (v0.1.0)
- **License:** Proprietary - Montimage
- **Maintainer:** Montimage
- **Based on:** Original INTACT Project Research

## 🆘 Support & Contributions

- **Issues & Bugs:** Report via GitHub Issues
- **Documentation:** Contribute improvements to `docs/`
- **Code Guidelines:** See [Code Style](docs/design/styling.md) and [Architecture](docs/architecture/overview.md)
- **Spec-Driven Development:** Review [OpenSpec Conventions](openspec/project.md)

---

**Questions?** Start with the [Development Guide](docs/DEVELOPMENT.md) or [FAQ](docs/troubleshooting/common-issues.md).
