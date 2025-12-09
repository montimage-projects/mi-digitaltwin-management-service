# Spec: Scenario Deployment Terminology

## Overview

Replace "Execute" terminology with "Deploy" throughout the scenario management interface for consistency and clarity about deployment intent.

## ADDED Requirements

### Requirement: Deploy button in scenario actions

The system SHALL replace all "Execute" terminology with "Deploy" throughout the scenario management interface for consistency and clarity about deployment intent.

#### Scenario: ScenarioDetail header shows Deploy button

The scenario detail page displays a "Deploy" button in the header.

- Button label reads: "Deploy"
- Button icon: Play icon (consistent with action intent)
- Button tooltip reads: "Deploy scenario to target infrastructure"
- Button is disabled if no infrastructure is selected
- Button triggers existing deployment flow (ExecutionPanel)

#### Scenario: ScenarioTable menu shows Deploy option

The scenarios table row actions menu displays "Deploy" option.

- Dropdown menu item labeled: "Deploy"
- Menu item icon: Play icon
- Tooltip reads: "Deploy scenario"
- Menu item is disabled if scenario has no infrastructure selected
- Clicking menu item navigates to scenario detail with deployment flow initiated

#### Scenario: URL query parameters use deploy terminology

Navigation URLs and query parameters reflect Deploy terminology.

- Deploy button triggers: `?deploy=true` (instead of `?execute=true`)
- Query parameter is interpreted to show ExecutionPanel on load
- Backward compatibility: Support legacy `?execute=true` parameter and redirect to `?deploy=true`

#### Scenario: Toast messages use Deploy terminology

User-facing confirmation and error messages use "Deploy" terminology.

- Success: "Deployment started successfully"
- Error: "Deployment failed: [error details]"
- Loading: "Starting deployment..."
- All deployment-related toasts use consistent terminology

## Backward Compatibility

### URL Query Parameter Handling

- Legacy `?execute=true` URLs continue to work
- `?execute=true` is internally treated as `?deploy=true`
- No user-facing breaking changes

### REST API

- Backend API routes and parameters unchanged
- Terminology change is frontend-only
- Backend continues to process deployment requests identically

## Related Capabilities

- `scenario-topology-validation` - Deploy button triggers validation
- `scenario-editor-guidelines` - Guidelines step 5 references Deploy
