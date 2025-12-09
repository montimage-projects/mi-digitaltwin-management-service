# Spec: Project Form Enhancements

## Overview

Enhancements to the Project creation/edit form to provide service-aware validation and automatic partner selection.

---

## ADDED Requirements

### Requirement: Sector Availability Filtering SHALL Filter Based on Services

The project sector dropdown SHALL only display sectors that have at least one Critical Infrastructure Service in the database.

#### Scenario: Sector with available services

**Given** there are Critical Infrastructure Services with NIS2 sector "Health"
**When** the user opens the Add Project form
**Then** the "Healthcare" sector option shall be enabled and selectable

#### Scenario: Sector without available services

**Given** there are no Critical Infrastructure Services with NIS2 sector "Transport"
**When** the user opens the Add Project form
**Then** the "Transportation" sector option shall be disabled or hidden

#### Scenario: Cross-Sector always available

**Given** any state of Critical Infrastructure Services
**When** the user opens the Add Project form
**Then** the "Cross-Sector" option shall always be enabled and selectable

#### Scenario: No services in database

**Given** there are no Critical Infrastructure Services in the database
**When** the user opens the Add Project form
**Then** all sectors shall be shown with a warning message about limited infrastructure

---

### Requirement: Leader Auto-Selection in Partners SHALL Include Leader

When a project leader is selected, they SHALL be automatically added to the involved partners list.

#### Scenario: Selecting a new leader

**Given** the user is on the Add Project form
**When** the user selects "THALES" as the project leader
**Then** "THALES" shall appear in the involved partners list
**And** "THALES" shall be visually distinguished as the leader
**And** "THALES" shall not be removable from the partners list

#### Scenario: Changing the leader

**Given** a project has "THALES" as leader and only auto-selected partners
**When** the user changes the leader to "SIEMENS"
**Then** "SIEMENS" shall be added to the involved partners list
**And** "THALES" may be removed if it was only auto-selected as leader

#### Scenario: Leader in edit mode

**Given** an existing project with leader "MONT"
**When** the user opens the Edit Project form
**Then** "MONT" shall appear in the involved partners list as the leader

---

### Requirement: Service Provider Auto-Selection SHALL Include Providers

Providers of Critical Infrastructure Services SHALL be automatically added to the involved partners list.

#### Scenario: Services with consortium providers

**Given** Critical Infrastructure Services with providers "5YPE", "MONT", "Open Source"
**When** the user opens the Add Project form
**Then** "5YPE" and "MONT" shall be auto-selected in involved partners
**And** they shall be visually distinguished as infrastructure providers
**And** they shall not be removable from the partners list

#### Scenario: Non-consortium providers

**Given** a Critical Infrastructure Service with provider "Open Source"
**When** the user opens the Add Project form
**Then** "Open Source" shall be added to the partners list
**And** it shall be displayed even though it's not in the consortium list

#### Scenario: Manual partner addition

**Given** auto-selected partners "5YPE" and "MONT"
**When** the user manually selects "AIRBUS" as an additional partner
**Then** "AIRBUS" shall be added to the partners list
**And** "AIRBUS" shall be removable (shown with X button)

---

## MODIFIED Requirements

### Requirement: Partner Badge Display SHALL Indicate Selection Type

Partner badges SHALL indicate whether they are auto-selected or manually selected.

#### Scenario: Visual distinction

**Given** partners list contains auto-selected and manual partners
**When** the partners section is displayed
**Then** leader shall show with a distinct style (e.g., primary color, star icon)
**And** providers shall show with a secondary style (e.g., building icon)
**And** manual partners shall show with outline style and X button

#### Scenario: Tooltip on hover

**Given** an auto-selected partner badge
**When** the user hovers over the badge
**Then** a tooltip shall explain why this partner was auto-selected

---

## Cross-References

- Related to: Service Repository (provides infrastructure services data)
- Related to: NIS2 Sectors (sector filtering uses NIS2 sector assignments)
