# project-foundation Specification Delta

## ADDED Requirements

### Requirement: Static Client Serving

The server module SHALL support serving the client's production build (`dist/`) directly when configured via the `SERVE_STATIC` environment variable.

#### Scenario: Static serving enabled

- **WHEN** the server starts with `SERVE_STATIC=true`
- **AND** the client `dist/` directory exists
- **THEN** the server serves static files from the client build
- **AND** API endpoints remain accessible at `/api/*`

#### Scenario: SPA fallback routing

- **WHEN** a request is made to a path that does not match an API route or static file
- **AND** static serving is enabled
- **THEN** the server returns `index.html` for client-side routing
- **AND** the client application handles the route

#### Scenario: Static serving disabled

- **WHEN** the server starts with `SERVE_STATIC=false` or unset
- **THEN** the server operates in API-only mode
- **AND** no static files are served
- **AND** development uses Vite dev server with proxy

#### Scenario: Missing dist directory

- **WHEN** static serving is enabled but `dist/` does not exist
- **THEN** the server logs a warning message
- **AND** continues in API-only mode

### Requirement: Unified Deployment Option

The system SHALL provide a unified deployment configuration where a single container serves both the API and client application.

#### Scenario: Unified Docker build

- **WHEN** the unified Dockerfile is built
- **THEN** it builds the client application
- **AND** copies the client dist into the server image
- **AND** enables static serving by default

#### Scenario: Simplified deployment

- **WHEN** using the unified docker-compose configuration
- **THEN** only two containers are required (server + MongoDB)
- **AND** the server exposes port 3000 for both API and static content
