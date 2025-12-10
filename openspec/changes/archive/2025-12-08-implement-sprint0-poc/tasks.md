# Tasks: Sprint 0 POC Implementation

## 1. Project Foundation

- [x] 1.1 Create monorepo structure with `/client` and `/server` directories
- [x] 1.2 Initialize Bun and configure `package.json` for both client and server
- [x] 1.3 Configure TypeScript with strict mode for client and server
- [x] 1.4 Set up ESLint and Prettier with consistent rules
- [x] 1.5 Create `.env.example` files with required variables
- [x] 1.6 Create `docker-compose.yml` with MongoDB 7.x service
- [x] 1.7 Configure MongoDB data persistence with named volume
- [x] 1.8 Write initial `README.md` with setup instructions
- [x] 1.9 Initialize git repository with `.gitignore`

## 2. Backend Foundation

- [x] 2.1 Create Express.js server entry point with Bun runtime
- [x] 2.2 Configure middleware stack (CORS, Helmet, Morgan, JSON parser)
- [x] 2.3 Implement global error handling middleware
- [x] 2.4 Create health check endpoint (`GET /api/health`)
- [x] 2.5 Create environment configuration module (`config.ts`)
- [x] 2.6 Implement graceful shutdown handling
- [x] 2.7 Establish MongoDB connection with Mongoose and retry logic
- [x] 2.8 Configure connection pooling (10 connections)
- [x] 2.9 Add database status to health check endpoint

## 3. Authentication System

- [x] 3.1 Create User Mongoose model with schema validation
- [x] 3.2 Implement bcrypt password hashing (cost factor 12)
- [x] 3.3 Create password comparison instance method
- [x] 3.4 Set up Zod validation middleware factory
- [x] 3.5 Create login validation schema
- [x] 3.6 Implement `POST /api/auth/login` endpoint with JWT generation
- [x] 3.7 Create authentication middleware for protected routes
- [x] 3.8 Implement `GET /api/auth/me` endpoint
- [x] 3.9 Create admin user seed script (admin/intact2025)

## 4. Service Repository Backend

- [x] 4.1 Create Category Mongoose model with unique indexes
- [x] 4.2 Create category seed script with 10 D2.1 categories
- [x] 4.3 Create Service Mongoose model with all D2.1 fields
- [x] 4.4 Create version subdocument schema for service versions
- [x] 4.5 Add indexes on `shortName`, `categoryId`, `repositoryTable`, `provider`
- [x] 4.6 Create service seed script with 21 D2.1 services
- [x] 4.7 Implement `GET /api/categories` endpoint
- [x] 4.8 Implement `GET /api/services` endpoint with filters and pagination
- [x] 4.9 Implement `GET /api/services/:id` endpoint with category population
- [x] 4.10 Create unified seed command to run all seeds idempotently

## 5. Frontend Foundation

- [x] 5.1 Initialize Vite + React + TypeScript project
- [x] 5.2 Configure Tailwind CSS with custom slate theme
- [x] 5.3 Initialize shadcn/ui with required components
- [x] 5.4 Install Lucide React icons
- [x] 5.5 Configure path aliases (`@/` for src)
- [x] 5.6 Set up Vite proxy to backend for development
- [x] 5.7 Create Zustand auth store with `user`, `token`, `login`, `logout`
- [x] 5.8 Implement token persistence in localStorage
- [x] 5.9 Create API client with axios and auth interceptor

## 6. Frontend Routing and Layout

- [x] 6.1 Set up React Router v6 with route definitions
- [x] 6.2 Create protected route wrapper component
- [x] 6.3 Create MainLayout component with sidebar and header
- [x] 6.4 Create Sidebar component with navigation items
- [x] 6.5 Create Header component with user menu
- [x] 6.6 Implement active route highlighting in sidebar
- [x] 6.7 Create Login page with form validation
- [x] 6.8 Implement login form submission and redirect
- [x] 6.9 Handle auto-redirect (to login if unauthenticated, to dashboard if authenticated)

## 7. Service Repository Frontend

- [x] 7.1 Create Services page with two-table layout
- [x] 7.2 Implement ServiceTable component with columns
- [x] 7.3 Add React Query for data fetching with caching
- [x] 7.4 Create loading skeleton for table
- [x] 7.5 Implement search input with debounced filtering
- [x] 7.6 Create category filter dropdown
- [x] 7.7 Create provider filter dropdown
- [x] 7.8 Implement ServiceDrawer component for detail view
- [x] 7.9 Add close button and click-outside behavior to drawer
- [x] 7.10 Display all service metadata fields in drawer

## 8. Integration and Verification

- [x] 8.1 Verify `docker-compose up` starts all services
- [x] 8.2 Test login flow with admin credentials
- [x] 8.3 Verify service list loads correctly (21 services)
- [x] 8.4 Test category filter functionality
- [x] 8.5 Test provider filter functionality
- [x] 8.6 Test search functionality
- [x] 8.7 Verify service detail drawer displays correctly
- [x] 8.8 Test logout flow and redirect
- [x] 8.9 Verify no browser console errors
- [x] 8.10 Measure API response times (<500ms target)

## Dependencies

```
1. Project Foundation (1.x) - No dependencies, start here
2. Backend Foundation (2.x) - Depends on 1.x
3. Authentication System (3.x) - Depends on 2.x
4. Service Repository Backend (4.x) - Depends on 2.x (parallel with 3.x possible)
5. Frontend Foundation (5.x) - Depends on 1.x (parallel with backend)
6. Frontend Routing (6.x) - Depends on 5.x
7. Service Repository Frontend (7.x) - Depends on 4.x, 6.x
8. Integration (8.x) - Depends on all above
```

## Parallelizable Work

After Section 1 completes:

- Backend (2, 3, 4) can proceed independently
- Frontend (5, 6) can proceed independently
- Integration (8) waits for all
