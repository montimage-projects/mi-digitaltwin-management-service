# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- OPENSPEC:START -->
## OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Build and Development Commands

### Prerequisites
- Bun v1.0+ (primary runtime)
- Docker and Docker Compose (for MongoDB)
- Node.js 18+ (optional fallback)

### Database
```bash
docker-compose up -d mongodb    # Start MongoDB
docker-compose down             # Stop all services
```

### Server (Express API on port 3000)
```bash
cd server
bun install                     # Install dependencies
bun run seed                    # Seed database with initial data
bun run dev                     # Start dev server with hot reload
bun run start                   # Start production server
bun run lint                    # Run ESLint
bun run format                  # Format with Prettier
```

### Client (React on port 5173)
```bash
cd client
bun install                     # Install dependencies
bun run dev                     # Start Vite dev server
bun run build                   # Build for production (runs tsc first)
bun run preview                 # Preview production build
bun run lint                    # Run ESLint
```

### Environment Setup
Both `server/.env` and `client/.env` require setup. Copy from `.env.example` files. Default credentials: admin / intact2025

## Architecture Overview

### Monorepo Structure
```
/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend (Bun + TypeScript)
├── openspec/        # Spec-driven development configs
└── docker-compose.yml
```

### Backend Architecture (`server/src/`)

**Entry Point:** `app.ts` - Express setup with middleware chain (helmet, cors, morgan) and graceful shutdown handling.

**Layered Structure:**
- `routes/` - API route definitions (auth, services, projects, scenarios, categories, infrastructures)
- `models/` - Mongoose schemas (User, Service, Project, Scenario, Category, Infrastructure)
- `middleware/` - Auth (JWT), validation (Zod), error handling
- `validators/` - Zod schemas for request validation
- `config/` - Environment vars (`env.ts`) and database connection (`database.ts`)
- `seed/` - Database seeding scripts for initial data
- `utils/` - Utilities (encryption)

**API Routes:**
- `/api/auth` - JWT authentication
- `/api/services` - CRUD for cybersecurity services
- `/api/projects` - Digital twin project management
- `/api/scenarios` - Scenarios within projects (nested under `/api`)
- `/api/categories` - Service categorization
- `/api/infrastructures` - Infrastructure management

### Frontend Architecture (`client/src/`)

**Entry Point:** `main.tsx` → `App.tsx` (React Router + React Query setup)

**Key Directories:**
- `pages/` - Route components (Dashboard, Services, Projects, Scenarios, Infrastructure, Analytics, Settings)
- `components/ui/` - shadcn/ui primitives (buttons, forms, dialogs, etc.)
- `components/layout/` - MainLayout wrapper, ProtectedRoute auth guard
- `components/topology/` - TopologyEditor, TopologyCanvas, YamlEditor for visual infrastructure editing
- `store/` - Zustand stores (auth-store, workspace-store)
- `lib/api.ts` - Centralized API client with axios
- `lib/pdf-export.ts` - PDF report generation (jspdf)
- `hooks/` - Custom React hooks
- `types/` - TypeScript type definitions

**State Management:**
- Server state: React Query with 5-minute stale time
- Client state: Zustand stores for auth and workspace

**UI Stack:** Tailwind CSS + shadcn/ui components + Radix UI primitives

### Data Flow
1. Frontend calls `lib/api.ts` functions
2. Requests hit Express routes with JWT auth middleware
3. Routes use Mongoose models to interact with MongoDB
4. Zod validates request bodies in middleware

## Development Workflow

1. Write a plan to `tasks/todo.md` before starting
2. Get plan approval before implementing
3. Mark todo items complete as you go
4. Keep changes minimal and focused
5. Add a review section to `tasks/todo.md` when done
