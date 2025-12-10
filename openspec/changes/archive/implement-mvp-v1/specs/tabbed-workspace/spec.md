# tabbed-workspace Specification Delta

## ADDED Requirements

### Requirement: Tab State Store

The frontend SHALL manage tab state using Zustand.

#### Scenario: Tab store structure

- **WHEN** tab store is initialized
- **THEN** it contains:
  - `tabs[]` array of open tabs
  - `activeTabId` string or null
  - `openTab(tab)` action
  - `closeTab(tabId)` action
  - `setActiveTab(tabId)` action

#### Scenario: Tab data structure

- **WHEN** a tab is created
- **THEN** it contains:
  - `id` (unique identifier)
  - `title` (display name)
  - `type` ('iframe' | 'component' | 'maestro')
  - `url` (for iframe tabs)
  - `props` (for component tabs)

### Requirement: Tab Bar Component

The frontend SHALL display a tab bar for navigation.

#### Scenario: Tab bar display

- **WHEN** tabs are open
- **THEN** a horizontal tab bar is displayed
- **AND** each tab shows title and close button
- **AND** active tab is visually highlighted

#### Scenario: Tab switching

- **WHEN** user clicks a tab
- **THEN** that tab becomes active
- **AND** tab content is displayed

#### Scenario: Close tab

- **WHEN** user clicks close button on a tab
- **THEN** tab is removed from tabs array
- **AND** if active tab is closed, next tab becomes active
- **AND** if last tab is closed, activeTabId becomes null

### Requirement: Tab Content Container

The frontend SHALL render content for the active tab.

#### Scenario: IFrame tab content

- **WHEN** active tab type is 'iframe'
- **THEN** an iframe is rendered with the tab's URL
- **AND** iframe fills the content area
- **AND** loading indicator shows while iframe loads

#### Scenario: Component tab content

- **WHEN** active tab type is 'component'
- **THEN** the specified React component is rendered
- **AND** tab props are passed to the component

#### Scenario: MAESTRO tab content

- **WHEN** active tab type is 'maestro'
- **THEN** MAESTRO iframe is rendered with scenario context
- **AND** scenario parameters are passed via URL query string

#### Scenario: No active tab

- **WHEN** no tabs are open
- **THEN** a placeholder message is displayed
- **AND** suggests actions like "Execute a scenario to open tabs"

### Requirement: IFrame Tab Component

The frontend SHALL provide a reusable iframe container.

#### Scenario: IFrame loading

- **WHEN** iframe tab is displayed
- **THEN** loading spinner shows until iframe loads
- **AND** onLoad event hides the spinner

#### Scenario: IFrame error

- **WHEN** iframe fails to load (blocked by CSP, etc.)
- **THEN** error message is displayed
- **AND** link to open in new browser tab is provided

#### Scenario: IFrame refresh

- **WHEN** user clicks refresh button on iframe tab
- **THEN** iframe src is reloaded

### Requirement: Tab Integration with Execution

The frontend SHALL open tabs when scenarios are executed.

#### Scenario: Open MAESTRO tab on execute

- **WHEN** user clicks "Execute" on a scenario
- **THEN** MAESTRO tab opens with scenario context
- **AND** tab becomes active

#### Scenario: Open service dashboard tabs

- **WHEN** execution completes and dashboards are available
- **THEN** a tab is opened for each service with dashboardUrl
- **AND** tabs are added but not automatically activated

### Requirement: Tab Workspace Layout

The frontend SHALL integrate tab workspace into the main layout.

#### Scenario: Workspace area

- **WHEN** any tabs are open
- **THEN** tab workspace is visible below the main content
- **AND** workspace can be collapsed/expanded

#### Scenario: Workspace sizing

- **WHEN** workspace is expanded
- **THEN** it takes 50% of the viewport height
- **AND** main content area is resized accordingly
- **AND** divider can be dragged to resize
