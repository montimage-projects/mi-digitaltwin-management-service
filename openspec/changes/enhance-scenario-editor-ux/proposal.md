# Proposal: Enhance Scenario Editor UX

## Status

**Draft** - awaiting clarification and approval

## Why

Current scenario editor workflow lacks essential guidance and validation, leading to user confusion and failed deployments:

- Users don't have in-editor help for building topologies (no guideline support)
- Target infrastructure selection is buried in a separate form, not adjacent to topology design
- No validation step prevents users from attempting deployment with invalid topologies (no services, no target)
- "Execute" terminology is vague and doesn't clearly communicate deployment intent

This proposal streamlines the scenario configuration workflow by co-locating infrastructure selection with topology design, providing step-by-step guidance, validating configurations before deployment, and using clearer terminology.

## Overview

Improve the Scenario editor user experience by streamlining the topology configuration workflow with:

1. **Helper Guidelines** - Step-by-step guidance modal for scenario editors
2. **Target-First Workflow** - Select target infrastructure before configuring topology
3. **Topology Validation** - Validate configuration with explicit button and pre-deployment checks
4. **Terminology Update** - Replace "Execute" with "Deploy" for clarity

## Problem Statement

Current scenario editor workflow lacks:

- **No guideline support** - Users don't have in-editor help for building topologies
- **Infrastructure selection unclear** - Target infrastructure is selected in a separate form, not adjacent to topology design
- **No validation step** - Users can attempt deployment with invalid topologies (no services, no target)
- **Confusing terminology** - "Execute" button isn't clearly associated with deployment intent

## Proposed Solution

### 1. Helper Guidelines Modal

- **Trigger**: Help button (?) in topology editor header
- **Content**: Step-by-step instructions for building a valid scenario topology:
  1. Select target infrastructure from dropdown
  2. Add services to the topology canvas
  3. Connect services with edges (data flows)
  4. Validate the configuration
  5. Deploy to the target
- **UX**: Modal with collapsible sections, optional "Don't show again" checkbox

### 2. Target-First UI in Editor

- **Change**: Move infrastructure selection from scenario details form to topology editor toolbar
- **Placement**: Prominent dropdown in editor header, above or left of canvas
- **Label**: "Select Target Infrastructure"
- **Validation Link**: Indicate this is required before deployment
- **Behavior**: Persist selection across sessions; show visual indicator when target is selected

### 3. Topology Validation

- **New Button**: "Validate" button in editor toolbar (next to Deploy)
- **Validation Rules**:
  - At least one target infrastructure selected
  - At least one service node in topology
  - (Extensible for future rules: required connections, naming conventions, etc.)
- **Feedback**:
  - Success: Toast or inline message "Configuration valid"
  - Failure: Show specific missing requirements (e.g., "Select a target infrastructure")
- **Pre-Deployment Check**: Automatically validate before Deploy; prevent deploy if validation fails

### 4. Terminology Update

- **Replace**: "Execute" button → "Deploy" button
- **Scope**: Update in:
  - ScenarioTable dropdown menu
  - ScenarioDetail header
  - Associated tooltips and navigation params

## Scope

- Affects frontend components: ScenarioDetail, TopologyEditor, ScenarioTable
- No backend changes required
- Backward compatible (existing scenarios remain valid)

## Non-Scope (Future Work)

- Advanced validation rules (e.g., service compatibility checks)
- Topology templates or wizards
- Real-time deployment status updates (already in ExecutionPanel)

## Open Questions for Clarification

1. Should infrastructure selection in the scenario details form (Edit Scenario page) be removed entirely, or kept as a fallback?
2. Should the validation be informational-only or block deployment entirely?
3. Any specific wording preference for guidelines?

## Success Metrics

- Users can complete topology configuration without referring to external documentation
- Deployment attempts catch validation errors before reaching backend
- No regression in existing scenario functionality
