# Proposal: Enhance Project Form with Service-Aware Validation

## Change ID

`enhance-project-form-validation`

## Summary

Improve the Add/Edit Project form by:

1. Filtering available sectors to only those with existing Critical Infrastructure Services
2. Auto-selecting the project leader as an involved partner
3. Auto-selecting providers of Critical Infrastructure Services as involved partners

## Motivation

Currently, the Project form allows selecting any sector (Telecommunications, Healthcare, Transportation, Nuclear) regardless of whether Critical Infrastructure Services exist for that sector. This can lead to projects being created for sectors with no testable infrastructure.

Additionally, when selecting a leader or associating services, the involved partners list should automatically include:

- The selected project leader (always involved)
- Providers of the Critical Infrastructure Services in the repository (they own the infrastructure being tested)

## Scope

### In Scope

- Filter project sector dropdown based on available Critical Infrastructure Services
- Auto-select leader in involved partners when leader changes
- Auto-select service providers from OTHER_SERVICES table as involved partners
- Maintain ability to manually add/remove partners beyond auto-selected ones

### Out of Scope

- Changing the project sector taxonomy (keeping Telecommunications, Healthcare, etc.)
- Modifying the NIS2 sector system for services
- Backend validation changes (frontend-only enhancement)

## Requirements Overview

### REQ-1: Sector Availability Filtering

Show only sectors that have at least one Critical Infrastructure Service in the database. Map project sectors to NIS2 sectors:

- Telecommunications → Digital infrastructure
- Healthcare → Health
- Transportation → Transport
- Nuclear → Energy (closest match)
- Cross-Sector → Always available (composite projects)

### REQ-2: Leader Auto-Selection

When a leader is selected, automatically add them to the involved partners list. The leader should be visually distinguished and cannot be removed while they remain the leader.

### REQ-3: Service Provider Auto-Selection

Fetch all unique providers from Critical Infrastructure Services (OTHER_SERVICES table) and automatically add them to the involved partners list. These represent organizations whose infrastructure will be part of the digital twin.

## Technical Approach

### Frontend Changes (ProjectForm.tsx)

1. Fetch Critical Infrastructure Services to determine available sectors
2. Create mapping between project sectors and NIS2 sectors
3. Filter sector dropdown options based on service availability
4. Watch leader field and sync to involvedPartners state
5. Fetch and auto-include service providers in involvedPartners
6. Distinguish auto-selected vs manually-selected partners in UI

### API Usage

- Use existing `servicesApi.list({ table: 'OTHER_SERVICES' })` to get services
- Extract unique `sectorId` values to determine available sectors
- Extract unique `provider` values for auto-selection

## Dependencies

- Relies on NIS2 sectors being populated in services (migration already done)
- Requires services API to be accessible from ProjectForm

## Risks & Mitigations

| Risk                                       | Mitigation                                       |
| ------------------------------------------ | ------------------------------------------------ |
| No services exist for a sector             | Show helpful message, allow Cross-Sector         |
| Provider names don't match consortium list | Include all providers, let user remove if needed |
| Performance with many services             | Services already cached by React Query           |

## Success Criteria

- [ ] Sector dropdown only shows sectors with available services
- [ ] Leader is always in involved partners list
- [ ] Service providers are pre-selected in involved partners
- [ ] User can still manually add/remove partners
- [ ] Form remains functional if no services exist
