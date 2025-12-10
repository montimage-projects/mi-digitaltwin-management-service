# INTACT Digital Twin Management Platform - Development Tasks

## Overview

This document outlines the development tasks for the INTACT Digital Twin Management Platform, organized into sprints following a POC → MVP → Full Features approach.

**Project Timeline:** 6 weeks (estimated)  
**Team Size:** Solo developer  
**Tech Stack:** Bun, React 18+, TypeScript, Express.js, MongoDB, shadcn/ui, Tailwind CSS, Monaco Editor, React Flow

---

## Development Phases

| Phase    | Sprint   | Duration | Focus                                           |
| -------- | -------- | -------- | ----------------------------------------------- |
| **POC**  | Sprint 0 | 3-4 days | Project foundation, auth, basic service listing |
| **MVP**  | Sprint 1 | 1 week   | Service Repository CRUD, Categories             |
| **MVP**  | Sprint 2 | 1 week   | Projects, Scenarios, Basic Topology Editor      |
| **Full** | Sprint 3 | 1 week   | Visual Canvas, Split-Screen Editor              |
| **Full** | Sprint 4 | 1 week   | MAESTRO Integration, Tabbed Workspace           |
| **Full** | Sprint 5 | 1 week   | Infrastructure, Analytics, Polish               |

---

## Sprint 0: Proof of Concept (POC)

**Goal:** Validate core architecture with working authentication and basic service listing.  
**Duration:** 3-4 days

---

### TASK-001: Project Initialization and Monorepo Setup

**Description:**  
Set up the project structure with Bun as the runtime, creating a monorepo structure for frontend (React/Vite) and backend (Express.js). Configure TypeScript, ESLint, Prettier, and essential tooling.

**Acceptance Criteria:**

- [ ] Monorepo structure created with `/client` and `/server` directories
- [ ] Bun configured as package manager and runtime
- [ ] TypeScript configured for both client and server with strict mode
- [ ] ESLint and Prettier configured with consistent rules
- [ ] `.env.example` files created for both client and server
- [ ] `README.md` with setup instructions
- [ ] Git repository initialized with `.gitignore`

**Dependencies:** None

---

### TASK-002: Docker Development Environment

**Description:**  
Create Docker Compose configuration for local development with MongoDB and the application services. Enables consistent development environment across machines.

**Acceptance Criteria:**

- [ ] `docker-compose.yml` created with MongoDB 7.x service
- [ ] MongoDB data persistence configured with named volume
- [ ] Health checks configured for MongoDB
- [ ] Environment variables properly mapped
- [ ] Documentation for `docker-compose up` workflow
- [ ] MongoDB Express (optional) for database inspection during development

**Dependencies:** TASK-001

---

### TASK-003: Backend Express.js Foundation

**Description:**  
Set up Express.js backend with essential middleware, error handling, and logging. Establish the foundational API structure following RESTful conventions.

**Acceptance Criteria:**

- [ ] Express.js server configured with Bun runtime
- [ ] Middleware configured: CORS, Helmet, Morgan, JSON parser
- [ ] Global error handling middleware implemented
- [ ] Health check endpoint (`GET /api/health`) working
- [ ] Environment configuration module (`config.ts`)
- [ ] Graceful shutdown handling
- [ ] Server starts on configured port (default: 3000)

**Dependencies:** TASK-001

---

### TASK-004: MongoDB Connection and Mongoose Setup

**Description:**  
Establish MongoDB connection using Mongoose ODM with connection pooling, retry logic, and proper error handling.

**Acceptance Criteria:**

- [ ] Mongoose connection established with retry logic
- [ ] Connection events logged (connected, disconnected, error)
- [ ] Connection pool configured (default: 10 connections)
- [ ] Database connection string configurable via environment
- [ ] Graceful disconnection on server shutdown
- [ ] Connection status available in health check endpoint

**Dependencies:** TASK-002, TASK-003

---

### TASK-005: User Model and Authentication Schema

**Description:**  
Create the User Mongoose model with password hashing using bcrypt. Implement the foundation for JWT-based authentication.

**Acceptance Criteria:**

- [ ] User schema defined: `username`, `passwordHash`, `role`, `timestamps`
- [ ] Unique index on `username` field
- [ ] Pre-save hook for password hashing (bcrypt, cost factor 12)
- [ ] Instance method for password comparison
- [ ] Role enum: `admin` (extensible for future roles)
- [ ] TypeScript interfaces for User document

**Dependencies:** TASK-004

---

### TASK-006: JWT Authentication Implementation

**Description:**  
Implement JWT-based authentication with login endpoint, token generation, and authentication middleware for protected routes.

**Acceptance Criteria:**

- [ ] `POST /api/auth/login` endpoint implemented
- [ ] JWT token generation with 24-hour expiration
- [ ] JWT secret configurable via environment variable
- [ ] Authentication middleware (`authMiddleware.ts`)
- [ ] `GET /api/auth/me` returns current user info
- [ ] `POST /api/auth/logout` (client-side token removal guidance)
- [ ] Proper error responses (401 Unauthorized, 403 Forbidden)
- [ ] Password not included in any response

**Dependencies:** TASK-005

---

### TASK-007: Input Validation with Zod

**Description:**  
Set up Zod for request validation with reusable schemas and validation middleware for consistent input validation across all endpoints.

**Acceptance Criteria:**

- [ ] Zod installed and configured
- [ ] Validation middleware factory created
- [ ] Auth schemas defined (login request)
- [ ] Validation errors return 400 with detailed messages
- [ ] TypeScript types inferred from Zod schemas
- [ ] Reusable common validators (objectId, pagination, etc.)

**Dependencies:** TASK-003

---

### TASK-008: Category Model and Seed Data

**Description:**  
Create the Category Mongoose model and seed script with the 10 categories from D2.1 document.

**Acceptance Criteria:**

- [ ] Category schema: `name`, `slug`, `description`, `timestamps`
- [ ] Unique indexes on `name` and `slug`
- [ ] Seed script creates 10 categories from D2.1:
  - Predictive Threat Intelligence
  - AI Attack-Defence Emulation
  - Automated Threat Inspection
  - Zero-Trust Distributed Computing
  - Twinning Agents
  - Dashboard & XAI
  - OSSR
  - Training
  - Orchestration
  - Message Broker
- [ ] Seed script is idempotent (can run multiple times safely)
- [ ] TypeScript interfaces for Category document

**Dependencies:** TASK-004

---

### TASK-009: Service Model Definition

**Description:**  
Create the comprehensive Service Mongoose model with all fields from the D2.1 specification including version management support.

**Acceptance Criteria:**

- [ ] Service schema with all required fields:
  - `shortName` (unique), `title`, `categoryId` (ref)
  - `provider`, `description`, `currentVersion`
  - `versions[]` array with version history
  - `type`, `trl.current`, `trl.expected`
  - `license`, `standards[]`, `inputs[]`, `outputs[]`
  - `interactsWith[]`, `potentialUseCases[]`
  - `repositoryTable` enum: `INTACT_TOOLBOX`, `OTHER_SERVICES`
  - `dockerImageUrl`, `timestamps`
- [ ] Indexes on: `shortName`, `categoryId`, `repositoryTable`, `provider`
- [ ] Version subdocument schema defined
- [ ] TypeScript interfaces for Service document

**Dependencies:** TASK-008

