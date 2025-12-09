# scenario-editor-guidelines Specification

## Purpose

TBD - created by archiving change enhance-scenario-editor-ux. Update Purpose after archive.

## Requirements

### Requirement: Display Help Guidelines Modal

The topology editor SHALL provide step-by-step instructions to help users build and deploy scenario topologies through an accessible help interface.

#### Scenario: Help button visible in editor

The topology editor displays a help button (?) in the toolbar next to other action buttons.

- Help button uses standard icon and styling consistent with project design
- Button is always visible and enabled
- Button has a tooltip: "Learn how to build and deploy scenarios"

#### Scenario: Guidelines modal opens when help clicked

Clicking the help button opens a modal with step-by-step instructions.

- Modal displays without closing scenario editor
- Modal can be closed by clicking an X button, pressing Escape, or clicking outside
- Modal content is readable with clear typography hierarchy

#### Scenario: Modal content shows steps for topology building

The modal displays at least 5 steps guiding users through scenario configuration:

1. **Select Target Infrastructure** - Choose where the scenario will be deployed from the infrastructure dropdown
2. **Add Services to Canvas** - Drag services from the palette onto the topology canvas
3. **Connect Services with Edges** - Draw edges to represent data flows between services
4. **Validate Configuration** - Click Validate to ensure topology meets requirements
5. **Deploy to Target** - Click Deploy to start the scenario on the selected infrastructure

- Each step includes a brief description (1-2 sentences)
- Steps are visually distinct (e.g., cards, sections, accordion)
- Steps can be scrolled if content exceeds viewport

#### Scenario: Modal has optional dismiss option

Users can optionally choose not to see guidelines again during their session.

- Modal includes optional "Don't show again" checkbox
- Selection persists for the current session only
- Unchecking the option resets on page refresh or navigation away
