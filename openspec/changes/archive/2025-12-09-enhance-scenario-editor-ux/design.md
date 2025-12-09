# Design: Scenario Editor UX Enhancement

## Architectural Overview

This change improves user guidance and validation workflow in the scenario topology editor without requiring backend changes. All modifications are frontend-only, affecting the React component hierarchy and state management.

## Component Structure Changes

### 1. TopologyEditor Enhancement

**Current Structure:**

- TopologyEditor (canvas, YAML editor)
- Receives infrastructure from parent (ScenarioDetail)

**Proposed Changes:**

- Add infrastructure selection dropdown to TopologyEditor header
- Add help button (?) that triggers guidelines modal
- Add validate button next to deploy
- Manage infrastructure selection in TopologyEditor local state (persist to parent/DB)

**Implementation Pattern:**

```text
ScenarioDetail
├── WorkspaceTabs
├── Header (back, title, PDF, Edit Details)
├── TopologyEditor (ENHANCED)
│   ├── Toolbar
│   │   ├── Infrastructure Selector (NEW)
│   │   ├── Validate Button (NEW)
│   │   ├── Deploy Button (RENAMED from Execute)
│   │   └── Help Button (NEW)
│   ├── Canvas (React Flow)
│   └── YAML Editor
├── ExecutionPanel (unchanged)
└── GuidelinesModal (NEW)
```

### 2. Validation Logic

**Validation Rules Engine (New Utility):**

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

function validateTopology(
  infrastructure: string | null,
  nodes: Node[],
  edges: Edge[]
): ValidationResult;
```

**Rules:**

1. Infrastructure selected (required)
2. At least one service node (required)
3. (Future extensibility for additional rules)

**Deployment Guard:**

- In `handleDeploy()`: Call validation before initiating ExecutionPanel
- If invalid: Show toast error with first error message, prevent deployment
- If valid: Proceed with existing deployment flow

### 3. Guidelines Modal Component

**New Component: `ScenarioEditorGuidelinesModal`**

- Trigger: Help button in TopologyEditor
- Content: Step-by-step collapsible sections
- State: Modal open/close managed in ScenarioDetail
- UX: Show once per session unless user dismisses permanently

**Structure:**

```text
Guidelines Modal
├── Step 1: Select Target Infrastructure
├── Step 2: Add Services from Palette
├── Step 3: Connect Services with Edges
├── Step 4: Validate Configuration
├── Step 5: Deploy to Target
└── [Dismiss/Close buttons]
```

### 4. Infrastructure Selection State Management

**Current Flow:**

- Infrastructure selected in ScenarioForm (Edit Scenario page)
- Stored in scenario document (scenario.infrastructureId)
- Retrieved in ScenarioDetail, passed to ExecutionPanel

**New Flow:**

- Primary selection: TopologyEditor toolbar dropdown
- Still editable in Edit Scenario form (backward compatibility)
- Both update the same `scenario.infrastructureId` field
- TopologyEditor reads from scenario on mount, updates on selection change

**Persistence:**

- Selection persists to database via existing updateMutation
- No new API endpoints needed

## Terminology Update Impact

**Files Affected:**

- `ScenarioTable.tsx`: "Execute" → "Deploy" in dropdown menu and tooltip
- `ScenarioDetail.tsx`: "Execute" → "Deploy" in header button and query param (change from `?execute=true` to `?deploy=true`)
- Related labels and toast messages

**Backward Compatibility:**

- Keep support for legacy `?execute=true` query param (redirect to `?deploy=true`)
- Existing scenario records unaffected

## Data Flow Diagram

```text
User Opens Scenario
         ↓
   ScenarioDetail fetches scenario data
         ↓
   TopologyEditor mounts with scenario.infrastructureId
         ↓
   User clicks Help (?)
         ↓
   GuidelinesModal opens with step-by-step guidance
         ↓
   User selects infrastructure from dropdown
         ↓
   TopologyEditor updates scenario via updateMutation
         ↓
   User builds topology (add nodes, edges)
         ↓
   User clicks Validate
         ↓
   Validation Engine checks: infrastructure + ≥1 service node
         ↓
   ├─ Valid: Toast "Configuration valid"
   │
   └─ Invalid: Toast error + show specific missing requirements
         ↓
   User clicks Deploy
         ↓
   ├─ Pre-validation check: if invalid → prevent, show error
   │
   └─ Valid: Open ExecutionPanel with existing flow
```

## State Management

**ScenarioDetail local state additions:**

```typescript
const [guidelinesOpen, setGuidelinesOpen] = useState(false);
const [selectedInfrastructure, setSelectedInfrastructure] = useState<string | null>(null);
```

**TopologyEditor props changes:**

```typescript
interface TopologyEditorProps {
  // ... existing props
  onGuidelinesClick?: () => void;
  selectedInfrastructure?: string | null;
  onInfrastructureChange?: (id: string | null) => void;
  onValidateClick?: () => void;
}
```

## API Changes

**None.** This change uses existing endpoint `scenariosApi.update()` for infrastructure changes.

## Testing Strategy

1. **Unit Tests:**
   - `validateTopology()` function with various node/edge combinations
   - Test all validation rule combinations

2. **Component Tests:**
   - GuidelinesModal renders all steps
   - Infrastructure selector updates parent state
   - Validate button prevents deploy when validation fails
   - Terminology "Deploy" appears throughout

3. **Integration Tests:**
   - Full workflow: Select infrastructure → Validate → Deploy
   - Error cases: Deploy without infrastructure, without services
   - Backward compatibility: Edit Scenario form infrastructure selection still works

## Migration & Rollout

- No database migrations needed
- Feature is purely frontend additive
- Existing scenarios work without modification
- Users see new UI immediately on next load

## Risks & Mitigations

| Risk                                         | Mitigation                                                           |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Infrastructure dropdown not prominent enough | Place at top-left of editor, highlight when empty with warning badge |
| Users skip guidelines                        | Make modal non-dismissible first time (optional)                     |
| Validation too strict                        | Start with basic rules; keep extensible for future refinements       |
| Terminology change breaks bookmarks          | Support both `?execute=true` and `?deploy=true` params               |
