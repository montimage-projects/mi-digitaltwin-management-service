# Change: Refine Project Documentation Structure

## Why

The current documentation is scattered across multiple locations (`README.md`, `DEPLOYMENT.md`, `dev-docs/`, `CLAUDE.md`) without a clear organizational hierarchy. Technical documents lack proper cross-referencing, and there's no centralized `docs/` directory for in-depth technical content. Developers need clear playbooks for deployment and feature development, and the existing ASCII diagrams should be replaced with maintainable Mermaid diagrams.

## What Changes

### Documentation Restructuring

- Create centralized `docs/` directory with categorized technical documentation
- Restructure root `README.md` to serve as primary index (overview, modules, license, contacts only)
- Add module-specific `README.md` files to `client/` and `server/` directories
- Migrate existing technical content from `DEPLOYMENT.md` and `dev-docs/` to appropriate `docs/` locations

### New Documentation Categories in `docs/`

- **Architecture**: System design, component diagrams, data flow
- **Database**: Schema documentation, model relationships, migration guides
- **Design**: UI/UX patterns, component library, styling guidelines
- **Troubleshooting**: Common issues, debugging guides, error resolution
- **Integration**: External service integrations (MAESTRO, MongoDB Atlas)
- **Installation**: Environment setup, prerequisites, configuration

### New Playbooks

- **Deployment Playbook** (`docs/playbooks/deployment.md`): Complete service stack deployment guide
- **Development Playbook** (`docs/playbooks/development.md`): Technical setup for feature development

### Diagramming Standard

- Convert all ASCII diagrams to Mermaid syntax
- Establish Mermaid as the exclusive diagramming standard

## Impact

- **Affected files:**
  - `README.md` (simplify to index)
  - `DEPLOYMENT.md` (migrate to `docs/playbooks/deployment.md`)
  - `client/README.md` (new)
  - `server/README.md` (new)
  - `dev-docs/*` (migrate relevant content to `docs/`)
  - New `docs/` directory structure

- **No code changes**: Documentation-only proposal

- **Benefits:**
  - Clear separation between quick-start (root README) and in-depth docs
  - Self-contained module documentation for independent development
  - Standardized diagramming improves maintainability
  - Playbooks enable consistent deployment and development workflows
