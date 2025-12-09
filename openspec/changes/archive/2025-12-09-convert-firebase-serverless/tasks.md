# Tasks: Convert to Firebase Serverless Architecture

## Phase 1: Firebase Setup & Authentication

### 1.1 Initialize Firebase Project
- [ ] Create Firebase project in Firebase Console
- [ ] Enable Authentication with Email/Password provider
- [ ] Create Firestore database in production mode
- [ ] Download and configure `firebase.json` and `.firebaserc`
- [ ] Add Firebase SDK to client dependencies
- **Validation**: Firebase project accessible, Auth and Firestore enabled

### 1.2 Create Firebase Configuration
- [ ] Create `client/src/lib/firebase.ts` with Firebase initialization
- [ ] Configure Firebase for development environment
- [ ] Add Firebase config to environment variables
- [ ] Export auth and firestore instances
- **Validation**: Firebase initializes without errors in console

### 1.3 Replace Authentication System
- [ ] Update `client/src/store/auth-store.ts` to use Firebase Auth
- [ ] Replace JWT token storage with Firebase Auth state listener
- [ ] Update login function to use `signInWithEmailAndPassword`
- [ ] Update logout function to use `signOut`
- [ ] Remove custom token refresh logic
- **Validation**: Login/logout works with Firebase Auth

### 1.4 Update Login Page
- [ ] Modify `client/src/pages/Login.tsx` to use Firebase Auth
- [ ] Update error handling for Firebase Auth errors
- [ ] Test email/password login flow
- **Validation**: User can log in and access protected routes

### 1.5 Update Auth Middleware
- [ ] Create Firebase Auth context provider if needed
- [ ] Update protected route logic to check Firebase Auth state
- [ ] Handle auth state loading state
- **Validation**: Protected routes redirect to login when not authenticated

---

## Phase 2: Firestore Data Layer

### 2.1 Create Firestore Service Modules
- [ ] Create `client/src/lib/firestore/index.ts` - exports all modules
- [ ] Create `client/src/lib/firestore/categories.ts` - category operations
- [ ] Create `client/src/lib/firestore/services.ts` - service operations
- [ ] Create `client/src/lib/firestore/projects.ts` - project operations
- [ ] Create `client/src/lib/firestore/scenarios.ts` - scenario operations (subcollection)
- [ ] Create `client/src/lib/firestore/infrastructures.ts` - infrastructure operations
- [ ] Create `client/src/lib/firestore/users.ts` - user operations
- **Validation**: All modules export CRUD functions

### 2.2 Implement Categories Service
- [ ] Implement `getCategories()` - list all categories
- [ ] Implement `getCategoryById()` - get single category
- [ ] Implement `createCategory()` - create new category
- [ ] Implement `updateCategory()` - update existing category
- [ ] Implement `deleteCategory()` - delete category
- **Validation**: Categories CRUD works in UI

### 2.3 Implement Services Service
- [ ] Implement `getServices()` with filtering (table, category, provider, search)
- [ ] Implement `getServiceById()` - get single service with category populated
- [ ] Implement `createService()` - create new service
- [ ] Implement `updateService()` - update existing service
- [ ] Implement `deleteService()` - delete service
- [ ] Implement `addServiceVersion()` - add version to service
- **Validation**: Services list, create, edit, delete work

### 2.4 Implement Projects Service
- [ ] Implement `getProjects()` with filtering (sector, leader, search)
- [ ] Implement `getProjectById()` with scenario count
- [ ] Implement `createProject()` - create new project
- [ ] Implement `updateProject()` - update existing project
- [ ] Implement `deleteProject()` - delete project and its scenarios
- **Validation**: Projects CRUD works, scenario count displays

### 2.5 Implement Scenarios Service
- [ ] Implement `getScenariosByProject()` - list scenarios for a project
- [ ] Implement `getScenarioById()` - get single scenario with refs populated
- [ ] Implement `createScenario()` - create scenario in project subcollection
- [ ] Implement `updateScenario()` - update scenario topology, infrastructure
- [ ] Implement `deleteScenario()` - delete scenario
- [ ] Implement `addExecution()` - add execution record
- [ ] Implement `addConclusion()` - add conclusion to execution
- **Validation**: Scenarios CRUD works within projects

