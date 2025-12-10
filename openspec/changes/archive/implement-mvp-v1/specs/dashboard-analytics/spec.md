# dashboard-analytics Specification Delta

## ADDED Requirements

### Requirement: Dashboard Overview Cards

The dashboard SHALL display summary statistics.

#### Scenario: Overview cards

- **WHEN** dashboard page is rendered
- **THEN** overview cards display:
  - Total services count
  - Total projects count
  - Total scenarios count
  - Recent executions (last 7 days)

#### Scenario: Card data loading

- **WHEN** dashboard loads
- **THEN** cards show loading skeletons
- **AND** data is fetched from `/api/dashboard/stats`
- **AND** cards update when data arrives

### Requirement: Recent Activity Component

The dashboard SHALL display recent platform activity.

#### Scenario: Activity feed

- **WHEN** dashboard page is rendered
- **THEN** recent activity section shows:
  - Last 10 scenario executions with status
  - Recently updated services (last 7 days)
  - Recently created projects (last 7 days)

#### Scenario: Activity item format

- **WHEN** activity items are displayed
- **THEN** each item shows:
  - Icon indicating type (execution, service, project)
  - Description text
  - Relative timestamp ("2 hours ago")
  - Link to related entity

### Requirement: Quick Actions Component

The dashboard SHALL provide shortcuts to common tasks.

#### Scenario: Quick action buttons

- **WHEN** dashboard page is rendered
- **THEN** quick actions section shows:
  - "Create Project" button
  - "Add Service" button
  - "View Analytics" button

#### Scenario: Action navigation

- **WHEN** user clicks a quick action
- **THEN** navigation occurs to the relevant page/form

### Requirement: Dashboard Stats Endpoint

The backend SHALL provide an endpoint for dashboard statistics.

#### Scenario: Get dashboard stats

- **WHEN** `GET /api/dashboard/stats` is called
- **THEN** response includes:
  - `servicesCount`: total services
  - `projectsCount`: total projects
  - `scenariosCount`: total scenarios
  - `recentExecutionsCount`: executions in last 7 days
  - `recentActivity`: last 10 activity items

### Requirement: Analytics Scenario History Endpoint

The backend SHALL provide an endpoint for execution history.

#### Scenario: Get scenario history

- **WHEN** `GET /api/analytics/scenarios` is called
- **THEN** response includes paginated execution history
- **AND** each entry has scenario title, project, date, status, user

#### Scenario: Filter by project

- **WHEN** `GET /api/analytics/scenarios?projectId=<id>` is called
- **THEN** only executions for that project are returned

#### Scenario: Filter by status

- **WHEN** `GET /api/analytics/scenarios?status=completed` is called
- **THEN** only executions with matching status are returned

#### Scenario: Date range filter

- **WHEN** `GET /api/analytics/scenarios?from=<date>&to=<date>` is called
- **THEN** only executions within the date range are returned

### Requirement: Analytics Statistics Endpoint

The backend SHALL provide aggregated execution statistics.

#### Scenario: Get execution stats

- **WHEN** `GET /api/analytics/scenarios/stats` is called
- **THEN** response includes:
  - `totalExecutions`: all-time count
  - `successRate`: percentage of completed vs total
  - `byProject`: counts grouped by project
  - `bySector`: counts grouped by sector
  - `byMonth`: counts for last 12 months

### Requirement: Analytics Page

The frontend SHALL provide an analytics page with execution history.

#### Scenario: Execution history table

- **WHEN** user navigates to /analytics
- **THEN** a table displays execution history with:
  - Scenario title, project, executed by, date, status
- **AND** table is sortable by any column
- **AND** pagination is available

#### Scenario: Analytics filters

- **WHEN** analytics page is rendered
- **THEN** filters are available:
  - Project dropdown
  - Status dropdown (all, pending, running, completed, failed)
  - Date range picker

#### Scenario: Statistics summary

- **WHEN** analytics page is rendered
- **THEN** summary section shows:
  - Total executions
  - Success rate percentage
  - Executions this month vs last month
