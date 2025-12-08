# Tasks: MVP v1.0 Implementation

## 1. Service CRUD Backend

- [ ] 1.1 Add `POST /api/services` endpoint with Zod validation
- [ ] 1.2 Add `PUT /api/services/:id` endpoint
- [ ] 1.3 Add `DELETE /api/services/:id` endpoint (soft delete)
- [ ] 1.4 Add `POST /api/services/:id/versions` endpoint for version management
- [ ] 1.5 Create service validation schema with D2.1 field requirements

## 2. Service CRUD Frontend

- [ ] 2.1 Create ServiceForm component with all D2.1 fields
- [ ] 2.2 Create AddServicePage with form submission
- [ ] 2.3 Create EditServicePage with data loading
- [ ] 2.4 Add version management UI in ServiceDrawer
- [ ] 2.5 Add delete confirmation dialog to ServiceTable
- [ ] 2.6 Add "Add Service" button to Services page header

## 3. Project Backend

- [ ] 3.1 Create Project Mongoose model with schema
- [ ] 3.2 Add indexes on `shortName`, `sector`, `leader`
- [ ] 3.3 Create `GET /api/projects` endpoint with filtering
- [ ] 3.4 Create `POST /api/projects` endpoint
- [ ] 3.5 Create `GET /api/projects/:id` endpoint with scenario population
- [ ] 3.6 Create `PUT /api/projects/:id` endpoint
- [ ] 3.7 Create `DELETE /api/projects/:id` endpoint

## 4. Project Frontend

- [ ] 4.1 Create ProjectTable component
- [ ] 4.2 Update Projects page with table and filters
- [ ] 4.3 Create ProjectForm component
- [ ] 4.4 Create AddProjectPage
- [ ] 4.5 Create EditProjectPage
- [ ] 4.6 Create ProjectDetailPage showing scenarios

## 5. Scenario Backend

- [ ] 5.1 Create Scenario Mongoose model with topology schema
- [ ] 5.2 Add execution subdocument schema
- [ ] 5.3 Create `GET /api/projects/:projectId/scenarios` endpoint
- [ ] 5.4 Create `POST /api/projects/:projectId/scenarios` endpoint
- [ ] 5.5 Create `GET /api/scenarios/:id` endpoint
- [ ] 5.6 Create `PUT /api/scenarios/:id` endpoint (save topology)
- [ ] 5.7 Create `DELETE /api/scenarios/:id` endpoint

## 6. Topology Editor - Code Panel

- [ ] 6.1 Install @monaco-editor/react package
- [ ] 6.2 Create TopologyCodeEditor component with Monaco
- [ ] 6.3 Configure YAML syntax highlighting and validation
- [ ] 6.4 Add auto-completion for service shortNames
- [ ] 6.5 Create YAML-to-topology parsing utility

## 7. Topology Editor - Visual Canvas

- [ ] 7.1 Install @xyflow/react package
- [ ] 7.2 Create TopologyCanvas component with React Flow
- [ ] 7.3 Create ServiceNode custom node component
- [ ] 7.4 Create ConnectionEdge custom edge with labels
- [ ] 7.5 Implement node drag-and-drop
- [ ] 7.6 Create topology-to-YAML serialization utility

## 8. Topology Editor - Split Screen Integration

- [ ] 8.1 Create TopologyEditor container component
- [ ] 8.2 Implement resizable split pane layout
- [ ] 8.3 Add bidirectional sync between code and canvas
- [ ] 8.4 Create ServiceSelector palette component
- [ ] 8.5 Implement add service from palette to topology
- [ ] 8.6 Add validation before save

## 9. Scenario Frontend Pages

- [ ] 9.1 Create ScenarioListPage showing project scenarios
- [ ] 9.2 Create CreateScenarioPage with topology editor
- [ ] 9.3 Create EditScenarioPage with topology editor
- [ ] 9.4 Add infrastructure selector dropdown
- [ ] 9.5 Add save and validate buttons

## 10. Infrastructure Backend

