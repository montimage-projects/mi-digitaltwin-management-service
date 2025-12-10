# execution-system Specification Delta

## ADDED Requirements

### Requirement: Execute Scenario Endpoint

The system SHALL provide an endpoint to trigger scenario execution.

#### Scenario: Execute scenario

- **WHEN** `POST /api/scenarios/:id/execute` is called
- **THEN** a new execution record is created with status 'pending'
- **AND** MAESTRO URL is constructed with scenario parameters
- **AND** returns 200 with execution record and maestroUrl

#### Scenario: Infrastructure required

- **WHEN** scenario has no infrastructureId assigned
- **THEN** the system returns 400 with error message

#### Scenario: MAESTRO URL construction

- **WHEN** execution is triggered
- **THEN** URL includes:
  - Base URL from environment `MAESTRO_BASE_URL`
  - Scenario ID as query parameter
  - Topology YAML (base64 encoded or reference)
  - Infrastructure endpoint

### Requirement: Execution Status Tracking

The system SHALL track execution status through its lifecycle.

#### Scenario: Status transitions

- **WHEN** execution is created
- **THEN** status is 'pending'
- **AND** status can transition to 'running', 'completed', or 'failed'

#### Scenario: Update execution status

- **WHEN** MAESTRO reports deployment progress (future webhook)
- **THEN** status is updated accordingly
- **AND** deployedServices are populated with dashboard URLs

### Requirement: Add Conclusion Endpoint

The system SHALL provide an endpoint to add conclusions to executions.

#### Scenario: Add conclusion

- **WHEN** `POST /api/scenarios/:id/executions/:executionId/conclusion` is called
- **THEN** conclusion is stored with text, author, createdAt
- **AND** returns 200 with updated execution

#### Scenario: Execution not found

- **WHEN** executionId does not exist
- **THEN** the system returns 404 Not Found

#### Scenario: Update conclusion

- **WHEN** conclusion already exists and endpoint is called again
- **THEN** conclusion is updated with new values

### Requirement: Execution History Component

The frontend SHALL display execution history for scenarios.

#### Scenario: Execution list

- **WHEN** scenario detail is viewed
- **THEN** execution history is displayed as a list
- **AND** each entry shows: date, user, status, actions

#### Scenario: Status indicators

- **WHEN** execution list is rendered
- **THEN** status is color-coded:
  - pending: gray
  - running: blue
  - completed: green
  - failed: red

#### Scenario: Execution detail

- **WHEN** user clicks an execution entry
- **THEN** detail panel expands showing:
  - Deployed services with dashboard links
  - Conclusion (if added)
  - Export PDF button

### Requirement: Conclusion Editor Component

The frontend SHALL provide a rich text editor for conclusions.

#### Scenario: Conclusion form

- **WHEN** user clicks "Add Conclusion" on an execution
- **THEN** a text area is displayed for entering conclusion
- **AND** author is auto-filled from current user
- **AND** save button persists the conclusion

#### Scenario: Edit existing conclusion

- **WHEN** conclusion already exists
- **THEN** text area is pre-filled with existing text
- **AND** user can update and save

### Requirement: MAESTRO Integration

The system SHALL integrate with MAESTRO for deployment.

#### Scenario: MAESTRO tab

- **WHEN** execution is triggered
- **THEN** MAESTRO opens in a tab within the application
- **AND** user can interact with MAESTRO to configure deployment

#### Scenario: MAESTRO base URL configuration

- **WHEN** system is configured
- **THEN** `MAESTRO_BASE_URL` environment variable defines the base URL
- **AND** default is `https://maestro.intact-project.eu`

### Requirement: Service Dashboard Access

The frontend SHALL provide access to deployed service dashboards.

#### Scenario: Dashboard links

- **WHEN** execution has deployed services with dashboardUrls
- **THEN** each service shows "Open Dashboard" button
- **AND** clicking opens dashboard in a new tab (in tab workspace)

#### Scenario: No dashboard available

- **WHEN** service has no dashboardUrl
- **THEN** "No dashboard available" message is shown
- **AND** no button is displayed
