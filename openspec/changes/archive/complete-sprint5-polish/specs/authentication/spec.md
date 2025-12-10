## ADDED Requirements

### Requirement: User Management API

The system SHALL provide administrative endpoints for managing user accounts.

#### Scenario: List users

- **WHEN** `GET /api/users` is called with admin authentication
- **THEN** the system returns a list of all users
- **AND** password hashes are never included in the response
- **AND** each user includes `_id`, `username`, `role`, `createdAt`, `updatedAt`

#### Scenario: Create user

- **WHEN** `POST /api/users` is called with valid user data
- **THEN** the system creates a new user with hashed password
- **AND** returns the created user without password hash
- **AND** enforces unique username constraint

#### Scenario: Delete user

- **WHEN** `DELETE /api/users/:id` is called
- **THEN** the system removes the user from the database
- **AND** prevents deletion if the user is deleting themselves
- **AND** returns 400 Bad Request for self-deletion attempts

#### Scenario: Reset user password

- **WHEN** `PATCH /api/users/:id/password` is called with a new password
- **THEN** the system hashes and updates the password
- **AND** returns success without revealing the password
