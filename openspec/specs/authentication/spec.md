# authentication Specification

## Purpose

TBD - created by archiving change implement-sprint0-poc. Update Purpose after archive.

## Requirements

### Requirement: User Model

The system SHALL store user accounts with secure password hashing.

#### Scenario: User schema fields

- **WHEN** a user document is created
- **THEN** it contains `username` (unique), `passwordHash`, `role`, and timestamps
- **AND** the password is hashed using bcrypt with cost factor 12

#### Scenario: Password comparison

- **WHEN** a login attempt provides credentials
- **THEN** the system compares the provided password against the stored hash
- **AND** uses bcrypt's constant-time comparison

### Requirement: JWT Token Generation

The system SHALL generate JWT tokens for authenticated sessions.

#### Scenario: Successful login

- **WHEN** valid credentials are provided to `POST /api/auth/login`
- **THEN** the system returns a JWT token with 24-hour expiration
- **AND** the token contains `userId` and `role` claims
- **AND** the response includes user info without password

#### Scenario: Invalid credentials

- **WHEN** invalid username or password is provided
- **THEN** the system returns 401 Unauthorized
- **AND** does not reveal which credential was incorrect

### Requirement: Authentication Middleware

The system SHALL protect routes requiring authentication.

#### Scenario: Valid token accepted

- **WHEN** a request includes `Authorization: Bearer <valid-token>`
- **THEN** the middleware decodes the token
- **AND** attaches user info to the request
- **AND** allows the request to proceed

#### Scenario: Missing token rejected

- **WHEN** a protected route is accessed without a token
- **THEN** the system returns 401 Unauthorized

#### Scenario: Expired token rejected

- **WHEN** a request includes an expired token
- **THEN** the system returns 401 Unauthorized
- **AND** includes message indicating token expiration

### Requirement: Current User Endpoint

The system SHALL provide an endpoint to retrieve the current user's information.

#### Scenario: Get current user

- **WHEN** `GET /api/auth/me` is called with a valid token
- **THEN** the system returns the user's `id`, `username`, and `role`
- **AND** does not include the password hash

### Requirement: Admin User Seed

The system SHALL provide a seed script to create the initial admin user.

#### Scenario: First-time setup

- **WHEN** the seed script runs on an empty database
- **THEN** an admin user is created with configured credentials
- **AND** default credentials are `admin` / `intact2025`

#### Scenario: Idempotent execution

- **WHEN** the seed script runs with existing admin user
- **THEN** no duplicate user is created
- **AND** no error is thrown

### Requirement: Input Validation

The system SHALL validate all authentication requests using Zod schemas.

#### Scenario: Valid login request

- **WHEN** login request contains `username` and `password` strings
- **THEN** validation passes
- **AND** request proceeds to authentication

#### Scenario: Invalid login request

- **WHEN** login request is missing required fields
- **THEN** the system returns 400 Bad Request
- **AND** includes specific validation error messages
