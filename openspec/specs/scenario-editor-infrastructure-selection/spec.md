# scenario-editor-infrastructure-selection Specification

## Purpose

TBD - created by archiving change enhance-scenario-editor-ux. Update Purpose after archive.

## Requirements

### Requirement: Infrastructure selector in editor toolbar

The topology editor SHALL display an infrastructure selection dropdown in the toolbar, allowing users to select their deployment target as the first step before configuring the topology.

#### Scenario: Infrastructure dropdown visible in editor

The topology editor displays an infrastructure selection dropdown in the toolbar.

- Dropdown is positioned prominently in editor header (top-left or above canvas)
- Label reads "Target Infrastructure" or "Select Infrastructure"
- Dropdown is always visible during editing
- Dropdown is visually distinct from other toolbar elements

#### Scenario: Infrastructure dropdown lists available options

When users click the dropdown, it displays all available infrastructures.

- Dropdown fetches and displays all active infrastructures from the system
- Each infrastructure shows: name, type, status indicator (if active)
- Infrastructure list is sortable or organized consistently
- Option to select "None" is available (for scenarios without deployment target)

#### Scenario: Selected infrastructure persists to scenario

When user selects an infrastructure, it updates the scenario configuration.

- Selection immediately saves to scenario via updateMutation (same as Edit Scenario form)
- Selection is reflected in the dropdown on next page load
- Selection is shared with the Edit Scenario form (same source: scenario.infrastructureId)
- No additional save button required (auto-saves like topology changes)

#### Scenario: Infrastructure selection is required for deployment

Infrastructure selection is enforced as a requirement before deployment.

- Validation error message: "Select a target infrastructure" if missing
- Deploy button is disabled (visual indication) until infrastructure is selected
- Optional: Show warning badge on dropdown if empty

### Requirement: Maintain backward compatibility with Edit Scenario form

The system SHALL maintain full backward compatibility with the Edit Scenario form, ensuring infrastructure selection in both editor and form locations remain synchronized and functional.

#### Scenario: Both forms update the same field

Infrastructure selected in either location (editor dropdown or Edit Scenario form) reflects in both places.

- Changing infrastructure in editor updates scenario.infrastructureId
- Same field is edited by Edit Scenario form
- User can switch between forms without losing selection
- Both forms fetch and display the same value on load

#### Scenario: Edit Scenario form remains optional

Users can still edit scenario details including infrastructure from the separate Edit Details page.

- Edit Details page (ScenarioForm) continues to display infrastructure selector
- Both selectors are optional UI choices (editor dropdown is primary, form is fallback)
- No breaking changes to existing workflow