---

### TASK-010: Service Seed Data (D2.1 Services)

**Description:**  
Create seed script to populate the 21 services from D2.1 Tables 17-37 with accurate metadata.

**Acceptance Criteria:**

- [ ] Seed script creates all 21 services from D2.1:
  - ULANCS-GAME, NETWORK-FUZZER, SPLIT, CAST
  - ORION, DATA-DIODE, MMT, ROSCO-EBPF, LLM-TM
  - FPGA-NIDS, K3CR-PROBES, DID, DIST-HSM
  - TWINNING-AGENT, PAC2200-SHADOW
  - HITL-DASHBOARD, TRUSTEE-XAI, OSSR
  - CYBERRANGE, MAESTRO, COS-BROKER
- [ ] Each service has accurate: provider, TRL, license, category
- [ ] Services assigned to correct `repositoryTable`
- [ ] Seed script is idempotent
- [ ] Initial version (1.0.0) created for each service

**Dependencies:** TASK-009

---

### TASK-011: Basic Services API Endpoints

**Description:**  
Implement read-only service listing endpoints for the POC phase to validate the data model and API structure.

**Acceptance Criteria:**

- [ ] `GET /api/services` - List services with pagination
- [ ] Query parameters: `table`, `category`, `provider`, `search`
- [ ] `limit` (default: 20, max: 100) and `skip` pagination
- [ ] `GET /api/services/:id` - Get single service details
- [ ] `GET /api/categories` - List all categories
- [ ] Proper population of category references
- [ ] Response includes total count for pagination
- [ ] All endpoints protected by auth middleware

**Dependencies:** TASK-006, TASK-009, TASK-010

---

### TASK-012: Frontend React/Vite Setup

**Description:**  
Initialize the React frontend with Vite, TypeScript, and essential dependencies including shadcn/ui component library setup.

**Acceptance Criteria:**

- [ ] Vite + React + TypeScript project created
- [ ] Tailwind CSS configured with custom theme from brand kit
- [ ] shadcn/ui initialized with slate color scheme
- [ ] Lucide React icons installed
- [ ] Path aliases configured (`@/` for src)
- [ ] Environment variable handling set up
- [ ] Proxy to backend configured for development

**Dependencies:** TASK-001

---

### TASK-013: Frontend Routing and Layout Shell

**Description:**  
Set up React Router with the application shell layout including sidebar navigation and header.

**Acceptance Criteria:**

- [ ] React Router v6 configured with routes for:
  - `/login` - Login page
  - `/` - Dashboard (protected)
  - `/services` - Service Repository (protected)
  - `/projects` - Digital Twin Projects (protected)
  - `/infrastructure` - Infrastructure (protected)
  - `/analytics` - Analytics (protected)
  - `/settings` - Settings (protected)
- [ ] Protected route wrapper component
- [ ] Application shell with:
  - Fixed sidebar (w-64) with navigation items
  - Header with user menu
  - Main content area
- [ ] Active route highlighting in sidebar
- [ ] Responsive sidebar (collapsible on smaller screens)

**Dependencies:** TASK-012

---

### TASK-014: Authentication State and Login Page

**Description:**  
Implement frontend authentication state management with Zustand and create the login page with form validation.

**Acceptance Criteria:**

- [ ] Zustand auth store with: `user`, `token`, `isAuthenticated`, `login`, `logout`
- [ ] Token persistence in localStorage
- [ ] Axios instance with auth interceptor
- [ ] Login page with:
  - Username and password fields
  - Form validation using React Hook Form + Zod
  - Error message display
  - Loading state during submission
  - Redirect to dashboard on success
- [ ] Auto-redirect to login if not authenticated
- [ ] Auto-redirect to dashboard if already authenticated

**Dependencies:** TASK-012, TASK-013

---

### TASK-015: Service Repository List Page (Read-Only)

**Description:**  
Create the Service Repository page with two tables (INTACT Toolbox and Other Services) displaying service data from the API.

**Acceptance Criteria:**

- [ ] Page displays two sections with tables
- [ ] Table columns: Short Name, Title, Category (badge), Provider, Version
- [ ] Loading skeleton while fetching
- [ ] Empty state if no services
- [ ] Search input filters services by name/title
- [ ] Category filter dropdown
- [ ] Provider filter dropdown
- [ ] Click row opens detail drawer (read-only for POC)
- [ ] React Query for data fetching with caching
- [ ] Pagination controls if > 20 services

**Dependencies:** TASK-011, TASK-014

---

### TASK-016: Service Detail Drawer

**Description:**  
Create a slide-out drawer component showing full service details when a service row is clicked.

**Acceptance Criteria:**

- [ ] Drawer slides in from right side
- [ ] Displays all service metadata:
  - Title, Short Name, Provider
  - Description (full text)
  - Category, TRL (current/expected)
  - License, Standards
  - Inputs, Outputs, Interactions
  - Docker Image URL (copyable)
  - Potential Use Cases
  - Version history list
- [ ] Close button and click-outside-to-close
- [ ] Keyboard accessible (Escape to close)
- [ ] Smooth animation

**Dependencies:** TASK-015

---

### TASK-017: Admin User Seed Script

**Description:**  
Create a seed script to create the initial admin user for system access.

**Acceptance Criteria:**

- [ ] Seed script creates admin user if not exists
- [ ] Username and password configurable via environment variables
- [ ] Default credentials for development: `admin` / `intact2025`
- [ ] Script outputs success/skip message
- [ ] Password properly hashed before storage
- [ ] Integrates with other seed scripts in unified seed command

**Dependencies:** TASK-005

---

### TASK-018: POC Integration Testing

**Description:**  
Verify the complete POC flow works end-to-end: login, view services, view service details.

**Acceptance Criteria:**

- [ ] Can start all services with single command (`docker-compose up`)
- [ ] Can login with admin credentials
- [ ] Service list loads and displays correctly
- [ ] Filters work (category, provider, search)
- [ ] Service detail drawer shows correct information
- [ ] Logout works and redirects to login
- [ ] No console errors in browser
- [ ] API responds within performance targets (<500ms)

**Dependencies:** All Sprint 0 tasks

---

## Sprint 1: MVP - Service Repository

**Goal:** Complete Service Repository with full CRUD operations and version management.  
**Duration:** 1 week

---

### TASK-019: Service Create API Endpoint

**Description:**  
Implement the POST endpoint for creating new services with full validation.

**Acceptance Criteria:**

- [ ] `POST /api/services` creates new service
- [ ] Request body validated with Zod schema
- [ ] `shortName` uniqueness enforced (409 Conflict if exists)
- [ ] Category ID validated (must exist)
- [ ] Initial version created automatically
- [ ] Returns created service with 201 status
- [ ] Proper error responses for validation failures

**Dependencies:** TASK-009

---

### TASK-020: Service Update API Endpoint

**Description:**  
Implement the PUT endpoint for updating existing services.

**Acceptance Criteria:**

- [ ] `PUT /api/services/:id` updates service
- [ ] All fields updatable except `shortName`
- [ ] Category change validated
- [ ] `updatedAt` timestamp automatically updated
- [ ] Returns updated service
- [ ] 404 if service not found
- [ ] Version history NOT affected by basic updates

**Dependencies:** TASK-009

---

### TASK-021: Service Delete API Endpoint

**Description:**  
Implement the DELETE endpoint for removing services with proper validation.

