# Design: Enhance Project Form with Service-Aware Validation

## Architecture Overview

This change is frontend-only, modifying `ProjectForm.tsx` to add service-awareness when creating/editing projects.

```
┌─────────────────────────────────────────────────────────────┐
│                      ProjectForm.tsx                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   useQuery   │    │   useQuery   │    │   useQuery   │  │
│  │  (projects)  │    │  (services)  │    │  (sectors)   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Computed Values (useMemo)                │  │
│  │  - availableSectors: sectors with services            │  │
│  │  - serviceProviders: unique providers from services   │  │
│  │  - projectSectorToNIS2: mapping dictionary            │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                │
│         ┌──────────────────┼──────────────────┐            │
│         ▼                  ▼                  ▼            │
│  ┌────────────┐    ┌────────────┐    ┌────────────────┐   │
│  │   Sector   │    │   Leader   │    │    Partners    │   │
│  │  Dropdown  │    │  Dropdown  │    │    Badges      │   │
│  │ (filtered) │    │ (auto-add) │    │ (auto-select)  │   │
│  └────────────┘    └────────────┘    └────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Sector Filtering Logic

```typescript
// Mapping from project sectors to NIS2 sector slugs
const PROJECT_SECTOR_TO_NIS2: Record<string, string[]> = {
  Telecommunications: ['digital-infrastructure'],
  Healthcare: ['health'],
  Transportation: ['transport'],
  Nuclear: ['energy'],
  'Cross-Sector': [], // Always available
};

// Determine which project sectors are available
const availableSectors = useMemo(() => {
  const servicesWithSector = infrastructureServices.filter((s) => s.sectorId);
  const nis2SectorSlugs = new Set(servicesWithSector.map((s) => s.sectorId.slug));

  return PROJECT_SECTORS.filter((sector) => {
    if (sector === 'Cross-Sector') return true;
    const requiredNIS2 = PROJECT_SECTOR_TO_NIS2[sector];
    return requiredNIS2.some((slug) => nis2SectorSlugs.has(slug));
  });
}, [infrastructureServices]);
```

### 2. Partner Auto-Selection Logic

```typescript
// Track which partners are auto-selected vs manually selected
const [manualPartners, setManualPartners] = useState<string[]>([]);

// Compute final partners list
const involvedPartners = useMemo(() => {
  const auto = new Set<string>();

  // Leader is always included
  if (leader) auto.add(leader);

  // Service providers are included
  serviceProviders.forEach((p) => auto.add(p));

  // Merge with manual selections
  return [...new Set([...auto, ...manualPartners])];
}, [leader, serviceProviders, manualPartners]);
```

### 3. UI State Management

```typescript
// Partner badge states
type PartnerState = 'leader' | 'provider' | 'manual';

const getPartnerState = (partner: string): PartnerState => {
  if (partner === leader) return 'leader';
  if (serviceProviders.includes(partner)) return 'provider';
  return 'manual';
};

// Only manual partners can be removed
const canRemovePartner = (partner: string): boolean => {
  return getPartnerState(partner) === 'manual';
};
```

## Component Changes

### Sector Dropdown

- Fetch OTHER_SERVICES on mount
- Compute available sectors based on service NIS2 sectors
- Disable unavailable sectors with tooltip explaining why
- Show "(N services)" count next to each sector

### Leader Dropdown

- On change, ensure leader is in involvedPartners
- Sync with partner badges UI

### Partner Badges

- Visual distinction for auto-selected partners:
  - Leader: Primary badge with crown/star icon, non-removable
  - Provider: Secondary badge with building icon, non-removable
  - Manual: Outline badge with X button, removable
- Show tooltip on hover explaining why auto-selected

## API Calls

No new API endpoints needed. Uses existing:

- `GET /api/services?table=OTHER_SERVICES` - fetch infrastructure services
- `GET /api/sectors` - fetch NIS2 sectors (already used elsewhere)

## Edge Cases

| Case                            | Behavior                                                |
| ------------------------------- | ------------------------------------------------------- |
| No services in database         | Show all sectors, display warning message               |
| Service has no sectorId         | Ignore for sector filtering                             |
| Provider not in consortium list | Still auto-select, add to list dynamically              |
| Edit existing project           | Preserve manual partners, re-compute auto               |
| Leader changed                  | Remove old leader if only auto-selected, add new leader |

## Performance Considerations

- Services query is cached by React Query (staleTime: 5 minutes)
- useMemo prevents recomputation on every render
- No additional API calls beyond existing patterns
