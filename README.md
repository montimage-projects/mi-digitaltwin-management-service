# INTACT Digital Twin Management Platform

A centralized web platform for managing the INTACT cybersecurity service repository and orchestrating Digital Twin projects.

## Quick Start

```bash
# Start MongoDB
docker-compose up -d mongodb

# Setup server
cd server && cp .env.example .env && bun install && bun run seed && bun run dev

# Setup client (new terminal)
cd client && cp .env.example .env && bun install && bun run dev
```

Access: http://localhost:5173 | Login: `admin` / `intact2025`

## Documentation

| Section                                                  | Description                   |
| -------------------------------------------------------- | ----------------------------- |
| [Getting Started](docs/playbooks/development.md)         | Development environment setup |
| [Deployment](docs/playbooks/deployment.md)               | Production deployment guide   |
| [Architecture](docs/architecture/overview.md)            | System design and components  |
| [Database](docs/database/schema.md)                      | MongoDB schemas               |
| [Troubleshooting](docs/troubleshooting/common-issues.md) | Common issues and solutions   |

[View all documentation](docs/README.md)

## Modules

### [Client](client/README.md)

React frontend with visual topology editor, service catalog, and project management.

| Technology   | Purpose         |
| ------------ | --------------- |
| React 18     | UI framework    |
| Vite         | Build tool      |
| Tailwind CSS | Styling         |
| React Flow   | Topology canvas |

### [Server](server/README.md)

Express REST API with MongoDB persistence and JWT authentication.

| Technology | Purpose        |
| ---------- | -------------- |
| Bun        | Runtime        |
| Express    | HTTP framework |
| MongoDB    | Database       |
| Zod        | Validation     |

## Features

- **Service Repository** - Catalog of 44+ INTACT cybersecurity services
- **Digital Twin Projects** - Manage projects across critical infrastructure sectors
- **Visual Topology Editor** - Drag-and-drop scenario design with YAML sync
- **Infrastructure Management** - Configure Kubernetes, Docker, and VM targets
- **MAESTRO Integration** - Execute scenarios via the UBITECH orchestrator

## Project Structure

```
├── client/          # React frontend
├── server/          # Express backend
├── docs/            # Technical documentation
├── openspec/        # Spec-driven development
└── docker-compose.yml
```

## License

Proprietary - INTACT Consortium

## Contact

- **Project**: [INTACT Project](https://intact-project.eu)
- **Repository**: Montimage

---

For detailed documentation, see the [docs/](docs/README.md) directory.