**Acceptance Criteria:**

- [ ] `DELETE /api/services/:id` removes service
- [ ] Returns 204 No Content on success
- [ ] 404 if service not found
- [ ] **Future consideration:** Check if service used in scenarios (flag for clarification)
- [ ] Soft delete consideration (add `isDeleted` flag vs hard delete)

**Dependencies:** TASK-009

**⚠️ Clarification Needed:** Should deletion be soft (mark as deleted) or hard (permanent removal)? Should we prevent deletion if service is used in scenarios?

---

### TASK-022: Service Version Management API

**Description:**  
Implement endpoints for adding new versions to services and retrieving version history.

**Acceptance Criteria:**

- [ ] `POST /api/services/:id/versions` adds new version
- [ ] Version schema: `version`, `dockerImageUrl`, `changelog`, `releasedAt`
- [ ] Semver validation for version string
- [ ] Updates `currentVersion` to new version
- [ ] Prevents duplicate version numbers
- [ ] `GET /api/services/:id/versions` returns version history
- [ ] Versions sorted by release date (newest first)
- [ ] Can optionally mark version as replacement vs new feature

**Dependencies:** TASK-009

---

### TASK-023: Category CRUD API Endpoints

**Description:**  
Implement full CRUD operations for categories to allow management beyond seed data.

**Acceptance Criteria:**

- [ ] `POST /api/categories` creates category
- [ ] Auto-generates slug from name
- [ ] Unique constraint on name and slug
- [ ] `PUT /api/categories/:id` updates category
- [ ] `DELETE /api/categories/:id` removes category
- [ ] Prevent deletion if category has associated services
- [ ] Returns appropriate error messages

**Dependencies:** TASK-008

---

### TASK-024: Add Service Form/Modal

**Description:**  
Create the frontend form for adding new services, implemented as a modal dialog.

**Acceptance Criteria:**

- [ ] "+ Add Service" button opens modal
- [ ] Form fields for all required service properties:
  - Short Name, Title, Provider
  - Category (dropdown populated from API)
  - Description (textarea)
  - Repository Table (radio: INTACT Toolbox / Other)
  - Docker Image URL
  - TRL Current, TRL Expected (number inputs 1-9)
  - License, Standards (comma-separated or tags)
- [ ] Form validation with error messages
- [ ] Submit creates service via API
- [ ] Success: closes modal, refreshes list, shows toast
- [ ] Error: displays error message, keeps form open
- [ ] Cancel button closes without saving

**Dependencies:** TASK-019, TASK-015

---

### TASK-025: Edit Service Form/Modal

**Description:**  
Create the frontend form for editing existing services, pre-populated with current values.

**Acceptance Criteria:**

- [ ] Edit button in service detail drawer or row actions
- [ ] Form pre-populated with existing values
- [ ] Same fields as create form (except shortName disabled)
- [ ] Tracks dirty state (unsaved changes warning)
- [ ] Submit updates service via API
- [ ] Success: closes modal, refreshes data, shows toast
- [ ] Error handling same as create form

**Dependencies:** TASK-020, TASK-016

---

### TASK-026: Delete Service Confirmation

**Description:**  
Implement delete functionality with confirmation dialog.

**Acceptance Criteria:**

- [ ] Delete button with trash icon in service actions
- [ ] Confirmation dialog: "Delete [Service Name]?"
- [ ] Warning text about permanent deletion
- [ ] Cancel and Confirm buttons
- [ ] Confirm triggers delete API call
- [ ] Success: removes from list, shows toast
- [ ] Error: shows error message
- [ ] Loading state during deletion

**Dependencies:** TASK-021, TASK-016

---

### TASK-027: Add Version Modal

**Description:**  
Create modal for adding new versions to an existing service.

**Acceptance Criteria:**

- [ ] "Add Version" button in service detail drawer
- [ ] Form fields:
  - Version number (semver format with validation)
  - Docker Image URL
  - Changelog (textarea, optional)
- [ ] Version format hint: "e.g., 2.1.0"
- [ ] Submit adds version via API
- [ ] Updates current version display
- [ ] Version history list refreshes
- [ ] Error handling for duplicate versions

**Dependencies:** TASK-022, TASK-016

---

### TASK-028: Version History Display

**Description:**  
Enhance service detail drawer to show complete version history with ability to view past versions.

**Acceptance Criteria:**

- [ ] Version history section in drawer
- [ ] List shows: version number, release date, changelog preview
- [ ] Current version highlighted/badged
- [ ] Expandable changelog for each version
- [ ] Docker image URL for each version (copyable)
- [ ] Sorted newest first
- [ ] Empty state if only one version

**Dependencies:** TASK-022, TASK-016

---

### TASK-029: Category Management UI

**Description:**  
Create UI for managing categories in the Settings section.

**Acceptance Criteria:**

- [ ] Categories page/section in Settings
- [ ] Table listing all categories with service count
- [ ] Add Category button opens modal
- [ ] Edit button for each category
- [ ] Delete button (disabled if has services)
- [ ] Confirmation for delete
- [ ] Toast notifications for all actions

**Dependencies:** TASK-023, TASK-013

---

### TASK-030: Toast Notification System

**Description:**  
Implement a global toast notification system for success/error/info messages.

**Acceptance Criteria:**

- [ ] Toast component using shadcn/ui Sonner or custom
- [ ] Support for success, error, warning, info variants
- [ ] Auto-dismiss after 5 seconds
- [ ] Manual dismiss button
- [ ] Stacking for multiple toasts
- [ ] Toast hook: `useToast()` returns `toast.success()`, `toast.error()`, etc.
- [ ] Positioned top-right or bottom-right

**Dependencies:** TASK-012

---

### TASK-031: Loading States and Skeletons

**Description:**  
Implement consistent loading states across the application with skeleton components.

**Acceptance Criteria:**

- [ ] Skeleton components for:
  - Table rows
  - Cards
  - Detail drawer content
  - Form fields
- [ ] Button loading state with spinner
- [ ] Full-page loading for initial auth check
- [ ] Consistent animation (pulse)
- [ ] Matches brand kit colors (slate grays)

**Dependencies:** TASK-012

---

### TASK-032: Error Handling and Error Boundaries

**Description:**  
Implement comprehensive error handling with user-friendly error displays and React error boundaries.

**Acceptance Criteria:**

- [ ] React Error Boundary wrapping main content
- [ ] Fallback UI for caught errors
- [ ] "Something went wrong" page with retry option
- [ ] API error interceptor shows toast for common errors
- [ ] 404 page for unknown routes
- [ ] Network error handling with retry suggestion
- [ ] Form-level error display component

**Dependencies:** TASK-012, TASK-030

---

---

## Sprint 2: MVP - Projects & Scenarios

**Goal:** Implement Digital Twin Projects and basic Scenario management with code-only topology editor.  
**Duration:** 1 week

---

### TASK-033: Project Model Definition

**Description:**  
Create the Project Mongoose model for both atomic and composite Digital Twin projects.

**Acceptance Criteria:**

- [ ] Project schema with fields:
  - `shortName` (unique), `title`
  - `sector` enum: `TELECOMMUNICATIONS`, `HEALTHCARE`, `TRANSPORTATION`, `NUCLEAR`
  - `leader` (string - partner organization name)
  - `involvedPartners[]` (array of strings)
  - `description`
  - `isComposite` boolean
  - `atomicProjectIds[]` (refs to other projects, for composite)
  - `timestamps`
