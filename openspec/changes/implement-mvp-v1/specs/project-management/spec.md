# project-management Specification Delta

## ADDED Requirements

### Requirement: Project Model
The system SHALL store Digital Twin projects with comprehensive metadata.

#### Scenario: Project schema fields
- **WHEN** a project document is created
- **THEN** it contains:
  - `shortName` (unique, uppercase)
  - `title` (required)
  - `sector` (enum: Telecommunications, Healthcare, Transportation, Nuclear, Cross-Sector)
  - `leader` (organization abbreviation)
  - `involvedPartners[]` (array of partner abbreviations)
  - `description` (optional)
  - `isComposite` (boolean for cross-sector DTs)
  - `atomicProjectIds[]` (references to composed projects)
  - timestamps

#### Scenario: Indexes configured
- **WHEN** the Project model is initialized
- **THEN** indexes exist on `shortName` (unique), `sector`, `leader`

### Requirement: List Projects Endpoint
The system SHALL provide an endpoint to list all projects.

#### Scenario: Basic listing
- **WHEN** `GET /api/projects` is called
- **THEN** the system returns an array of all projects
- **AND** includes scenario count for each project

#### Scenario: Filter by sector
- **WHEN** `GET /api/projects?sector=Healthcare` is called
- **THEN** only projects with matching sector are returned

### Requirement: Create Project Endpoint
The system SHALL provide an endpoint to create projects.

#### Scenario: Create atomic project
- **WHEN** `POST /api/projects` is called with valid project data
- **THEN** the system creates a new project document
- **AND** returns 201 with the created project

#### Scenario: Create composite project
- **WHEN** `POST /api/projects` is called with `isComposite: true` and `atomicProjectIds`
- **THEN** the system validates referenced projects exist
- **AND** creates the composite project

#### Scenario: Duplicate shortName
- **WHEN** `POST /api/projects` is called with an existing shortName
- **THEN** the system returns 409 Conflict

### Requirement: Get Project Detail Endpoint
The system SHALL provide an endpoint to get a project with its scenarios.

#### Scenario: Get project with scenarios
- **WHEN** `GET /api/projects/:id` is called
- **THEN** the system returns the project document
- **AND** populates scenarios array with title, status, last execution

### Requirement: Update Project Endpoint
The system SHALL provide an endpoint to update projects.

#### Scenario: Update project
- **WHEN** `PUT /api/projects/:id` is called with valid updates
- **THEN** the system updates the project document
- **AND** returns 200 with the updated project

### Requirement: Delete Project Endpoint
The system SHALL provide an endpoint to delete projects.

#### Scenario: Delete project without scenarios
- **WHEN** `DELETE /api/projects/:id` is called for a project with no scenarios
- **THEN** the system removes the project document
- **AND** returns 200 with confirmation

#### Scenario: Delete project with scenarios
- **WHEN** `DELETE /api/projects/:id` is called for a project with scenarios
- **THEN** the system returns 400 with error message
- **AND** project is not deleted

### Requirement: Project Frontend Pages
The frontend SHALL provide pages for managing projects.

#### Scenario: Projects list page
- **WHEN** user navigates to /projects
- **THEN** a table displays all projects with:
  - Short name, title, sector, leader, partners, scenario count, last update
- **AND** "Add Project" button is visible

#### Scenario: Create project page
- **WHEN** user clicks "Add Project"
- **THEN** a form is displayed with all project fields
- **AND** partner selection uses multi-select from consortium list

#### Scenario: Project detail page
- **WHEN** user clicks on a project row
- **THEN** project details are displayed
- **AND** scenario list is shown with "Add Scenario" button
