# Project Context

## Purpose

The INTACT Digital Twin Management Platform is a centralized web platform for managing the INTACT cybersecurity service repository and orchestrating Digital Twin projects across multiple sectors (Telecommunications, Healthcare, Transportation, and Nuclear). It enables security professionals to:

- Design, deploy, and evaluate cybersecurity scenarios in virtualized environments
- Catalog and manage cybersecurity services with version control
- Create visual topology designs for security testing scenarios
- Deploy scenarios via MAESTRO orchestration
- Generate exportable PDF reports for scenario execution conclusions

**Target Users:**

- INTACT consortium partners (~20 organizations) - tool owners updating their services
- External organizations seeking cybersecurity services for their infrastructure

## Tech Stack

### Frontend

- **Runtime:** Bun
- **Build Tool:** Vite
- **Framework:** React 18+
- **Language:** TypeScript
- **UI Components:** shadcn/ui
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **State Management:** Zustand (tab workspace state)
- **Server State:** React Query
- **Form Handling:** React Hook Form + Zod
- **Code Editor:** Monaco Editor
- **Visual Canvas:** React Flow (@xyflow/react)
- **Routing:** React Router v6

### Backend

- **Runtime:** Bun
- **Framework:** Express.js
- **API Style:** RESTful JSON API
- **Validation:** Zod
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcrypt
- **Encryption:** Node.js crypto (AES-256-GCM)
- **PDF Generation:** PDFKit
- **YAML Parsing:** js-yaml

### Database

- **Database:** MongoDB 7.x
- **ODM:** Mongoose
- **Collections:** users, categories, services, projects, scenarios, infrastructures

## Project Conventions

### Code Style

- TypeScript for all frontend code
- ESLint + Prettier for formatting
- Functional components with hooks (no class components)
- Named exports preferred over default exports
- Use `async/await` over `.then()` chains
- Zod schemas for validation (shared between frontend/backend)

### Architecture Patterns

- **Frontend:** Component-based architecture with lazy-loaded routes
- **Backend:** Layered architecture (Routes -> Services -> Models)
- **State:** Server state in React Query, UI state in Zustand
- **API:** RESTful endpoints with consistent response format
- **Authentication:** JWT-based with middleware protection
- **Encryption:** AES-256-GCM for infrastructure credentials

### Testing Strategy

- **Unit Tests:** Vitest, Testing Library (70% coverage target)
- **Integration Tests:** Supertest for API endpoints (60% coverage)
- **Component Tests:** Testing Library (50% coverage)
- Test files co-located with source files (\*.test.ts)

### Git Workflow

- Feature branches off `main`
- Pull requests for all changes
- No force pushes to main
- Conventional commit messages
- Never add Claude co-author signatures to commits

## Domain Context

### Key Concepts

- **Digital Twin:** Virtualized representation of a real-world system (Telcos, Healthcare, Transportation, Nuclear sectors)
- **Atomic Digital Twin:** Single-sector Digital Twin
- **Cross-Sector Digital Twin:** Composite DT combining multiple atomic DTs
- **Scenario:** Configured topology of services with defined data flows for security testing
- **Topology:** Visual/YAML representation of services and their connections
- **MAESTRO:** UBITECH's service orchestrator for deploying scenarios to Kubernetes
- **D2.1:** INTACT reference architecture document defining ~20+ cybersecurity tools

### Service Categories (from D2.1)

- Predictive Threat Intelligence
- AI Attack-Defence Emulation
- Automated Threat Inspection
- Zero-Trust Distributed Computing
- Twinning Agents
- Dashboard & Explainable AI
- Open Security Service Repository
- Training
- Orchestration
- Message Broker

## Important Constraints

### Technical Constraints

- Desktop-focused application (1280px minimum width)
- iFrame embedding for MAESTRO and service dashboards (CSP headers must allow)
- Single admin user authentication for MVP (multi-user planned for v1.1)
- MongoDB Atlas free tier sufficient (512 MB storage)

### Performance Requirements

- Initial page load: <3 seconds
- API response time: <500ms (95th percentile)
- Topology editor: 60 FPS during drag operations
- PDF generation: <10 seconds
- Support 50 concurrent users

### Security Requirements

- JWT tokens with 24-hour expiration
- bcrypt password hashing (cost factor 12)
- AES-256-GCM credential encryption
- CORS restricted to application domain
- All inputs validated server-side
- HTTPS required in production

## External Dependencies

### Required External Services

- **MAESTRO:** UBITECH's orchestrator for scenario deployment (iFrame integration)
- **MongoDB:** Document database (local Docker or MongoDB Atlas)
- **Kubernetes Clusters:** Target infrastructure for scenario deployments

### Integration Points

- MAESTRO receives scenario parameters via URL/message passing
- Service dashboards embedded via iFrame (web-based) or terminal emulator (CLI-based)
- Kafka bus connectivity managed by MAESTRO

### INTACT Consortium Partners (19 organizations)

ICP, THALES, AIRBUS, SIEMENS, AVL, FRAUNHOFER, SBA, NCSRD, HMU, TUC, MONT, UBI, AXON, K3Y, BEYOND, AEGIS, 5YPE, D4P, ULANCS