- [ ] Unique index on `shortName`
- [ ] Indexes on `sector`, `leader`
- [ ] TypeScript interfaces

**Dependencies:** TASK-004

---

### TASK-034: Project CRUD API Endpoints

**Description:**  
Implement full CRUD operations for Digital Twin Projects.

**Acceptance Criteria:**

- [ ] `GET /api/projects` - List with filters (sector, leader, search)
- [ ] `GET /api/projects/:id` - Get single project with populated atomicProjects
- [ ] `POST /api/projects` - Create project
- [ ] `PUT /api/projects/:id` - Update project
- [ ] `DELETE /api/projects/:id` - Delete project
- [ ] Validation: composite projects must reference existing atomic projects
- [ ] Validation: atomic projects cannot reference other projects
- [ ] Pagination support for list endpoint

**Dependencies:** TASK-033

---

### TASK-035: Scenario Model Definition

**Description:**  
Create the Scenario Mongoose model with topology storage and execution tracking.

**Acceptance Criteria:**

- [ ] Scenario schema with fields:
  - `projectId` (ref to Project)
  - `title`, `description`
  - `topology` object:
    - `format`: `yaml` or `json`
    - `content`: string (the actual topology)
    - `services[]`: service IDs used
    - `connections[]`: connection definitions
  - `infrastructureId` (ref to Infrastructure, optional initially)
  - `executions[]` array:
    - `executedAt`, `executedBy`
    - `status`: `pending`, `deploying`, `running`, `completed`, `failed`
    - `conclusion` object: `text`, `author`, `addedAt`
    - `maestroSessionId` (for integration)
  - `timestamps`
- [ ] Index on `projectId`
- [ ] Index on `executions.status` for filtering
- [ ] TypeScript interfaces

**Dependencies:** TASK-033

---

### TASK-036: Scenario CRUD API Endpoints

**Description:**  
Implement CRUD operations for Scenarios within a project context.

**Acceptance Criteria:**

- [ ] `GET /api/projects/:projectId/scenarios` - List scenarios for project
- [ ] `GET /api/scenarios/:id` - Get single scenario
- [ ] `POST /api/projects/:projectId/scenarios` - Create scenario
- [ ] `PUT /api/scenarios/:id` - Update scenario
- [ ] `DELETE /api/scenarios/:id` - Delete scenario
- [ ] Validate topology format (basic YAML/JSON parsing)
- [ ] Extract service references from topology content

**Dependencies:** TASK-035

---

### TASK-037: Topology Validation Endpoint

**Description:**  
Create endpoint to validate scenario topology before saving or executing.

**Acceptance Criteria:**

- [ ] `POST /api/scenarios/:id/validate-topology` validates current topology
- [ ] `POST /api/scenarios/validate-topology` validates topology in request body
- [ ] Validation checks:
  - Valid YAML/JSON syntax
  - Required fields present (version, services)
  - Service IDs reference existing services
  - Connections reference valid service IDs
- [ ] Returns validation result with specific errors
- [ ] Does not save - validation only

**Dependencies:** TASK-036

---

### TASK-038: Execution Tracking Endpoints

**Description:**  
Implement endpoints for scenario execution lifecycle management.

**Acceptance Criteria:**

- [ ] `POST /api/scenarios/:id/execute` - Start execution
  - Creates new execution record
  - Sets status to `pending`
  - Returns execution ID
- [ ] `GET /api/scenarios/:id/executions` - List executions
- [ ] `PATCH /api/scenarios/:id/executions/:execId` - Update execution status
- [ ] `POST /api/scenarios/:id/executions/:execId/conclusion` - Add conclusion
  - Conclusion: `text`, `author` (from auth user), `addedAt`
- [ ] Execution records are immutable except status and conclusion

**Dependencies:** TASK-036

---

### TASK-039: Projects List Page

**Description:**  
Create the Digital Twin Projects list page with filtering and project cards.

**Acceptance Criteria:**

- [ ] Page header with "+ New Project" button
- [ ] Filter controls: sector dropdown, search input
- [ ] Project cards showing:
  - Title, Short Name
  - Sector badge (color-coded)
  - Leader organization
  - Partner count
  - Scenario count
  - Last updated date
- [ ] Click card navigates to project detail page
- [ ] Empty state for no projects
- [ ] Loading skeletons

**Dependencies:** TASK-034, TASK-013

---

### TASK-040: Create/Edit Project Modal

**Description:**  
Create modal form for creating and editing Digital Twin projects.

**Acceptance Criteria:**

- [ ] Form fields:
  - Short Name (disabled on edit)
  - Title
  - Sector (dropdown)
  - Leader (text input)
  - Involved Partners (tags/multi-input)
  - Description (textarea)
  - Is Composite (checkbox)
  - Atomic Projects (multi-select, shown if composite)
- [ ] Validation for all required fields
- [ ] Create mode: empty form
- [ ] Edit mode: pre-populated form
- [ ] Success/error handling with toasts

**Dependencies:** TASK-034, TASK-039

---

### TASK-041: Project Detail Page

**Description:**  
Create the project detail page showing project info and scenarios list.

**Acceptance Criteria:**

- [ ] Page header with project title and edit button
- [ ] Project metadata section:
  - Short name, sector, leader
  - Partners list
  - Description
  - Created/Updated dates
- [ ] Scenarios section:
  - "+ New Scenario" button
  - List of scenarios as cards
  - Each card shows: title, last execution status, date
- [ ] Click scenario card navigates to scenario editor
- [ ] Delete project button with confirmation
- [ ] Breadcrumb navigation

**Dependencies:** TASK-036, TASK-039

---

### TASK-042: Scenario Editor Page - Basic Structure

**Description:**  
Create the scenario editor page with basic layout and metadata editing (without visual canvas yet).

**Acceptance Criteria:**

- [ ] Page header with:
  - Back button to project
  - Scenario title (editable)
  - Save button
  - Execute button
- [ ] Metadata section:
  - Title input
  - Description textarea
  - Infrastructure selector (placeholder for now)
- [ ] Topology editor section (full width for now)
- [ ] Auto-save draft to localStorage
- [ ] Unsaved changes warning on navigation

**Dependencies:** TASK-036, TASK-041

---

### TASK-043: Monaco Editor Integration (YAML)

**Description:**  
Integrate Monaco Editor for YAML topology editing with syntax highlighting and validation.

**Acceptance Criteria:**

- [ ] Monaco Editor component with YAML language mode
- [ ] JetBrains Mono font configured
- [ ] Theme matching brand kit (light theme, slate colors)
- [ ] Line numbers enabled
- [ ] Minimap optional (can toggle)
- [ ] Syntax error highlighting
- [ ] Basic YAML snippets for topology structure
- [ ] Ctrl+S triggers save
- [ ] Responsive height (fills available space)
- [ ] Lazy loaded to reduce initial bundle size

**Dependencies:** TASK-042

---

### TASK-044: Topology DSL Template and Snippets

**Description:**  
Create the topology DSL format documentation and editor snippets.

**Acceptance Criteria:**

