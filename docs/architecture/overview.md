# Architecture Overview

High-level system architecture of the INTACT Digital Twin Management Platform.

## System Architecture

```mermaid
graph TB
    subgraph Client["Client (React)"]
        UI[UI Components]
        Pages[Pages/Routes]
        Store[Zustand Store]
        RQ[React Query]
        API[API Client]
    end

    subgraph Server["Server (Express)"]
        Routes[API Routes]
        MW[Middleware]
        Valid[Validators]
        Models[Mongoose Models]
    end

    subgraph Data["Data Layer"]
        DB[(MongoDB)]
    end

    subgraph External["External Services"]
        MAESTRO[MAESTRO Orchestrator]
        K8S[Kubernetes Clusters]
    end

    UI --> Pages
    Pages --> Store
    Pages --> RQ
    RQ --> API
    API -->|HTTP/JSON| Routes
    Routes --> MW
    MW --> Valid
    Valid --> Models
    Models --> DB

    Pages -.->|iFrame| MAESTRO
    MAESTRO --> K8S

    style Client fill:#e3f2fd
    style Server fill:#e8f5e9
    style Data fill:#fff3e0
    style External fill:#fce4ec
```

## Component Overview

### Frontend (Client)

| Component      | Technology               | Purpose                       |
| -------------- | ------------------------ | ----------------------------- |
| UI Framework   | React 18                 | Component-based UI            |
| Build Tool     | Vite                     | Fast development and bundling |
| Styling        | Tailwind CSS + shadcn/ui | Utility-first styling         |
| State (Server) | React Query              | API data fetching and caching |
| State (Client) | Zustand                  | Local UI state                |
| Routing        | React Router v6          | SPA navigation                |
| Editor         | Monaco Editor            | YAML topology editing         |
| Canvas         | React Flow               | Visual topology designer      |

### Backend (Server)

| Component      | Technology         | Purpose                  |
| -------------- | ------------------ | ------------------------ |
| Runtime        | Bun                | Fast JavaScript runtime  |
| Framework      | Express.js         | HTTP server and routing  |
| Database       | MongoDB + Mongoose | Document storage and ODM |
| Validation     | Zod                | Schema validation        |
| Authentication | JWT                | Stateless auth tokens    |
| Encryption     | AES-256-GCM        | Credential encryption    |

## Request Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as React Client
    participant RQ as React Query
    participant A as API Client
    participant S as Express Server
    participant MW as Middleware
    participant M as Mongoose
    participant DB as MongoDB

    U->>C: Interact with UI
    C->>RQ: Trigger query/mutation
    RQ->>A: Call API function
    A->>S: HTTP Request + JWT
    S->>MW: Auth + Validation
    MW->>M: Database operation
    M->>DB: Query/Update
    DB-->>M: Result
    M-->>MW: Document(s)
    MW-->>S: Response data
    S-->>A: JSON response
    A-->>RQ: Parse response
    RQ-->>C: Update cache
    C-->>U: Render update
```

## Directory Structure

```
/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       │   ├── ui/         # shadcn/ui primitives
│       │   ├── layout/     # Layout components
│       │   ├── topology/   # Topology editor
│       │   └── ...         # Feature components
│       ├── pages/          # Route pages
│       ├── lib/            # Utilities and API client
│       ├── store/          # Zustand stores
│       ├── hooks/          # Custom React hooks
│       └── types/          # TypeScript types
│
├── server/                 # Express backend
│   └── src/
│       ├── routes/         # API endpoints
│       ├── models/         # Mongoose schemas
│       ├── middleware/     # Auth, validation, errors
│       ├── validators/     # Zod schemas
│       ├── config/         # Environment, database
│       ├── seed/           # Database seeding
│       └── utils/          # Encryption, helpers
│
└── docs/                   # Technical documentation
```

## Key Design Decisions

### Monorepo Structure

The project uses a simple monorepo with `client/` and `server/` workspaces, enabling:

- Shared development workflow
- Coordinated deployments
- Simplified CI/CD

### Bun Runtime

Bun provides:

- Faster package installation
- Native TypeScript execution
- Compatible with npm ecosystem

### MongoDB Document Model

MongoDB suits this application because:

- Flexible schema for varied service metadata
- Document references for relationships
- Native JSON API compatibility

### React Query for Server State

Separates concerns:

- Server state (API data) in React Query
- Client state (UI) in Zustand
- Automatic cache invalidation and refetching

## Security Architecture

```mermaid
flowchart LR
    subgraph Client
        A[Login Form]
    end

    subgraph Server
        B[Auth Route]
        C[JWT Generation]
        D[Auth Middleware]
        E[Protected Routes]
    end

    subgraph Storage
        F[(User Credentials)]
        G[bcrypt hash]
    end

    A -->|credentials| B
    B --> F
    F --> G
    G -->|verify| C
    C -->|JWT token| A
    A -->|JWT in header| D
    D -->|valid| E
    D -->|invalid| X[401 Unauthorized]

    style A fill:#e3f2fd
    style D fill:#fff3e0
    style X fill:#ffcdd2
```

### Security Measures

| Layer          | Measure                          |
| -------------- | -------------------------------- |
| Passwords      | bcrypt hashing (cost 12)         |
| Authentication | JWT tokens (24h expiry)          |
| Credentials    | AES-256-GCM encryption           |
| API            | Zod validation on all inputs     |
| Transport      | HTTPS in production              |
| CORS           | Restricted to application domain |

## Related Documentation

- [Frontend Architecture](frontend.md)
- [Backend Architecture](backend.md)
- [Data Flow](data-flow.md)
- [Database Schema](../database/schema.md)
