# Change: Enhance Service Versioning, UI Types, and NIS2 Sectors

## Why

The current Service Repository lacks critical features needed for realistic deployment simulations:
1. Services have versions but users cannot select specific versions - only the latest is used
2. There's no way to define how a service's UI should be displayed during deployment (web-based dashboard vs terminal)
3. Critical Infrastructure Services use a generic "category" concept instead of NIS2-aligned critical sectors

These gaps limit the platform's ability to accurately model real-world infrastructure deployments across different industry sectors.

## What Changes

### Service Versioning Enhancement
- Add version selection capability to service configuration (YAML topology editor)
- Display all available versions in service details with the ability to select any version
- Default to latest version (`currentVersion`) when no specific version is configured

### Service UI Type Attribute
- Add `uiType` field to Service model: `'web' | 'terminal' | 'both'`
- This determines how the service simulation UI will be rendered during deployment:
  - `web`: Embedded web dashboard (iFrame)
  - `terminal`: Terminal emulator (xterm.js-style)
  - `both`: User can toggle between web and terminal views
- Default to `'web'` for existing services

### NIS2 Critical Sectors
- **BREAKING**: Replace `categoryId` with `sectorId` for Critical Infrastructure Services (`repositoryTable: OTHER_SERVICES`)
- Create new `Sector` model based on NIS2 directive essential/important sectors
- Rename "Critical Infrastructure" tab to "Critical Infrastructure Services"
- Seed NIS2 sectors:
  - Energy
  - Transport
  - Banking
  - Financial market infrastructures
  - Health
  - Drinking water
  - Wastewater
  - Digital infrastructure
  - ICT service management (B2B)
  - Public administration
  - Space
  - Postal and courier services
  - Waste management
  - Manufacture, production and distribution of chemicals
  - Production, processing and distribution of food
  - Manufacturing
  - Digital providers
  - Research

## Impact

- **Affected specs**: `service-repository`
- **Affected code**:
  - `server/src/models/Service.ts` - Add `uiType`, modify version selection
  - `server/src/models/Sector.ts` - New model for NIS2 sectors
  - `server/src/seed/` - Add sector seeding
  - `client/src/pages/Services.tsx` - Update tab label, replace category filter with sector for OTHER_SERVICES
  - `client/src/components/services/ServiceDrawer.tsx` - Add version selector, show uiType
  - `client/src/components/services/ServiceForm.tsx` - Add uiType field
  - `client/src/components/topology/YamlEditor.tsx` - Support version selection in YAML
- **Migration**: Existing services with `repositoryTable: OTHER_SERVICES` need migration to assign `sectorId`