- [ ] Topology format documented:
  ```yaml
  version: '1.0'
  name: 'Scenario Name'
  description: 'Description'
  services:
    - id: unique-id
      service: 'SERVICE-SHORTNAME'
      version: '1.0.0'
      config: {}
  connections:
    - from: service-id-1
      to: service-id-2
      label: 'Data flow description'
      via: 'kafka'
      topic: 'topic-name'
  ```
- [ ] Monaco snippets for:
  - New topology template
  - Add service block
  - Add connection block
- [ ] Help tooltip/panel explaining format
- [ ] Example topologies for reference

**Dependencies:** TASK-043

---

### TASK-045: Service Palette Panel

**Description:**  
Create a panel showing available services that can be added to the topology.

**Acceptance Criteria:**

- [ ] Collapsible panel below or beside editor
- [ ] Lists services from repository (grouped by category)
- [ ] Search/filter services
- [ ] Each service shows: name, category badge
- [ ] Click service inserts template into editor at cursor
- [ ] Or copy service reference to clipboard
- [ ] Shows Docker image URL on hover

**Dependencies:** TASK-043, TASK-011

---

### TASK-046: Scenario Save and Validation Flow

**Description:**  
Implement the save flow with validation before persisting.

**Acceptance Criteria:**

- [ ] "Validate" button runs topology validation
- [ ] Validation results displayed:
  - Success: green checkmark, "Valid topology"
  - Errors: red list of issues with line numbers
- [ ] "Save" button:
  - Validates first
  - If valid, saves to API
  - If invalid, shows errors, blocks save
- [ ] Save button shows loading state
- [ ] Success toast on save
- [ ] Extracts service references from topology content

**Dependencies:** TASK-037, TASK-043

---

### TASK-047: Execution History Panel

**Description:**  
Create a panel showing execution history for the current scenario.

**Acceptance Criteria:**

- [ ] Panel/tab in scenario editor showing executions
- [ ] List of executions with:
  - Execution date/time
  - Status badge (color-coded)
  - Executed by (username)
  - Conclusion preview (if exists)
- [ ] Click execution expands to show:
  - Full conclusion text
  - Option to add conclusion (if completed/failed without one)
- [ ] Most recent execution highlighted
- [ ] Empty state if no executions

**Dependencies:** TASK-038, TASK-042

---

### TASK-048: Start Execution Flow

**Description:**  
Implement the flow for starting a scenario execution.

**Acceptance Criteria:**

- [ ] "Execute" button in scenario editor
- [ ] Pre-execution checklist/confirmation:
  - Topology must be valid
  - Infrastructure should be selected (warning if not)
- [ ] Confirmation dialog with scenario name
- [ ] On confirm:
  - Calls execute API
  - Creates pending execution record
  - Shows success message
  - Refreshes execution history
- [ ] **Note:** Actual MAESTRO integration in later sprint

**Dependencies:** TASK-038, TASK-047

---

### TASK-049: Add Conclusion Modal

**Description:**  
Create modal for adding a conclusion to a completed execution.

**Acceptance Criteria:**

- [ ] "Add Conclusion" button on execution without conclusion
- [ ] Modal with:
  - Execution info header (date, status)
  - Conclusion textarea (required)
- [ ] Submit calls conclusion API
- [ ] Author automatically set from current user
- [ ] Success closes modal and refreshes
- [ ] Conclusion displayed in execution detail after save

**Dependencies:** TASK-038, TASK-047

---

---

## Sprint 3: Visual Canvas & Split-Screen Editor

**Goal:** Implement React Flow visual canvas and bidirectional synchronization with code editor.  
**Duration:** 1 week

---

### TASK-050: React Flow Setup and Configuration

**Description:**  
Set up React Flow library with custom styling matching brand kit.

**Acceptance Criteria:**

- [ ] React Flow installed and configured
- [ ] Custom theme with brand colors:
  - Node borders: `slate-300`
  - Node backgrounds: `white`
  - Selected node: `yellow-400` border
  - Connection lines: `slate-300`
  - Connection lines selected: `slate-900`
- [ ] Controls component styled
- [ ] MiniMap component (optional toggle)
- [ ] Background grid pattern

**Dependencies:** TASK-012

---

### TASK-051: Service Node Component

**Description:**  
Create custom React Flow node component for services.

**Acceptance Criteria:**

- [ ] Custom node component with:
  - Service short name (header)
  - Service title (subtitle)
  - Category badge
  - Provider text
  - Version number
  - Input handle (left)
  - Output handle (right)
- [ ] Selected state styling (yellow border)
- [ ] Hover state (shadow)
- [ ] Node sizing based on content
- [ ] Lucide icon based on category

**Dependencies:** TASK-050

---

### TASK-052: Connection Edge Component

**Description:**  
Create custom React Flow edge component for data flow connections.

**Acceptance Criteria:**

- [ ] Custom edge with:
  - Label (data flow description)
  - Arrow marker at target
  - Via indicator (e.g., "kafka" badge)
- [ ] Edge styling: `slate-300`, 2px stroke
- [ ] Selected edge: `slate-900`
- [ ] Animated edge option (for active flows)
- [ ] Edge path: bezier curve

**Dependencies:** TASK-050

---

### TASK-053: Split-Screen Layout

**Description:**  
Create the split-screen layout with resizable panels for code editor and visual canvas.

**Acceptance Criteria:**

- [ ] Horizontal split: left (code), right (canvas)
- [ ] Resizable divider (drag to resize)
- [ ] Minimum widths for each panel (300px)
- [ ] Panel collapse buttons
- [ ] Persist panel sizes in localStorage
- [ ] Full-height layout (fills viewport below header)
- [ ] Mobile: stacked vertically or tabs

**Dependencies:** TASK-043, TASK-050

---

### TASK-054: YAML to Canvas Synchronization

**Description:**  
Implement parsing YAML topology and rendering as React Flow nodes and edges.

**Acceptance Criteria:**

- [ ] Parse YAML content on change (debounced 500ms)
- [ ] Generate React Flow nodes from `services` array:
  - Position calculated using layout algorithm
  - Node data includes service reference
- [ ] Generate React Flow edges from `connections` array
- [ ] Handle parse errors gracefully (keep last valid state)
- [ ] Visual indicator when canvas is out of sync
- [ ] Fetch service metadata for display in nodes

**Dependencies:** TASK-044, TASK-051, TASK-052

---

### TASK-055: Auto-Layout Algorithm

**Description:**  
Implement automatic layout algorithm for positioning nodes when parsed from YAML.

**Acceptance Criteria:**

- [ ] Dagre or ELK layout algorithm integration
- [ ] Left-to-right flow layout (default)
- [ ] Consistent spacing between nodes
- [ ] Handle disconnected nodes (position below)
- [ ] "Auto Layout" button to re-run layout
- [ ] Preserve manual positions if user has dragged nodes

**Dependencies:** TASK-054

---

### TASK-056: Canvas to YAML Synchronization

**Description:**  
Implement updating YAML when canvas is modified (add/remove/connect nodes).

**Acceptance Criteria:**

- [ ] Adding node from palette updates YAML
- [ ] Removing node updates YAML
- [ ] Creating connection updates YAML
- [ ] Removing connection updates YAML
- [ ] Dragging node updates position (stored in node config)
- [ ] Changes reflected in Monaco editor immediately
- [ ] Maintain YAML formatting (use yaml library for serialization)

**Dependencies:** TASK-054

---

### TASK-057: Drag-and-Drop from Service Palette

