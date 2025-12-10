# scenario-management Specification Delta

## ADDED Requirements

### Requirement: Scenario Model

The system SHALL store scenarios with topology and execution history.

#### Scenario: Scenario schema fields

- **WHEN** a scenario document is created
- **THEN** it contains:
  - `projectId` (reference to parent project)
  - `title` (required)
  - `description` (optional)
  - `topology` object with `yaml`, `nodes[]`, `edges[]`
  - `infrastructureId` (reference to deployment target)
  - `executions[]` (array of execution records)
  - timestamps

#### Scenario: Execution subdocument

- **WHEN** an execution is recorded
- **THEN** it contains:
  - `executedAt`, `executedBy`, `status`
  - `deployedServices[]` with serviceId and dashboardUrl
  - `conclusion` object with text, author, createdAt
  - `maestroSessionId` (optional)

### Requirement: List Scenarios Endpoint

The system SHALL provide an endpoint to list scenarios for a project.

#### Scenario: List project scenarios

- **WHEN** `GET /api/projects/:projectId/scenarios` is called
- **THEN** the system returns scenarios for that project
- **AND** includes latest execution status for each

### Requirement: Create Scenario Endpoint

The system SHALL provide an endpoint to create scenarios.

#### Scenario: Create scenario

- **WHEN** `POST /api/projects/:projectId/scenarios` is called with valid data
- **THEN** the system creates a new scenario linked to the project
- **AND** returns 201 with the created scenario

#### Scenario: Project not found

- **WHEN** the projectId does not exist
- **THEN** the system returns 404 Not Found

### Requirement: Get Scenario Detail Endpoint

The system SHALL provide an endpoint to get a scenario with full topology.

#### Scenario: Get scenario

- **WHEN** `GET /api/scenarios/:id` is called
- **THEN** the system returns the complete scenario document
- **AND** topology includes yaml, nodes, and edges
- **AND** execution history is included

### Requirement: Update Scenario Endpoint

The system SHALL provide an endpoint to update scenarios and topology.

#### Scenario: Update topology

- **WHEN** `PUT /api/scenarios/:id` is called with new topology
- **THEN** the system updates yaml, nodes, and edges
- **AND** returns 200 with the updated scenario

#### Scenario: Validation

- **WHEN** topology YAML is invalid
- **THEN** the system returns 400 with syntax errors

### Requirement: Delete Scenario Endpoint

The system SHALL provide an endpoint to delete scenarios.

#### Scenario: Delete scenario

- **WHEN** `DELETE /api/scenarios/:id` is called
- **THEN** the system removes the scenario document
- **AND** returns 200 with confirmation

### Requirement: Scenario Frontend Pages

The frontend SHALL provide pages for scenario management.

#### Scenario: Scenario list within project

- **WHEN** user views a project detail page
- **THEN** scenarios are listed in a table with:
  - Title, description, infrastructure, status, last execution
- **AND** "Add Scenario" and "Edit" actions are available

#### Scenario: Create/Edit scenario page

- **WHEN** user creates or edits a scenario
- **THEN** the topology editor is displayed (see topology-editor spec)
- **AND** infrastructure selector dropdown is available
- **AND** save button persists changes
