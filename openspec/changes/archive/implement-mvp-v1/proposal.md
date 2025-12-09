# Proposal: Implement MVP v1.0

## Summary

Complete the INTACT Digital Twin Management Platform MVP by implementing the remaining modules after Sprint 0 POC: Service CRUD, Projects, Scenarios with Topology Editor, Infrastructure Management, Tabbed Workspace, Execution/MAESTRO Integration, and PDF Export.

## Motivation

Sprint 0 established the foundation with authentication, service repository listing, and frontend shell. The MVP requires full CRUD for services, Digital Twin project management, scenario design with visual topology editor, infrastructure management with credential encryption, tabbed workspace for service dashboards, and PDF report generation for completed executions.

## Scope

### In Scope

1. **Service CRUD** - Create, update, delete services with version management
2. **Digital Twin Projects** - Full CRUD for atomic and cross-sector projects
3. **Scenario Management** - CRUD with topology code/visual editor (Monaco + React Flow)
4. **Infrastructure Management** - CRUD with AES-256-GCM credential encryption
5. **Tabbed Workspace** - Tab container for iFrame service dashboards and MAESTRO
6. **Execution System** - Trigger execution, track history, add conclusions
7. **PDF Export** - Generate professional reports for scenario executions
8. **Dashboard Enhancement** - Overview cards, recent activity, quick actions

### Out of Scope

- Multi-user authentication (v1.1)
- Real-time WebSocket updates (v1.2)
- Service compatibility validation (v1.1)
- External data space integrations (v2.0)

## Approach

1. **Phase 1: Service CRUD** - Add create/update/delete endpoints and forms
2. **Phase 2: Projects & Scenarios** - Backend models and frontend pages
3. **Phase 3: Topology Editor** - Monaco code editor + React Flow canvas with sync
4. **Phase 4: Infrastructure** - Backend with encryption + frontend forms
5. **Phase 5: Tabbed Workspace** - Zustand tab state + iFrame container
6. **Phase 6: Execution & PDF** - MAESTRO integration + PDFKit report generation

## Dependencies

- Sprint 0 POC (complete) - Authentication, service listing, frontend shell
- Monaco Editor package (@monaco-editor/react)
- React Flow package (@xyflow/react)
- PDFKit package for PDF generation

## Risks

| Risk | Mitigation |
|------|------------|
| React Flow learning curve | Use examples from documentation, keep canvas simple |
| MAESTRO API contract unclear | Design for flexible iFrame URL construction |
| Large topology files | Implement client-side validation and size limits |
| iFrame CSP restrictions | Document fallback approaches for blocked dashboards |

## Success Criteria

- All D2.1 services manageable (create, update, delete, version)
- Projects and scenarios can be created and linked
- Topology editor supports both YAML and visual editing
- Infrastructure credentials stored encrypted
- Scenario execution triggers MAESTRO in tab
- PDF reports generated for completed executions
