# Capability: Project Foundation

## ADDED Requirements

### Requirement: Monorepo Structure
The system SHALL provide a monorepo structure with separate `/client` and `/server` directories for frontend and backend code.

#### Scenario: Directory structure exists
- **WHEN** the repository is cloned
- **THEN** it contains `/client` directory for React frontend
- **AND** it contains `/server` directory for Express backend
- **AND** each directory has its own `package.json`

#### Scenario: TypeScript configured
- **WHEN** TypeScript files are compiled
- **THEN** strict mode is enabled for both client and server
- **AND** path aliases are configured (`@/` for src)

### Requirement: Bun Runtime
The system SHALL use Bun as the JavaScript runtime and package manager.

#### Scenario: Package installation
- **WHEN** dependencies are installed with `bun install`
- **THEN** all packages are installed correctly
- **AND** `bun.lockb` file is created

#### Scenario: Server execution
- **WHEN** the backend server is started with `bun run dev`
- **THEN** the Express server starts on the configured port

### Requirement: Docker Development Environment
The system SHALL provide Docker Compose configuration for local development.

#### Scenario: Services start successfully
- **WHEN** `docker-compose up` is executed
- **THEN** MongoDB 7.x container starts
- **AND** MongoDB is accessible on port 27017
- **AND** data persists in a named volume

#### Scenario: Health checks pass
- **WHEN** Docker services are running
- **THEN** MongoDB health check reports healthy status

### Requirement: Environment Configuration
The system SHALL support environment-based configuration via `.env` files.

#### Scenario: Environment variables loaded
- **WHEN** the server starts
- **THEN** it reads configuration from environment variables
- **AND** uses `.env` file values in development

#### Scenario: Example file provided
- **WHEN** a new developer sets up the project
- **THEN** `.env.example` files document all required variables
- **AND** include comments explaining each variable

### Requirement: Code Quality Tooling
The system SHALL enforce code quality through ESLint and Prettier.

#### Scenario: Linting passes
- **WHEN** `bun run lint` is executed
- **THEN** ESLint checks all TypeScript files
- **AND** reports any rule violations

#### Scenario: Formatting consistent
- **WHEN** `bun run format` is executed
- **THEN** Prettier formats all source files
- **AND** uses consistent rules across client and server
