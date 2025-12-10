# Proposal: Serve Static Client Bundle from Server

## Summary

Update the server module to serve the client's production build (`dist/`) directly via Express static file middleware. This enables a simpler single-process deployment model while retaining the separate nginx-based architecture for high-traffic production scenarios.

## Motivation

Currently, the production deployment requires:

1. A separate nginx container to serve static files
2. nginx proxying API requests to the Express server
3. Two containers running for the full application

For simpler deployments (local production builds, demos, single-server hosting), having the Express server directly serve the client bundle reduces operational complexity:

- Single process to start/stop/monitor
- No nginx configuration required
- Simplified CI/CD and Docker setup
- Easier local production testing

## Approach

1. **Add static file serving to Express** - Serve files from `../client/dist` when in production mode
2. **SPA fallback routing** - Return `index.html` for any non-API, non-static route
3. **Conditional enablement** - Only enable when `SERVE_STATIC=true` or when `dist/` exists in production
4. **Maintain existing architecture** - The nginx-based Docker Compose setup remains available for scaled deployments

## Scope

### In Scope

- Express middleware configuration for static file serving
- SPA fallback route handler for client-side routing
- Environment variable to control static serving behavior
- Documentation updates

### Out of Scope

- Modifying the nginx-based Docker production setup
- Changes to Vite build configuration
- Automatic client build triggers from server

## Risks and Mitigations

| Risk                                              | Mitigation                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Confusion about which deployment model to use     | Document both approaches clearly with use-case guidance           |
| Express static serving less performant than nginx | Keep nginx-based setup as recommended for high-traffic production |
| Incorrect static file paths                       | Use robust path resolution relative to server root                |

## Success Criteria

- [ ] Server serves client build when configured
- [ ] All client routes work correctly (SPA fallback)
- [ ] API endpoints remain accessible at `/api/*`
- [ ] Development workflow unchanged (Vite dev server + Express)
- [ ] Documentation covers both deployment approaches