**Description:**  
Enable dragging services from palette and dropping onto canvas to add them.

**Acceptance Criteria:**

- [ ] Services in palette are draggable
- [ ] Drop zone is the React Flow canvas
- [ ] Drop creates new node at drop position
- [ ] Node ID generated automatically (service-shortname-N)
- [ ] Prompts for version selection if multiple versions
- [ ] YAML updated with new service entry
- [ ] Visual feedback during drag (ghost, drop indicator)

**Dependencies:** TASK-045, TASK-056

---

### TASK-058: Node Selection and Context Menu

**Description:**  
Implement node selection and right-click context menu for actions.

**Acceptance Criteria:**

- [ ] Click node to select (yellow border)
- [ ] Multi-select with Shift+click or drag selection
- [ ] Right-click opens context menu:
  - Edit configuration
  - Delete node
  - Duplicate node
- [ ] Delete key removes selected nodes
- [ ] Selection state shared between canvas and editor (highlight in YAML)

**Dependencies:** TASK-051, TASK-056

---

### TASK-059: Connection Creation on Canvas

**Description:**  
Enable creating connections by dragging between node handles.

**Acceptance Criteria:**

- [ ] Drag from output handle shows connection preview
- [ ] Drop on input handle creates connection
- [ ] Connection dialog prompts for:
  - Label (data flow description)
  - Via (default: "kafka")
  - Topic name (optional)
- [ ] Connection added to YAML `connections` array
- [ ] Invalid connections prevented (self-loop)
- [ ] Visual feedback during connection creation

**Dependencies:** TASK-052, TASK-056

---

### TASK-060: Connection Editing and Deletion

**Description:**  
Enable editing and deleting connections on the canvas.

**Acceptance Criteria:**

- [ ] Click connection to select
- [ ] Double-click opens edit dialog
- [ ] Edit dialog: label, via, topic
- [ ] Delete key removes selected connection
- [ ] Right-click context menu: Edit, Delete
- [ ] Updates reflected in YAML immediately

**Dependencies:** TASK-059

---

### TASK-061: Canvas Toolbar

**Description:**  
Create toolbar for canvas with common actions and view controls.

**Acceptance Criteria:**

- [ ] Toolbar positioned above canvas
- [ ] Actions:
  - Zoom In / Zoom Out
  - Fit View (reset zoom to show all)
  - Toggle MiniMap
  - Auto Layout
  - Toggle Grid
- [ ] Zoom percentage indicator
- [ ] Undo / Redo (if feasible)
- [ ] Icons from Lucide React

**Dependencies:** TASK-050

---

### TASK-062: Validation Highlighting

**Description:**  
Show validation errors visually on both code and canvas.

**Acceptance Criteria:**

- [ ] Monaco: underline errors with red squiggle
- [ ] Monaco: error markers in gutter
- [ ] Canvas: error nodes have red border
- [ ] Canvas: error connections have red color
- [ ] Validation panel shows clickable errors
- [ ] Click error in panel: focuses code line or selects node
- [ ] Real-time validation (debounced)

**Dependencies:** TASK-046, TASK-054

---

---

## Sprint 4: MAESTRO Integration & Workspace

**Goal:** Implement MAESTRO integration via iFrame and tabbed workspace for service dashboards.  
**Duration:** 1 week

---

### TASK-063: Infrastructure Model Definition

**Description:**  
Create the Infrastructure Mongoose model for Kubernetes cluster endpoints.

**Acceptance Criteria:**

- [ ] Infrastructure schema:
  - `name` (unique)
  - `type` enum: `kubernetes`, `docker`, `other`
  - `endpoint` (URL)
  - `credentials` object (encrypted):
    - `encryptedData`, `iv`, `authTag`
  - `capacity`:
    - `cpuCores`, `memoryGB`, `storageGB`
  - `status` enum: `available`, `offline`, `maintenance`
  - `lastHealthCheck` date
  - `timestamps`
- [ ] Indexes on `name`, `status`
- [ ] TypeScript interfaces

**Dependencies:** TASK-004

---

### TASK-064: Credential Encryption Utility

**Description:**  
Implement AES-256-GCM encryption for infrastructure credentials.

**Acceptance Criteria:**

- [ ] Encryption function using Node.js crypto
- [ ] 32-byte encryption key from environment variable
- [ ] Random 12-byte IV for each encryption
- [ ] Returns: `{ encryptedData, iv, authTag }`
- [ ] Decryption function for internal use
- [ ] Key validation on startup (error if not set/invalid)
- [ ] Credentials NEVER returned in API responses
- [ ] Unit tests for encryption/decryption

**Dependencies:** TASK-003

---

### TASK-065: Infrastructure CRUD API Endpoints

**Description:**  
Implement CRUD operations for infrastructure management.

**Acceptance Criteria:**

- [ ] `GET /api/infrastructures` - List all (without credentials)
- [ ] `GET /api/infrastructures/:id` - Get single (without credentials)
- [ ] `POST /api/infrastructures` - Create with encrypted credentials
- [ ] `PUT /api/infrastructures/:id` - Update (re-encrypt if creds changed)
- [ ] `DELETE /api/infrastructures/:id` - Remove infrastructure
- [ ] `POST /api/infrastructures/:id/test` - Test connectivity
  - Decrypts credentials
  - Attempts connection
  - Returns success/failure
- [ ] Response never includes raw credentials

**Dependencies:** TASK-063, TASK-064

---

### TASK-066: Infrastructure Management Page

**Description:**  
Create the infrastructure management page in the UI.

**Acceptance Criteria:**

- [ ] Table listing infrastructures:
  - Name, Type, Endpoint, Status, Last Health Check
- [ ] Status badge (Available green, Offline red, Maintenance yellow)
- [ ] "+ Add Infrastructure" button
- [ ] Edit button per row
- [ ] Delete button with confirmation
- [ ] "Test Connection" button per row
- [ ] Test shows loading, then success/error toast

**Dependencies:** TASK-065

---

### TASK-067: Add/Edit Infrastructure Modal

**Description:**  
Create modal for adding and editing infrastructure configurations.

**Acceptance Criteria:**

- [ ] Form fields:
  - Name (disabled on edit)
  - Type (dropdown)
  - Endpoint URL (validated)
  - Credentials (password field, masked)
    - Note: "Leave blank to keep existing" on edit
  - Capacity: CPU Cores, Memory GB, Storage GB
- [ ] Validation for required fields
- [ ] URL format validation for endpoint
- [ ] Submit encrypts and saves
- [ ] Success/error handling

**Dependencies:** TASK-066

---

### TASK-068: Infrastructure Selector in Scenario Editor

**Description:**  
Add infrastructure selection to scenario editor.

**Acceptance Criteria:**

- [ ] Dropdown in scenario metadata section
- [ ] Lists available infrastructures (status = available)
- [ ] Shows current selection with status indicator
- [ ] Can clear selection
- [ ] Saves with scenario
- [ ] Warning if no infrastructure selected before execute
- [ ] Disabled options for offline infrastructure

**Dependencies:** TASK-065, TASK-042

---

### TASK-069: Tabbed Workspace Component

**Description:**  
Create the tabbed workspace panel at bottom of application for service dashboards and MAESTRO.

**Acceptance Criteria:**

