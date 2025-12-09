# infrastructure-management Specification Delta

## ADDED Requirements

### Requirement: Infrastructure Model
The system SHALL store infrastructure configurations with encrypted credentials.

#### Scenario: Infrastructure schema fields
- **WHEN** an infrastructure document is created
- **THEN** it contains:
  - `name` (unique)
  - `type` (enum: kubernetes, docker, virtual)
  - `endpoint` (URL to cluster/host)
  - `credentials` object with `iv`, `encrypted`, `authTag`
  - `capacity` object with `cpu`, `memory`, `storage`
  - `status` (enum: active, inactive, error)
  - `lastHealthCheck` (timestamp)
  - timestamps

### Requirement: Credential Encryption
The system SHALL encrypt infrastructure credentials using AES-256-GCM.

#### Scenario: Encrypt on create
- **WHEN** `POST /api/infrastructures` is called with plaintext credentials
- **THEN** credentials are encrypted before storage
- **AND** only `iv`, `encrypted`, and `authTag` are stored
- **AND** plaintext is never persisted

#### Scenario: Encryption key
- **WHEN** encryption is performed
- **THEN** `ENCRYPTION_KEY` environment variable is used
- **AND** key must be exactly 32 bytes (256 bits)

#### Scenario: Decrypt for use
- **WHEN** scenario execution requires credentials
- **THEN** credentials are decrypted in memory
- **AND** decrypted value is never logged or returned via API

### Requirement: List Infrastructures Endpoint
The system SHALL provide an endpoint to list infrastructures.

#### Scenario: List infrastructures
- **WHEN** `GET /api/infrastructures` is called
- **THEN** the system returns all infrastructures
- **AND** `credentials` field is omitted from response
- **AND** `status` and `lastHealthCheck` are included

### Requirement: Create Infrastructure Endpoint
The system SHALL provide an endpoint to create infrastructures.

#### Scenario: Create infrastructure
- **WHEN** `POST /api/infrastructures` is called with valid data
- **THEN** credentials are encrypted
- **AND** infrastructure is created with `status: inactive`
- **AND** returns 201 with created infrastructure (no credentials)

#### Scenario: Duplicate name
- **WHEN** name already exists
- **THEN** the system returns 409 Conflict

### Requirement: Update Infrastructure Endpoint
The system SHALL provide an endpoint to update infrastructures.

#### Scenario: Update without credentials
- **WHEN** `PUT /api/infrastructures/:id` is called without credentials field
- **THEN** existing credentials are preserved
- **AND** other fields are updated

#### Scenario: Update with new credentials
- **WHEN** `PUT /api/infrastructures/:id` includes credentials
- **THEN** new credentials are encrypted and stored
- **AND** old credentials are replaced

### Requirement: Delete Infrastructure Endpoint
The system SHALL provide an endpoint to delete infrastructures.

#### Scenario: Delete unused infrastructure
- **WHEN** `DELETE /api/infrastructures/:id` is called
- **THEN** infrastructure is removed
- **AND** returns 200 with confirmation

#### Scenario: Delete infrastructure in use
- **WHEN** infrastructure is referenced by scenarios
- **THEN** the system returns 400 with error message
- **AND** infrastructure is not deleted

### Requirement: Test Connection Endpoint
The system SHALL provide an endpoint to test infrastructure connectivity.

#### Scenario: Test successful connection
- **WHEN** `POST /api/infrastructures/:id/test` is called
- **THEN** credentials are decrypted
- **AND** connection to endpoint is attempted
- **AND** on success, returns 200 with success message
- **AND** `status` is updated to `active`
- **AND** `lastHealthCheck` is updated

#### Scenario: Test failed connection
- **WHEN** connection fails
- **THEN** returns 200 with error details
- **AND** `status` is updated to `error`
- **AND** `lastHealthCheck` is updated

### Requirement: Infrastructure Frontend Pages
The frontend SHALL provide pages for managing infrastructures.

#### Scenario: Infrastructure list page
- **WHEN** user navigates to /infrastructure
- **THEN** a table displays all infrastructures with:
  - Name, type, endpoint, status, capacity, last health check
- **AND** "Add Infrastructure" button is visible
- **AND** status is color-coded (green=active, red=error, gray=inactive)

#### Scenario: Create infrastructure page
- **WHEN** user clicks "Add Infrastructure"
- **THEN** a form is displayed with all fields
- **AND** credentials field is a textarea for kubeconfig/token
- **AND** capacity fields are optional numeric inputs

#### Scenario: Test connection button
- **WHEN** user clicks "Test Connection" on an infrastructure
- **THEN** loading indicator is shown
- **AND** success/failure result is displayed
- **AND** status badge updates accordingly