- [ ] 10.1 Create Infrastructure Mongoose model
- [ ] 10.2 Create encryption utility module (AES-256-GCM)
- [ ] 10.3 Create `GET /api/infrastructures` endpoint
- [ ] 10.4 Create `POST /api/infrastructures` endpoint (encrypts credentials)
- [ ] 10.5 Create `PUT /api/infrastructures/:id` endpoint
- [ ] 10.6 Create `DELETE /api/infrastructures/:id` endpoint
- [ ] 10.7 Create `POST /api/infrastructures/:id/test` endpoint

## 11. Infrastructure Frontend

- [ ] 11.1 Create InfrastructureTable component
- [ ] 11.2 Update Infrastructure page with table
- [ ] 11.3 Create InfrastructureForm component
- [ ] 11.4 Create AddInfrastructurePage
- [ ] 11.5 Create EditInfrastructurePage
- [ ] 11.6 Add test connection button with status display

## 12. Tabbed Workspace

- [ ] 12.1 Create tab-store.ts Zustand store
- [ ] 12.2 Create TabBar component with tab list
- [ ] 12.3 Create TabContent container component
- [ ] 12.4 Create IFrameTab component for embedded dashboards
- [ ] 12.5 Integrate TabWorkspace into MainLayout
- [ ] 12.6 Add tab open action from scenario execution

## 13. Execution System

- [ ] 13.1 Create `POST /api/scenarios/:id/execute` endpoint
- [ ] 13.2 Implement MAESTRO URL construction
- [ ] 13.3 Create execution status tracking
- [ ] 13.4 Create ExecutionHistoryList component
- [ ] 13.5 Create ConclusionEditor component (rich text)
- [ ] 13.6 Create `POST /api/scenarios/:id/executions/:eid/conclusion` endpoint

## 14. PDF Export

- [ ] 14.1 Install pdfkit package
- [ ] 14.2 Create PDF service module
- [ ] 14.3 Create `GET /api/scenarios/:id/executions/:eid/export/pdf` endpoint
- [ ] 14.4 Design PDF template with scenario info, services, conclusion
- [ ] 14.5 Add export button to execution detail view

## 15. Dashboard Enhancement

- [ ] 15.1 Create OverviewCards component (services, projects, scenarios count)
- [ ] 15.2 Create RecentActivity component
- [ ] 15.3 Create QuickActions component
- [ ] 15.4 Add dashboard API endpoints for aggregated stats
- [ ] 15.5 Update Dashboard page with new components

## 16. Analytics Page

- [ ] 16.1 Create `GET /api/analytics/scenarios` endpoint (execution history)
- [ ] 16.2 Create `GET /api/analytics/scenarios/stats` endpoint
- [ ] 16.3 Create ExecutionHistoryTable component
- [ ] 16.4 Update Analytics page with table and filters
- [ ] 16.5 Add execution status filters

## 17. Integration Testing

- [ ] 17.1 Test service CRUD flow end-to-end
- [ ] 17.2 Test project/scenario creation flow
- [ ] 17.3 Test topology editor YAML/visual sync
- [ ] 17.4 Test infrastructure credential encryption/decryption
- [ ] 17.5 Test PDF generation
- [ ] 17.6 Test tabbed workspace with iFrames
- [ ] 17.7 Verify all pages accessible and functional

## Dependencies

```
Phase 1: Service CRUD (1.x, 2.x) - No dependencies
Phase 2: Projects (3.x, 4.x) - No dependencies
Phase 3: Scenarios (5.x, 9.x) - Depends on Projects
Phase 4: Topology Editor (6.x, 7.x, 8.x) - Depends on Scenarios
Phase 5: Infrastructure (10.x, 11.x) - No dependencies
Phase 6: Tabbed Workspace (12.x) - No dependencies
Phase 7: Execution (13.x) - Depends on Scenarios, Infrastructure, Tabs
Phase 8: PDF (14.x) - Depends on Execution
Phase 9: Dashboard/Analytics (15.x, 16.x) - Depends on all above
Phase 10: Integration Testing (17.x) - Depends on all
```

## Parallelizable Work

- Service CRUD (1-2) can run in parallel with Projects (3-4) and Infrastructure (10-11)
- Topology Editor code panel (6) and visual canvas (7) can be developed in parallel
- Tabbed Workspace (12) can be developed independently
- Dashboard (15) and Analytics (16) can run in parallel
