# Tasks: Serve Static Client Bundle from Server

## Implementation Tasks

- [x] **1. Add SERVE_STATIC environment variable**
  - File: `server/src/config/env.ts`
  - Add `SERVE_STATIC` boolean with default `false`
  - Validate with Zod schema

- [x] **2. Create static serving middleware**
  - File: `server/src/middleware/staticServe.ts` (new)
  - Configure `express.static()` for `../client/dist`
  - Add cache control headers for different asset types
  - Include existence check for dist directory

- [x] **3. Create SPA fallback handler**
  - File: `server/src/middleware/staticServe.ts`
  - Serve `index.html` for non-API, non-static routes
  - Handle missing index.html gracefully

- [x] **4. Integrate static middleware into app.ts**
  - File: `server/src/app.ts`
  - Add static middleware after API routes
  - Add SPA fallback before 404 handler
  - Only enable when `SERVE_STATIC=true`

- [x] **5. Update server Dockerfile for unified build**
  - File: `server/Dockerfile.unified` (new)
  - Add multi-stage step to build client
  - Copy client dist into server image
  - Set `SERVE_STATIC=true` by default

- [x] **6. Add unified docker-compose configuration**
  - File: `docker-compose.unified.yml` (new)
  - Single server container serving both API and static files
  - MongoDB service
  - Simplified environment configuration

- [x] **7. Update server README with static serving docs**
  - File: `server/README.md`
  - Document `SERVE_STATIC` environment variable
  - Explain deployment options (unified vs nginx-based)

- [x] **8. Update deployment playbook**
  - File: `docs/playbooks/deployment.md`
  - Add section for unified deployment option
  - Compare with nginx-based deployment

## Verification

- [x] **9. Manual testing**
  - Build client: `cd client && bun run build`
  - Start server with `SERVE_STATIC=true`
  - Verify: homepage loads, navigation works, API calls succeed
  - Verify: direct URL access to client routes works (SPA fallback)

## Dependencies

- Tasks 1-3 are independent and can be done in parallel
- Task 4 depends on tasks 1-3
- Task 5 depends on task 4
- Tasks 6-8 depend on task 4
- Task 9 depends on all previous tasks
