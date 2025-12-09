## 1. Backend: Sector Model & API

- [x] 1.1 Create `server/src/models/Sector.ts` with NIS2 sector schema
- [x] 1.2 Create `server/src/seed/sectors.seed.ts` with 18 NIS2 sectors (essential + important)
- [x] 1.3 Create `server/src/routes/sectors.routes.ts` with GET /api/sectors endpoint
- [x] 1.4 Create `server/src/validators/sector.validator.ts` for Zod validation
- [x] 1.5 Register sectors routes in `server/src/app.ts`
- [x] 1.6 Update seed script to run sector seeding

## 2. Backend: Service Model Updates

- [x] 2.1 Add `uiType` field to Service model (`'web' | 'terminal' | 'both'`, default 'web')
- [x] 2.2 Add `sectorId` optional field to Service model (ObjectId ref to Sector)
- [x] 2.3 Add index on `sectorId` field
- [x] 2.4 Update service validator to include `uiType` and `sectorId`
- [x] 2.5 Update services route to support `?sector=` filter parameter
- [x] 2.6 Update service seed data to include `uiType` for existing services

## 3. Backend: Migration Script

- [x] 3.1 Create migration script `server/src/migrations/add-sectors-to-services.ts`
- [x] 3.2 Assign "Digital infrastructure" sector to existing OTHER_SERVICES
- [x] 3.3 Add migration runner (`bun run migrate:sectors` script in package.json)

## 4. Frontend: Sector API & Types

- [x] 4.1 Add Sector type to `client/src/lib/api.ts`
- [x] 4.2 Add `sectorsApi.list()` function to API client
- [x] 4.3 Update Service type to include `uiType` and `sectorId`

## 5. Frontend: Services Page Updates

- [x] 5.1 Rename "Critical Infrastructure" tab to "Critical Infrastructure Services"
- [x] 5.2 Replace category filter with sector filter for OTHER_SERVICES tab
- [x] 5.3 Fetch sectors and display in sector dropdown
- [x] 5.4 Update filter logic to use `sectorId` for infrastructure services

## 6. Frontend: Service Drawer Updates

- [x] 6.1 Add version selector dropdown showing all versions
- [x] 6.2 Display `uiType` in service details (with icon indicator)
- [x] 6.3 Show sector instead of category for OTHER_SERVICES
- [x] 6.4 Add "Copy version" functionality for selected version

## 7. Frontend: Service Form Updates

- [x] 7.1 Add `uiType` select field (Web / Terminal / Both)
- [x] 7.2 Show sector dropdown instead of category when `repositoryTable: OTHER_SERVICES`
- [x] 7.3 Update form validation for new fields

## 8. Frontend: Topology Version Selection

- [x] 8.1 Update YAML schema to accept optional `version` field per service
- [x] 8.2 Add version selector dropdown in topology service configuration (for services with multiple versions)
- [x] 8.3 Default to latest version, only include version in YAML when non-latest selected
- [x] 8.4 Show version badge in topology canvas nodes

## 9. Testing & Documentation

- [x] 9.1 TypeScript build passes without errors
- [x] 9.2 All files created and modified as specified
- [x] 9.3 Tasks.md updated with completion status
- [ ] 9.4 Manual testing recommended for migration script
- [ ] 9.5 Manual testing recommended for full end-to-end functionality