### 2.6 Implement Infrastructures Service
- [ ] Implement `getInfrastructures()` - list all infrastructures
- [ ] Implement `getInfrastructureById()` - get single infrastructure
- [ ] Implement `createInfrastructure()` - create without credentials
- [ ] Implement `updateInfrastructure()` - update infrastructure
- [ ] Implement `deleteInfrastructure()` - delete infrastructure
- **Validation**: Infrastructures CRUD works (without credential encryption)

### 2.7 Implement Users Service
- [ ] Implement `getUsers()` - list all users (admin only)
- [ ] Implement `createUser()` - create Firebase Auth user + Firestore doc
- [ ] Implement `deleteUser()` - delete Firebase Auth user + Firestore doc
- **Validation**: User management works in settings

### 2.8 Update API Module
- [ ] Replace `client/src/lib/api.ts` with Firestore exports
- [ ] Maintain same interface for backward compatibility
- [ ] Update all API imports throughout the application
- **Validation**: All API consumers work without changes

---

## Phase 3: Security & Real-time Features

### 3.1 Create Firestore Security Rules
- [ ] Create `firestore.rules` with authentication checks
- [ ] Implement admin role check using user document
- [ ] Set read permissions for authenticated users
- [ ] Set write permissions for admin users
- [ ] Deploy rules to Firebase
- **Validation**: Non-admin users cannot write data

### 3.2 Add Real-time Listeners (Optional Enhancement)
- [ ] Add real-time listener for services list
- [ ] Add real-time listener for projects list
- [ ] Update React Query to work with Firestore snapshots
- **Validation**: UI updates automatically when data changes

### 3.3 Create Firestore Indexes
- [ ] Define indexes for services (repositoryTable, categoryId, provider)
- [ ] Define indexes for projects (sector, leader)
- [ ] Define composite indexes for filtered queries
- [ ] Deploy indexes via `firebase deploy --only firestore:indexes`
- **Validation**: Queries execute without index errors

---

## Phase 4: Migration & Cleanup

### 4.1 Create Data Migration Script
- [ ] Create script to export MongoDB data to JSON
- [ ] Create script to import JSON to Firestore
- [ ] Handle ObjectId to string conversion
- [ ] Handle reference conversions
- [ ] Migrate categories first, then services, projects, scenarios
- **Validation**: All existing data accessible in Firestore

### 4.2 Seed Initial Data
- [ ] Create admin user in Firebase Auth
- [ ] Create admin user document in Firestore
- [ ] Seed categories if empty
- [ ] Seed sample services if needed
- **Validation**: Fresh deployment has working admin login

### 4.3 Update Deployment Configuration
- [ ] Configure Firebase Hosting for static frontend
- [ ] Update `vite.config.ts` for Firebase Hosting
- [ ] Create GitHub Actions for Firebase deployment
- [ ] Update environment variable handling
- **Validation**: Frontend deploys to Firebase Hosting

### 4.4 Remove Server Code
- [ ] Archive `server/` directory (move to `_archive/server`)
- [ ] Remove server dependencies from root if any
- [ ] Update documentation to reflect new architecture
- [ ] Remove MongoDB connection code
- **Validation**: Application works without server running

### 4.5 Final Testing & Documentation
- [ ] Test all CRUD operations end-to-end
- [ ] Test authentication flow
- [ ] Test security rules enforcement
- [ ] Update README with new setup instructions
- [ ] Document Firebase project configuration
- **Validation**: All features work as before, documentation updated

---

## Future Phase: Cloud Functions (Separate Proposal)

### Deferred Tasks
- [ ] Implement credential encryption via Cloud Function
- [ ] Implement complex aggregations via Cloud Function
- [ ] Implement PDF generation via Cloud Function
- [ ] Implement MAESTRO webhook handlers
- [ ] Implement scheduled health checks for infrastructures
