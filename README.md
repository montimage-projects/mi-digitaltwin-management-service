# INTACT Digital Twin Management Platform

A centralized web platform for managing the INTACT cybersecurity service repository and orchestrating Digital Twin projects.

## Features

- **Service Repository**: Manage 44+ INTACT cybersecurity services with full CRUD operations
- **Digital Twin Projects**: Create and manage projects across multiple sectors (Telecommunications, Healthcare, Transportation, Nuclear)
- **Visual Topology Editor**: Split-screen YAML/visual editor for scenario topologies using React Flow
- **Infrastructure Management**: Configure Kubernetes, Docker, and virtual infrastructure targets
- **Execution System**: Execute scenarios on MAESTRO orchestrator with status tracking
- **PDF Export**: Generate reports for scenario executions
- **Analytics Dashboard**: View platform usage statistics

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 18+ (optional, for compatibility)

## Quick Start

### 1. Start MongoDB

```bash
docker-compose up -d mongodb
```

### 2. Set up the Backend

```bash
cd server
cp .env.example .env
bun install
bun run seed  # Seed the database with initial data
bun run dev   # Start development server
```

The API will be available at `http://localhost:3000`

### 3. Set up the Frontend

```bash
cd client
cp .env.example .env
bun install
bun run dev
```

The frontend will be available at `http://localhost:5173`

### 4. Login

Use the default admin credentials:
- Username: `admin`
- Password: `intact2025`

## Production Deployment

For production deployments using Docker, see [DEPLOYMENT.md](./DEPLOYMENT.md).

```bash
# Quick production start
docker compose -f docker-compose.prod.yml up -d --build
```

## Project Structure

```
/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # UI components (shadcn/ui + custom)
│   │   ├── pages/       # Route pages
│   │   ├── lib/         # API client, utilities
│   │   └── store/       # Zustand state stores
│   └── Dockerfile
├── server/              # Express backend (Bun + TypeScript)
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── models/      # Mongoose schemas
│   │   ├── middleware/  # Auth, validation, error handling
│   │   └── seed/        # Database seeding scripts
│   └── Dockerfile
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment
└── DEPLOYMENT.md            # Production deployment guide
```

## Available Scripts

### Server

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start production server |
| `bun run seed` | Seed database with initial data |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |

### Client

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run lint` | Run ESLint |

## Environment Variables

### Server (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/intact` |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_EXPIRES_IN` | Token expiration | `24h` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `ENCRYPTION_KEY` | Key for encrypting credentials | (required, 32 chars) |

### Client (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |
| `VITE_MAESTRO_URL` | MAESTRO orchestrator URL | `https://maestro.intact-project.eu` |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with credentials
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users (Admin)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `DELETE /api/users/:id` - Delete user
- `PATCH /api/users/:id/password` - Reset password

### Services
- `GET /api/services` - List services (with filters)
- `GET /api/services/:id` - Get service details
- `POST /api/services` - Create service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service
- `POST /api/services/:id/versions` - Add version

### Projects
- `GET /api/projects` - List projects
- `GET /api/projects/:id` - Get project with scenarios
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Scenarios
- `GET /api/projects/:projectId/scenarios` - List project scenarios
- `POST /api/projects/:projectId/scenarios` - Create scenario
- `GET /api/scenarios/:id` - Get scenario details
- `PUT /api/scenarios/:id` - Update scenario
- `DELETE /api/scenarios/:id` - Delete scenario
- `POST /api/scenarios/:id/execute` - Execute scenario

### Infrastructure
- `GET /api/infrastructures` - List infrastructures
- `POST /api/infrastructures` - Create infrastructure
- `PUT /api/infrastructures/:id` - Update infrastructure
- `DELETE /api/infrastructures/:id` - Delete infrastructure
- `POST /api/infrastructures/:id/test` - Test connection

### Categories
- `GET /api/categories` - List all categories

### Health
- `GET /api/health` - Health check
- `GET /api/docs` - OpenAPI spec (dev only)

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui (styling)
- React Router v6 (routing)
- React Query (server state)
- Zustand (client state)
- React Flow (topology visualization)
- Monaco Editor (YAML editing)

### Backend
- Bun runtime
- Express.js
- MongoDB + Mongoose
- JWT authentication
- Zod validation
- Bcrypt (password hashing)

## License

Proprietary - INTACT Consortium
