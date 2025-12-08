# Design: Sprint 0 POC Architecture

## Context

This is a greenfield project for the INTACT consortium. The POC must validate:
- Monorepo structure works for frontend/backend development
- Bun runtime is stable for production backend
- JWT authentication pattern is suitable
- MongoDB document model fits the service catalog use case
- shadcn/ui provides the needed component flexibility

### Stakeholders
- INTACT consortium partners (20 organizations)
- Solo developer (implementation)
- UBITECH (MAESTRO integration, future sprints)

## Goals / Non-Goals

### Goals
- Establish clean, maintainable project structure
- Validate full-stack architecture end-to-end
- Seed all 21 D2.1 services for realistic data
- Create reusable authentication patterns
- Build component library foundation with shadcn/ui

### Non-Goals
- Multi-user support (admin only for POC)
- Service CRUD (read-only for POC)
- Visual topology editor (later sprint)
- MAESTRO integration (later sprint)
- Production deployment (Docker Compose only)

## Decisions

### D1: Monorepo Structure
**Decision**: Use simple `/client` and `/server` directories without workspace tooling.

**Rationale**: For a solo developer project, full monorepo tooling (Turborepo, Nx) adds complexity without proportional benefit. Simple directory separation is sufficient.

**Alternatives Considered**:
- Turborepo: Overkill for 2 packages
- Separate repositories: Harder to maintain consistency

### D2: Bun Runtime
**Decision**: Use Bun for both package management and backend runtime.

**Rationale**: Bun provides faster installs, native TypeScript support, and is mature enough for production. Aligns with PRD/TAD specifications.

**Alternatives Considered**:
- Node.js + npm: Slower, requires transpilation
- Deno: Less ecosystem compatibility

### D3: Authentication Storage
**Decision**: Store JWT in localStorage with Authorization header.

**Rationale**: Simpler implementation for admin-only MVP. Security acceptable for internal consortium tool.

**Alternatives Considered**:
- httpOnly cookies: More secure but adds CSRF complexity
- Session storage: Lost on tab close

### D4: Service Model Version Array
**Decision**: Embed version history as array within Service document.

**Rationale**: Services have limited versions (typically <20), and this avoids join complexity. Aligns with document-oriented design.

**Alternatives Considered**:
- Separate versions collection: Over-engineering for expected scale

### D5: Component Library
**Decision**: Use shadcn/ui with slate color palette.

**Rationale**: Provides accessible, customizable components that can be styled to match brand kit. Components are copied into codebase for full control.

**Alternatives Considered**:
- Material UI: Too opinionated, harder to customize
- Radix only: Requires more styling work
- Custom components: Too time-consuming

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React SPA (Vite)                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐│   │
│  │  │  Zustand │ │  React   │ │    shadcn/ui         ││   │
│  │  │  (Auth)  │ │  Query   │ │    Components        ││   │
│  │  └──────────┘ └──────────┘ └──────────────────────┘│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ REST API (JSON)
                              │ Authorization: Bearer <JWT>
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express.js API (Bun)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Middleware: CORS, Helmet, Morgan, Auth               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐  │
│  │   Routes   │ │  Services  │ │      Models            │  │
│  │  /api/*    │ │   Layer    │ │  (Mongoose)            │  │
│  └────────────┘ └────────────┘ └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Mongoose ODM
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB 7.x                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐  │
│  │   users    │ │ categories │ │       services         │  │
│  └────────────┘ └────────────┘ └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
/
├── client/                      # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui components
│   │   │   ├── layout/         # MainLayout, Sidebar, Header
│   │   │   └── services/       # ServiceTable, ServiceDrawer
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── Services.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts
│   │   ├── lib/
│   │   │   ├── api.ts          # API client
│   │   │   └── utils.ts
│   │   ├── store/
│   │   │   └── auth-store.ts   # Zustand
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── server/                      # Backend (Express + Bun)
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── validation.ts
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── Category.ts
│   │   │   └── Service.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── services.routes.ts
│   │   │   └── categories.routes.ts
│   │   ├── services/
│   │   │   └── auth.service.ts
│   │   ├── validators/
│   │   │   └── auth.validator.ts
│   │   ├── seed/
│   │   │   ├── categories.seed.ts
│   │   │   ├── services.seed.ts
│   │   │   └── admin.seed.ts
│   │   └── app.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Design

### Authentication
```
POST /api/auth/login
  Request:  { username: string, password: string }
  Response: { token: string, user: { id, username, role } }

GET /api/auth/me
  Headers:  Authorization: Bearer <token>
  Response: { id, username, role }

POST /api/auth/logout
  Response: { message: "Logged out" }
```

### Categories
```
GET /api/categories
  Response: [{ _id, name, slug, description }]
```

### Services
```
GET /api/services
  Query:    ?table=INTACT_TOOLBOX&category=<id>&provider=<name>&search=<term>&limit=20&skip=0
  Response: { services: [...], total: number }

GET /api/services/:id
  Response: { _id, shortName, title, categoryId: { name, slug }, ... }
```

## Risks / Trade-offs

### R1: JWT in localStorage
**Risk**: XSS vulnerability could expose token.
**Mitigation**: CSP headers, React's built-in XSS protection, admin-only users.
**Acceptable**: For internal consortium tool with limited users.

### R2: Bun Runtime Stability
**Risk**: Bun may have edge-case bugs in production.
**Mitigation**: Comprehensive testing, ability to switch to Node.js if needed.
**Fallback**: Express code is Node.js compatible.

### R3: MongoDB Connection Issues
**Risk**: Database connection drops in development.
**Mitigation**: Connection retry logic with exponential backoff.

## Migration Plan
Not applicable - greenfield project.

## Open Questions

| Question | Default if Unanswered |
|----------|----------------------|
| Should services have soft delete? | Defer to MVP (hard delete for POC) |
| Need MongoDB Atlas or local only? | Local Docker for POC, Atlas optional |
