# Tasks: Enhance Project Form with Service-Aware Validation

## Task List

### Phase 1: Data Fetching & Sector Filtering

- [x] **1.1** Add useQuery to fetch Critical Infrastructure Services in ProjectForm
  - Fetch services with `table: 'OTHER_SERVICES'`
  - Extract unique sectorIds from services
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **1.2** Create sector mapping constant
  - Define `PROJECT_SECTOR_TO_NIS2` mapping
  - Map Telecommunications→digital-infrastructure, Healthcare→health, etc.
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **1.3** Implement availableSectors computed value
  - Use useMemo to compute which project sectors have services
  - Cross-Sector always available
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **1.4** Update sector dropdown to use filtered list
  - Only show sectors from availableSectors
  - Add service count badge next to each sector option
  - Show disabled state with tooltip for unavailable sectors
  - File: `client/src/components/projects/ProjectForm.tsx`

### Phase 2: Leader Auto-Selection

- [x] **2.1** Add effect to sync leader with involvedPartners
  - When leader changes, ensure leader is in partners list
  - Handle initial load with existing leader
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **2.2** Update partner badge UI for leader
  - Show leader badge with distinct style (cannot be removed)
  - Add visual indicator (e.g., star icon)
  - File: `client/src/components/projects/ProjectForm.tsx`

### Phase 3: Service Provider Auto-Selection

- [x] **3.1** Extract unique providers from infrastructure services
  - Use useMemo to get unique provider values
  - Filter out empty/null providers
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **3.2** Auto-include service providers in partners list
  - Merge providers with existing partners
  - Handle both consortium and non-consortium providers
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **3.3** Update partner badge UI for providers
  - Show provider badges with distinct style (cannot be removed)
  - Add building/company icon
  - File: `client/src/components/projects/ProjectForm.tsx`

### Phase 4: UI Polish & Edge Cases

- [x] **4.1** Add partner state management
  - Track auto-selected vs manually-selected partners
  - Only allow removal of manually-selected partners
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **4.2** Add tooltips for auto-selected partners
  - Leader: "Project leader - automatically included"
  - Provider: "Infrastructure service provider - automatically included"
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **4.3** Handle edge case: no services available
  - Show informational message if no infrastructure services exist
  - Allow all sectors but display warning
  - File: `client/src/components/projects/ProjectForm.tsx`

- [x] **4.4** Handle edit mode
  - Preserve existing manual partners on load
  - Recompute auto-selected partners
  - File: `client/src/components/projects/ProjectForm.tsx`

### Phase 5: Testing & Validation

- [x] **5.1** Manual testing checklist
  - Verify sector filtering works with actual services
  - Verify leader auto-selection
  - Verify provider auto-selection
  - Verify edit mode preserves data correctly

- [x] **5.2** TypeScript validation
  - Run `npx tsc --noEmit` to check for type errors
  - Fix any type issues

## Dependencies

- Tasks 2.x and 3.x can be done in parallel after 1.x
- Task 4.x depends on both 2.x and 3.x
- Task 5.x should be done last

## Verification

Each task should be verified by:

1. Visual inspection in browser
2. TypeScript compilation passes
3. No console errors

## Completion Summary

All tasks completed successfully. Implementation includes:

- Sector dropdown filters based on available NIS2 sectors in infrastructure services
- Service counts shown next to each sector option
- Leader is auto-selected with star icon and cannot be removed
- Service providers are auto-selected with building icon and cannot be removed
- Manual partners can be added/removed freely
- Tooltips explain why partners are auto-selected
- Edge case handling for no services available
