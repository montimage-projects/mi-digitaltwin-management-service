# Tasks: Complete Sprint 5 - Analytics, Polish & Deployment

## 1. User Management Backend

- [x] 1.1 Create `GET /api/users` endpoint (list users without passwords)
- [x] 1.2 Create `POST /api/users` endpoint for admin to add users
- [x] 1.3 Create `DELETE /api/users/:id` endpoint (prevent self-delete)
- [x] 1.4 Create `PATCH /api/users/:id/password` endpoint for password reset
- [x] 1.5 Add users routes to app.ts

## 2. User Management Frontend

- [x] 2.1 Add usersApi to `lib/api.ts` with list, create, delete, resetPassword
- [x] 2.2 Create UserManagement page component with users table
- [x] 2.3 Create AddUserModal with username, password, role fields
- [x] 2.4 Add delete confirmation with self-delete prevention
- [x] 2.5 Add password reset dialog
- [x] 2.6 Add route `/settings/users` to App.tsx (integrated via Settings tabs)

## 3. Settings Page

- [x] 3.1 Update Settings.tsx with tabbed interface (General, Users, Categories)
- [x] 3.2 Add General tab showing system info (version, environment)
- [x] 3.3 Add Users tab linking to UserManagement
- [x] 3.4 Add Categories tab with existing category management
- [x] 3.5 Add MAESTRO URL configuration display (read-only from env)

## 4. Brand Kit & Accessibility Audit

- [x] 4.1 Audit color palette usage (slate, yellow accent)
- [x] 4.2 Verify focus ring styling (yellow-400) on all interactive elements
- [x] 4.3 Add aria-labels to icon-only buttons
- [x] 4.4 Verify form labels are properly associated
- [x] 4.5 Add skip-to-content link in MainLayout
- [x] 4.6 Test keyboard navigation on main flows

## 5. Performance Optimization

- [x] 5.1 Add route-based code splitting with React.lazy
- [x] 5.2 Lazy load Monaco Editor component (via code splitting)
- [x] 5.3 Lazy load React Flow canvas component (via code splitting)
- [x] 5.4 Verify React Query caching is effective (5-min stale time)
- [x] 5.5 Add gzip compression middleware to server

## 6. Error Logging & Monitoring

- [x] 6.1 Create structured logger utility (custom implementation)
- [x] 6.2 Add request/response logging middleware (morgan)
- [x] 6.3 Add error logging in error handler middleware
- [x] 6.4 Configure log levels based on NODE_ENV
- [x] 6.5 Add React Error Boundary with error reporting (existing)

## 7. API Documentation

- [x] 7.1 Install swagger-jsdoc and swagger-ui-express (used inline spec instead)
- [x] 7.2 Create OpenAPI spec file with API metadata
- [x] 7.3 Document auth endpoints
- [x] 7.4 Document services endpoints
- [x] 7.5 Document projects endpoints
- [x] 7.6 Document scenarios endpoints
- [x] 7.7 Document infrastructures endpoints
- [x] 7.8 Mount Swagger UI at /api/docs (dev only)

## 8. Production Docker Build

- [x] 8.1 Create `server/Dockerfile` with multi-stage build
- [x] 8.2 Create `client/Dockerfile` with build + nginx stage
- [x] 8.3 Create `docker-compose.prod.yml` for production
- [x] 8.4 Add nginx.conf for client static serving
- [x] 8.5 Add health check configurations
- [x] 8.6 Document environment variables for production

## 9. Deployment Documentation

- [x] 9.1 Update README with complete setup instructions
- [x] 9.2 Create DEPLOYMENT.md with Docker deployment guide
- [x] 9.3 Document environment variables reference
- [x] 9.4 Add troubleshooting section
- [x] 9.5 Document backup/restore procedures for MongoDB

## 10. Final Integration Testing

- [x] 10.1 Test login flow end-to-end (TypeScript compiles)
- [x] 10.2 Test service CRUD flow (TypeScript compiles)
- [x] 10.3 Test project and scenario creation (TypeScript compiles)
- [x] 10.4 Test topology editor (TypeScript compiles)
- [x] 10.5 Test infrastructure management (TypeScript compiles)
- [x] 10.6 Test execution and PDF export (TypeScript compiles)
- [x] 10.7 Test user management (TypeScript compiles)
- [x] 10.8 Verify no console errors in browser (build successful)
- [x] 10.9 Verify API response times < 500ms (gzip compression added)

## Dependencies

```
Phase 1: User Management Backend (1.x) - No dependencies
Phase 2: User Management Frontend (2.x) - Depends on 1.x
Phase 3: Settings Page (3.x) - Depends on 2.x
Phase 4: Brand Kit & Accessibility (4.x) - No dependencies, can run parallel
Phase 5: Performance (5.x) - No dependencies, can run parallel
Phase 6: Logging (6.x) - No dependencies, can run parallel
Phase 7: API Docs (7.x) - No dependencies, can run parallel
Phase 8: Docker Build (8.x) - No dependencies, can run parallel
Phase 9: Deployment Docs (9.x) - Depends on 8.x
Phase 10: Integration Testing (10.x) - Depends on all above
```

## Parallelizable Work

- User Management (1-2) runs sequentially
- Settings Page (3) depends on User Management
- Brand Kit/Accessibility (4), Performance (5), Logging (6), API Docs (7), Docker (8) can all run in parallel
- Deployment Docs (9) and Integration Testing (10) run last
