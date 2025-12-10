# service-crud Specification Delta

## ADDED Requirements

### Requirement: Create Service Endpoint

The system SHALL provide an endpoint to create new services.

#### Scenario: Create service with valid data

- **WHEN** `POST /api/services` is called with valid service data
- **THEN** the system creates a new service document
- **AND** returns 201 with the created service
- **AND** `shortName` is converted to uppercase

#### Scenario: Validation failure

- **WHEN** `POST /api/services` is called with invalid data
- **THEN** the system returns 400 with validation errors
- **AND** no service is created

#### Scenario: Duplicate shortName

- **WHEN** `POST /api/services` is called with an existing shortName
- **THEN** the system returns 409 Conflict

### Requirement: Update Service Endpoint

The system SHALL provide an endpoint to update existing services.

#### Scenario: Update service

- **WHEN** `PUT /api/services/:id` is called with valid updates
- **THEN** the system updates the service document
- **AND** returns 200 with the updated service
- **AND** `updatedAt` timestamp is refreshed

#### Scenario: Service not found

- **WHEN** `PUT /api/services/:id` is called with invalid ID
- **THEN** the system returns 404 Not Found

### Requirement: Delete Service Endpoint

The system SHALL provide an endpoint to delete services.

#### Scenario: Delete service

- **WHEN** `DELETE /api/services/:id` is called
- **THEN** the system removes the service document
- **AND** returns 200 with confirmation

#### Scenario: Service not found

- **WHEN** `DELETE /api/services/:id` is called with invalid ID
- **THEN** the system returns 404 Not Found

### Requirement: Add Version Endpoint

The system SHALL provide an endpoint to add new versions to a service.

#### Scenario: Add version

- **WHEN** `POST /api/services/:id/versions` is called with version data
- **THEN** the system adds the version to the versions array
- **AND** updates `currentVersion` to the new version
- **AND** returns 200 with the updated service

#### Scenario: Duplicate version

- **WHEN** a version with the same number already exists
- **THEN** the system returns 409 Conflict

### Requirement: Service Form Component

The frontend SHALL provide a form for creating and editing services.

#### Scenario: Form fields

- **WHEN** the service form is rendered
- **THEN** it displays fields for all D2.1 metadata:
  - shortName, title, provider (required)
  - categoryId (dropdown), type (dropdown)
  - description, license
  - TRL current/expected (1-9 sliders)
  - standards (tag input)
  - inputs/outputs (dynamic list)
  - interactsWith, potentialUseCases (tag inputs)
  - repositoryTable (radio buttons)

#### Scenario: Form validation

- **WHEN** form is submitted with missing required fields
- **THEN** validation errors are displayed inline
- **AND** form submission is prevented

### Requirement: Version Management UI

The frontend SHALL provide UI for managing service versions.

#### Scenario: View versions

- **WHEN** a service is viewed in the detail drawer
- **THEN** version history is displayed with version, date, notes

#### Scenario: Add version

- **WHEN** "Add Version" button is clicked in the drawer
- **THEN** a modal appears with version, dockerImage, releaseNotes fields
- **AND** submitting adds the new version
