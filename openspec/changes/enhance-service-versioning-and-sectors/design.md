## Context

The INTACT platform manages two types of services:
1. **INTACT Toolbox** (`INTACT_TOOLBOX`): Security tools categorized by D2.1 functional categories
2. **Critical Infrastructure Services** (`OTHER_SERVICES`): Target services that require protection

Currently, both use the same `categoryId` reference, but Critical Infrastructure Services should align with NIS2 directive sectors rather than security tool categories. Additionally, services have version history but no mechanism to select specific versions for deployment.

**Stakeholders**: INTACT consortium partners, platform administrators, scenario designers

## Goals / Non-Goals

**Goals:**
- Enable version selection for services in topology YAML configuration
- Add UI type attribute to control deployment simulation rendering
- Replace category with NIS2 sectors for Critical Infrastructure Services
- Maintain backward compatibility for INTACT Toolbox (keep using categories)

**Non-Goals:**
- Removing the Category model (still used by INTACT Toolbox)
- Implementing full NIS2 compliance reporting
- Creating sector-specific security policies
- Version dependency resolution (that's MAESTRO's responsibility)

## Decisions

### 1. Dual Classification Approach
**Decision**: Keep `categoryId` for INTACT Toolbox, add `sectorId` for Critical Infrastructure Services
**Rationale**:
- Categories are D2.1-defined functional groupings for security tools
- Sectors are NIS2-defined industry classifications for target infrastructure
- A service belongs to either a category OR a sector based on its `repositoryTable`

**Alternatives considered**:
- Rename Category to "Classification" with sub-types → Added complexity, breaking change for Toolbox
- Use a single polymorphic field → Harder to validate, confusing semantics

### 2. UI Type Enum
**Decision**: Use a simple enum `'web' | 'terminal' | 'both'` stored on the Service model
**Rationale**:
- Straightforward to implement
- Covers all realistic service UI scenarios
- Easy to extend later if needed

**Alternatives considered**:
- Multiple boolean flags (`hasWebUI`, `hasTerminalUI`) → More fields, harder to validate
- Separate UI configuration document → Over-engineered for current needs

### 3. Version Selection in YAML
**Decision**: Add optional `version` field to service references in topology YAML
**Rationale**:
- Keeps configuration declarative
- Falls back to `currentVersion` when not specified
- Matches common Docker/Kubernetes version pinning patterns

**YAML format**:
```yaml
services:
  - name: MMT
    version: "1.2.0"  # Optional, defaults to currentVersion
    config:
      ...
```

### 4. NIS2 Sector Model
**Decision**: Create a new `Sector` model with 18 NIS2-aligned sectors
**Rationale**:
- Official EU directive classification
- Recognizable to infrastructure operators
- Maps directly to compliance requirements

**Schema**:
```typescript
interface ISector {
  name: string;         // e.g., "Energy"
  slug: string;         // e.g., "energy"
  category: 'essential' | 'important';  // NIS2 classification
  description?: string;
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking change for existing OTHER_SERVICES | Migration script to assign default sector based on heuristics or manual assignment |
| UI type not applicable to all services | Make field optional with sensible default (`web`) |
| Version mismatch with actual Docker images | Validation during topology save (warning, not error) |
| Sector list changes in future NIS2 updates | Admin UI for sector management (future enhancement) |

## Migration Plan

### Phase 1: Schema Updates
1. Add `uiType` field to Service model with default `'web'`
2. Add `sectorId` optional field to Service model
3. Create Sector model and seed script

### Phase 2: Data Migration
1. Create migration script to assign sectors to existing OTHER_SERVICES
2. Option A: Default all to "Digital infrastructure" sector
3. Option B: Manual mapping based on service names/descriptions

### Phase 3: UI Updates
1. Update Services page to filter by sector for OTHER_SERVICES tab
2. Add version selector to ServiceDrawer
3. Add uiType field to ServiceForm
4. Update topology YAML schema to accept version field

### Rollback
- `sectorId` is optional, so rollback just ignores the field
- `uiType` has default, so rollback just ignores the field
- Sector collection can be dropped without affecting core functionality

## Open Questions

1. **Sector assignment for existing services**: Should we auto-assign a default sector or require manual selection during migration?
   - Recommendation: Auto-assign "Digital infrastructure" as fallback, allow editing in UI

2. **Version validation**: Should we validate that selected version exists in `versions[]` array?
   - Recommendation: Yes, validate on topology save but allow saving with warning

3. **UI type per version**: Should `uiType` be per-service or per-version?
   - Recommendation: Per-service for simplicity; can enhance later if needed
