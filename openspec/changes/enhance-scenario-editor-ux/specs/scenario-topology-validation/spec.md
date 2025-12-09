# Spec: Scenario Topology Validation

## Overview

Ensure scenario topologies are valid before deployment by providing validation checks and user feedback.

## ADDED Requirements

### Requirement: Validate topology configuration

The system SHALL provide topology validation to ensure configurations meet deployment requirements, with explicit validation button and automatic pre-deployment checks.

#### Scenario: Validate button available in editor

The topology editor displays a "Validate" button in the toolbar alongside the Deploy button.

- Button is always visible and enabled
- Button has a tooltip: "Validate the configuration"
- Button styling is consistent with other action buttons
- Button is positioned logically near the Deploy button

#### Scenario: Validation checks required conditions

When users click Validate, the system checks for minimum valid configuration:

1. **Target Infrastructure Selected** - At least one infrastructure must be selected in the infrastructure dropdown
2. **At Least One Service Node** - The topology must contain at least one service node (not empty canvas)

- Validation completes immediately (synchronous)
- Validation engine is extensible for future rules without UI changes

#### Scenario: Valid configuration shows success feedback

When topology passes validation, user receives positive feedback.

- Toast notification appears: "Configuration is valid" (or similar success message)
- Toast uses success styling (green color, checkmark icon if applicable)
- Toast auto-dismisses after 3-4 seconds
- User can continue to Deploy

#### Scenario: Invalid configuration shows specific errors

When topology fails validation, user receives detailed error feedback.

- Toast notification appears with first validation error
- Error message is specific: "Select a target infrastructure" or "Add at least one service to the topology"
- Toast uses error styling (red color, error icon if applicable)
- User cannot proceed to Deploy until errors are resolved
- Optional: Show all errors in a collapsible details section

#### Scenario: Deployment validates before starting

When users click Deploy, validation runs automatically before initiating deployment.

- If validation passes: Proceed immediately to ExecutionPanel/deployment flow
- If validation fails: Show validation error toast and prevent deployment
- No additional user action needed to trigger pre-deployment validation

## MODIFIED Requirements

None - validation is a new capability.

## REMOVED Requirements

None - backward compatible addition.

## Validation Rule Extensibility

Validation engine should be designed as pluggable rules system to allow future additions such as:

- Service version compatibility checks
- Required service presence (e.g., must include monitoring service)
- Topology naming conventions
- Connection best practices

## Related Capabilities

- `scenario-editor-guidelines` - Guidelines step 4 references validation
- `scenario-deployment-terminology` - Deploy button triggers pre-validation
- `scenario-editor-infrastructure-selection` - Infrastructure selection is first validation rule
