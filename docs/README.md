# Documentation

Welcome to the INTACT Digital Twin Management Platform documentation. This guide provides comprehensive technical documentation for developers, operators, and contributors.

## Quick Navigation

| Section                                             | Description                              |
| --------------------------------------------------- | ---------------------------------------- |
| [Architecture](architecture/overview.md)            | System design, components, and data flow |
| [Database](database/schema.md)                      | MongoDB schemas and relationships        |
| [Design](design/ui-patterns.md)                     | UI patterns and styling conventions      |
| [Installation](installation/prerequisites.md)       | Prerequisites and configuration          |
| [Integration](integration/maestro.md)               | External service integrations            |
| [Troubleshooting](troubleshooting/common-issues.md) | Common issues and debugging              |
| [Playbooks](playbooks/deployment.md)                | Deployment and development guides        |

## Playbooks

Step-by-step guides for common workflows:

- **[Deployment Playbook](playbooks/deployment.md)** - Deploy the complete service stack to production
- **[Development Playbook](playbooks/development.md)** - Set up your local development environment

## Documentation by Role

### For Developers

1. Start with the [Development Playbook](playbooks/development.md)
2. Review [Architecture Overview](architecture/overview.md)
3. Understand [Database Schema](database/schema.md)
4. Follow [UI Patterns](design/ui-patterns.md) for frontend work

### For DevOps/Operators

1. Check [Prerequisites](installation/prerequisites.md)
2. Follow the [Deployment Playbook](playbooks/deployment.md)
3. Reference [Troubleshooting](troubleshooting/common-issues.md) for issues

### For Contributors

1. Read the [Architecture Overview](architecture/overview.md)
2. Understand [Data Flow](architecture/data-flow.md)
3. Review [Styling Conventions](design/styling.md)

## Module Documentation

Each module has its own README with quick-start instructions:

- [Client Module](../client/README.md) - React frontend application
- [Server Module](../server/README.md) - Express backend API

## Documentation Standards

All documentation in this project follows these conventions:

- **Diagrams**: Use Mermaid syntax exclusively
- **Links**: Use relative paths for internal cross-references
- **Format**: Keep sections concise and actionable
- **Updates**: Include documentation updates in PRs when changing functionality

## Related Resources

- [Root README](../README.md) - Project overview and quick start
- [OpenSpec](../openspec/project.md) - Spec-driven development conventions
- [CLAUDE.md](../CLAUDE.md) - AI assistant configuration