- [ ] Collapsible panel at bottom of screen
- [ ] Tab bar with close buttons
- [ ] Tabs can be:
  - MAESTRO deployment tab
  - Service dashboard tabs
- [ ] Resizable height (drag handle)
- [ ] Collapse to just tab bar
- [ ] Maximum ~5 tabs (close oldest if exceeded)
- [ ] Tab state stored in Zustand
- [ ] Keyboard shortcut to toggle (Ctrl+`)

**Dependencies:** TASK-012

---

### TASK-070: MAESTRO iFrame Tab

**Description:**  
Create the MAESTRO deployment tab with iFrame integration.

**Acceptance Criteria:**

- [ ] Tab labeled "MAESTRO"
- [ ] iFrame loads MAESTRO URL with scenario parameters:
  - `https://maestro.example.com/deploy?scenario={id}`
  - URL pattern configurable via environment
- [ ] Loading indicator while iFrame loads
- [ ] Error handling if iFrame fails to load
- [ ] Refresh button in tab
- [ ] Opens automatically when execution starts
- [ ] **Note:** Mock/placeholder if MAESTRO not available

**Dependencies:** TASK-069

---

### TASK-071: Execute Scenario Integration

**Description:**  
Connect execution flow to open MAESTRO tab and track status.

**Acceptance Criteria:**

- [ ] Execute button:
  1. Validates topology
  2. Checks infrastructure selected
  3. Creates execution record (pending)
  4. Opens MAESTRO tab with scenario
  5. Updates execution status to `deploying`
- [ ] Poll for status updates (or webhook if available)
- [ ] Update execution status: `running`, `completed`, `failed`
- [ ] **Note:** Actual status updates may be manual for MVP

**Dependencies:** TASK-070, TASK-048

---

### TASK-072: Service Dashboard Tabs

**Description:**  
Open service dashboards in workspace tabs during/after execution.

**Acceptance Criteria:**

- [ ] After deployment, MAESTRO provides dashboard URLs
- [ ] "Open Dashboard" button per deployed service
- [ ] Opens new tab with service name
- [ ] iFrame loads service dashboard URL
- [ ] Handle services without dashboards gracefully
- [ ] CLI-based services: consider xterm.js (deferred/simplified)
- [ ] **Note:** May need to handle X-Frame-Options issues

**Dependencies:** TASK-069, TASK-071

**⚠️ Clarification Needed:** How does MAESTRO communicate deployed service dashboard URLs back to the platform?

---

### TASK-073: Execution Status Updates

**Description:**  
Implement mechanism to update execution status (polling or webhook).

**Acceptance Criteria:**

- [ ] Option A - Polling:
  - Poll MAESTRO status endpoint every 10 seconds
  - Update local execution record
  - Stop polling when terminal status reached
- [ ] Option B - Manual:
  - Admin can manually update status via UI
  - Dropdown to change status
- [ ] Status change triggers UI refresh
- [ ] Completion enables "Add Conclusion" action

**Dependencies:** TASK-071

**⚠️ Clarification Needed:** Does MAESTRO provide a status endpoint or webhook mechanism?

---

### TASK-074: Scenario Detail View (Read-Only)

**Description:**  
Create a read-only view of scenario for reviewing completed executions.

**Acceptance Criteria:**

- [ ] View mode shows topology (not editable)
- [ ] Canvas displays services and connections
- [ ] Execution history prominently displayed
- [ ] Selected execution shows:
  - Full details
  - Conclusion
  - "Re-open" button to edit scenario
- [ ] Link shareable for collaboration
- [ ] Navigation from project page

**Dependencies:** TASK-053

---

---

## Sprint 5: Analytics, Polish & Deployment

**Goal:** Implement analytics, PDF export, dashboard, and final polish for production readiness.  
**Duration:** 1 week

---

### TASK-075: Analytics API Endpoints

**Description:**  
Create API endpoints for analytics data retrieval.

**Acceptance Criteria:**

- [ ] `GET /api/analytics/scenarios` - Execution history across all scenarios
  - Filters: dateRange, status, projectId
  - Pagination
- [ ] `GET /api/analytics/scenarios/stats` - Aggregated statistics:
  - Total executions (by time period)
  - Executions by status (counts)
  - Executions by project
  - Average time to complete (if tracked)
- [ ] Response optimized for charting

**Dependencies:** TASK-035

---

### TASK-076: Dashboard Home Page

**Description:**  
Create the dashboard home page with summary cards and quick actions.

**Acceptance Criteria:**

- [ ] Summary cards (top row):
  - Total Services (with +/- change indicator)
  - Total Projects
  - Total Scenarios
  - Recent Executions (last 7 days)
- [ ] Recent Executions list:
  - Last 10 executions
  - Scenario name, project, status, date
  - Click navigates to scenario
- [ ] Quick Actions section:
  - "+ New Project" button
  - "+ Add Service" button
- [ ] Infrastructure Health section:
  - List of infrastructures with status
- [ ] Recently Updated Services list
- [ ] Loading skeletons for all sections

**Dependencies:** TASK-075, TASK-013

---

### TASK-077: Analytics Page

**Description:**  
Create analytics page with execution history and statistics.

**Acceptance Criteria:**

- [ ] Date range filter (preset: 7d, 30d, 90d, custom)
- [ ] Status filter (multi-select)
- [ ] Project filter (dropdown)
- [ ] Execution history table:
  - Columns: Scenario, Project, Status, Executed By, Date
  - Sortable columns
  - Pagination
  - Click row navigates to execution
- [ ] Stats summary cards at top
- [ ] **Optional:** Simple chart (executions over time)

**Dependencies:** TASK-075

---

### TASK-078: PDF Export Endpoint

**Description:**  
Create endpoint to generate PDF report for scenario execution.

**Acceptance Criteria:**

- [ ] `GET /api/scenarios/:id/executions/:execId/export/pdf`
- [ ] PDFKit generates report with:
  - Header: INTACT logo, report title
  - Scenario info: name, description, project
  - Topology: services list, connections list
  - Execution details: date, status, by
  - Conclusion text
  - Footer: generated date, page numbers
- [ ] Returns PDF file (Content-Type: application/pdf)
- [ ] Filename: `scenario-{name}-execution-{date}.pdf`
- [ ] Generation < 10 seconds
- [ ] Proper error handling

**Dependencies:** TASK-035

---

### TASK-079: PDF Export Button in UI

**Description:**  
Add PDF export functionality to execution view.

**Acceptance Criteria:**

- [ ] "Export PDF" button on execution detail
- [ ] Button shows loading state during generation
- [ ] Downloads PDF file on success
- [ ] Error toast if generation fails
- [ ] Only available for completed/failed executions
- [ ] Button disabled if no conclusion added

**Dependencies:** TASK-078, TASK-047

---

### TASK-080: User Management Page

**Description:**  
Create basic user management page for viewing and managing users.

**Acceptance Criteria:**

- [ ] Table listing users:
  - Username, Role, Created Date, Last Login (if tracked)
- [ ] "+ Add User" button (admin only)
- [ ] Add user form: username, password, role
- [ ] Delete user button (cannot delete self)
- [ ] Reset password functionality
- [ ] **Note:** MVP has single admin role

**Dependencies:** TASK-005

---

### TASK-081: Settings Page

**Description:**  
Create settings page with application configuration options.

**Acceptance Criteria:**

- [ ] Sections:
  - Category Management (link to TASK-029)
  - User Preferences (placeholder)
  - System Information (version, environment)
- [ ] Category management inline or as sub-page
- [ ] **Future:** Theme settings, notification preferences

**Dependencies:** TASK-029

---

### TASK-082: Brand Kit Implementation Audit

**Description:**  
Audit all UI components against brand kit specifications and fix inconsistencies.

**Acceptance Criteria:**

- [ ] Colors match brand kit (slate palette, yellow accent)
- [ ] Typography scale matches specification
- [ ] Button styles match all states (hover, active, disabled)
- [ ] Focus states use yellow ring consistently
- [ ] Status badges match defined colors
- [ ] No semantic color backgrounds (text/border only)
- [ ] Spacing follows 8px base system
- [ ] Cards, inputs, modals match component specs

**Dependencies:** Brand kit document

---

### TASK-083: Accessibility Audit and Fixes

**Description:**  
Audit application for WCAG 2.1 AA compliance and fix issues.

**Acceptance Criteria:**

- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible on all elements
- [ ] ARIA labels on icon-only buttons
- [ ] Form labels properly associated
- [ ] Color contrast meets 4.5:1 minimum
- [ ] Screen reader testing (basic)
- [ ] Skip link to main content
- [ ] No focus traps
- [ ] Error messages announced to screen readers

**Dependencies:** All UI tasks

---

### TASK-084: Performance Optimization

**Description:**  
Optimize application performance to meet target metrics.

**Acceptance Criteria:**

- [ ] Initial page load < 3 seconds
- [ ] API responses < 500ms (p95)
- [ ] Code splitting by route implemented
- [ ] Monaco Editor lazy loaded
- [ ] React Flow lazy loaded
- [ ] Images optimized (if any)
- [ ] Gzip compression enabled
- [ ] React Query caching effective
- [ ] No memory leaks in editors

**Dependencies:** All implementation tasks

---

### TASK-085: Error Logging and Monitoring Setup

**Description:**  
Set up error logging and basic monitoring for production.

**Acceptance Criteria:**

- [ ] Backend logging with structured format
- [ ] Log levels: error, warn, info, debug
- [ ] Request/response logging (sanitized)
- [ ] Frontend error boundary reports errors
- [ ] Console errors logged in development
- [ ] **Optional:** Integration with logging service
- [ ] Environment-based log levels

**Dependencies:** TASK-003

---

### TASK-086: API Documentation

**Description:**  
Generate API documentation for all endpoints.

**Acceptance Criteria:**

- [ ] OpenAPI/Swagger specification
- [ ] All endpoints documented:
  - HTTP method, path
  - Request body schema
  - Response schema
  - Error responses
  - Authentication requirements
- [ ] Swagger UI available at `/api/docs` (dev only)
- [ ] Export as static documentation

**Dependencies:** All API tasks

---

### TASK-087: End-to-End Testing

**Description:**  
Create end-to-end tests for critical user flows.

**Acceptance Criteria:**

- [ ] Test framework set up (Playwright or Cypress)
- [ ] Tests for:
  - Login flow
  - Create service flow
  - Create project flow
  - Create scenario with topology
  - Execute scenario (mock MAESTRO)
  - Add conclusion
- [ ] Tests run in CI (if configured)
- [ ] All critical paths covered

**Dependencies:** All implementation tasks

---

### TASK-088: Production Dockerfile and Build

**Description:**  
Create optimized Docker images for production deployment.

**Acceptance Criteria:**

- [ ] Multi-stage Dockerfile for backend
- [ ] Multi-stage Dockerfile for frontend (build + nginx)
- [ ] Production build optimizations
- [ ] Environment variables properly handled
- [ ] Health check endpoints configured
- [ ] Non-root user in containers
- [ ] Image size minimized
- [ ] `docker-compose.prod.yml` for production

**Dependencies:** TASK-002

---

### TASK-089: Deployment Documentation

**Description:**  
Create comprehensive deployment and operations documentation.

**Acceptance Criteria:**

- [ ] README with:
  - Project overview
  - Local development setup
  - Environment variables reference
  - Build and deployment instructions
- [ ] Docker deployment guide
- [ ] Kubernetes deployment guide (basic)
- [ ] Database backup/restore procedures
- [ ] Troubleshooting common issues
- [ ] Security considerations

**Dependencies:** All tasks

---

### TASK-090: Final Integration Testing

**Description:**  
Complete end-to-end integration testing of all features.

**Acceptance Criteria:**

- [ ] All POC criteria verified
- [ ] All MVP criteria verified
- [ ] Service CRUD works completely
- [ ] Project and Scenario management works
- [ ] Topology editor (code + visual) synchronized
- [ ] Execution flow complete (with mock MAESTRO)
- [ ] PDF export generates correctly
- [ ] Analytics display correct data
- [ ] No console errors
- [ ] Performance targets met
- [ ] Ready for consortium demo

**Dependencies:** All tasks

---

## Ambiguous Requirements & Clarifications Needed

The following items require clarification for accurate implementation:

| ID         | Question                                                            | Impact    | Suggested Default                 |
| ---------- | ------------------------------------------------------------------- | --------- | --------------------------------- |
| **CL-001** | Should service deletion be soft (mark deleted) or hard (permanent)? | TASK-021  | Soft delete with `isDeleted` flag |
| **CL-002** | Should deletion be prevented if service is used in scenarios?       | TASK-021  | Show warning but allow deletion   |
| **CL-003** | How does MAESTRO provide deployed service dashboard URLs?           | TASK-072  | Manual entry or polling endpoint  |
| **CL-004** | Does MAESTRO provide status webhooks or polling endpoint?           | TASK-073  | Polling every 10s                 |
| **CL-005** | What is the exact MAESTRO URL pattern for deployment?               | TASK-070  | Configurable via environment      |
| **CL-006** | Should execution logs be persisted?                                 | TAD       | Not in v1.0                       |
| **CL-007** | Maximum topology file size?                                         | TAD       | 1MB limit                         |
| **CL-008** | Specific INTACT branding/logo files?                                | Brand Kit | Use wordmark as specified         |

---

## Task Summary

| Sprint         | Tasks                | Estimated Days  |
| -------------- | -------------------- | --------------- |
| Sprint 0 (POC) | TASK-001 to TASK-018 | 3-4 days        |
| Sprint 1 (MVP) | TASK-019 to TASK-032 | 5 days          |
| Sprint 2 (MVP) | TASK-033 to TASK-049 | 5 days          |
| Sprint 3       | TASK-050 to TASK-062 | 5 days          |
| Sprint 4       | TASK-063 to TASK-074 | 5 days          |
| Sprint 5       | TASK-075 to TASK-090 | 5 days          |
| **Total**      | **90 tasks**         | **~28-30 days** |

---

## Definition of Done (DoD)

A task is considered complete when:

- [ ] All acceptance criteria are met
- [ ] Code follows TypeScript best practices
- [ ] No ESLint errors or warnings
- [ ] Unit tests written (where applicable)
- [ ] Code reviewed (self-review for solo dev)
- [ ] Feature works in development environment
- [ ] No console errors
- [ ] Responsive design verified (desktop primary)
- [ ] Accessibility basics verified
- [ ] Documentation updated if needed

---

_Document Version: 1.0_  
_Created: 2025-01-13_  
_Project: INTACT Digital Twin Management Platform_
