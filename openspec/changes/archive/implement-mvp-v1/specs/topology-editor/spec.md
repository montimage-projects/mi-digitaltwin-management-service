# topology-editor Specification Delta

## ADDED Requirements

### Requirement: Split-Screen Layout
The topology editor SHALL display code and visual editors side-by-side.

#### Scenario: Split-screen view
- **WHEN** the topology editor is rendered
- **THEN** a split-screen layout is displayed
- **AND** left panel contains Monaco code editor
- **AND** right panel contains React Flow canvas
- **AND** panels are resizable via drag handle

#### Scenario: Full-screen toggle
- **WHEN** user double-clicks a panel header
- **THEN** that panel expands to full width
- **AND** double-click again restores split view

### Requirement: Monaco Code Editor Panel
The editor SHALL provide a YAML code editing experience.

#### Scenario: YAML syntax highlighting
- **WHEN** YAML content is displayed in Monaco
- **THEN** syntax highlighting is applied
- **AND** indentation guides are visible

#### Scenario: YAML validation
- **WHEN** YAML has syntax errors
- **THEN** red underlines appear on error lines
- **AND** error markers are shown in the gutter

#### Scenario: Auto-completion
- **WHEN** user types a service reference
- **THEN** auto-complete suggests available service shortNames
- **AND** selecting inserts the full service configuration template

### Requirement: React Flow Visual Canvas
The editor SHALL provide a visual node-based topology view.

#### Scenario: Service nodes
- **WHEN** the canvas is rendered
- **THEN** each service in topology appears as a draggable node
- **AND** nodes display service shortName and icon
- **AND** nodes have input/output handles for connections

#### Scenario: Connection edges
- **WHEN** services are connected
- **THEN** edges appear between nodes
- **AND** edges display connection labels (topic, protocol)
- **AND** edges can be selected and deleted

#### Scenario: Canvas controls
- **WHEN** canvas is displayed
- **THEN** pan/zoom controls are available
- **AND** fit-to-view button centers all nodes
- **AND** minimap shows overview of large topologies

### Requirement: Bidirectional Sync
Changes in either editor SHALL synchronize to the other.

#### Scenario: Code to canvas sync
- **WHEN** user edits YAML in code editor
- **THEN** after debounce delay (500ms)
- **AND** if YAML is valid
- **THEN** canvas updates to reflect changes

#### Scenario: Canvas to code sync
- **WHEN** user drags nodes or creates connections on canvas
- **THEN** YAML code updates immediately
- **AND** cursor position is preserved

#### Scenario: Sync conflict handling
- **WHEN** YAML has syntax errors during canvas edit
- **THEN** a warning indicator appears
- **AND** canvas changes are applied locally
- **AND** code shows validation error

### Requirement: Service Selector Palette
The editor SHALL provide a service picker for adding to topology.

#### Scenario: Service palette
- **WHEN** topology editor is displayed
- **THEN** a collapsible service palette is available
- **AND** services are grouped by category
- **AND** search input filters services

#### Scenario: Add service to topology
- **WHEN** user drags a service from palette to canvas
- **THEN** a new node is created at drop position
- **AND** YAML is updated with new service entry
- **AND** service is added with default configuration

#### Scenario: Version selection
- **WHEN** adding or editing a service node
- **THEN** version dropdown shows available versions
- **AND** "latest" is the default selection

### Requirement: Topology Validation
The editor SHALL validate topology before saving.

#### Scenario: Validate button
- **WHEN** user clicks "Validate" button
- **THEN** validation checks run:
  - YAML syntax valid
  - All referenced services exist
  - All referenced versions available
  - Connection endpoints valid
- **AND** results are displayed with pass/fail for each check

#### Scenario: Validation errors
- **WHEN** validation fails
- **THEN** errors are highlighted in both code and canvas
- **AND** error messages indicate the issue and location
