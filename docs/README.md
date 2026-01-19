# Documentation Index

Complete technical documentation for the MI Digital Twin Management Service. Choose your path below based on your role and needs.

## Quick Start Guides

**Just getting started?**

1. **[Development Guide](DEVELOPMENT.md)** - Set up your local environment (5 min read)
2. **[Deployment Guide](DEPLOYMENT.md)** - Deploy to production (10 min read)
3. **[API Reference](API.md)** - All REST endpoints with examples (reference)

## Documentation by Role

### For Backend Developers

1. [Backend Architecture](architecture/backend.md) - Understand the Express API structure
2. [API Reference](API.md) - All endpoints, request/response formats, authentication
3. [Database Schema](database/schema.md) - MongoDB collections and fields
4. [Data Flow](architecture/data-flow.md) - Request flow from client to database
5. [Development Playbook](playbooks/development.md) - Local setup and testing
6. [Server Module Setup](../server/README.md) - Installation and scripts

### For Frontend Developers

1. [Frontend Architecture](architecture/frontend.md) - React component structure and layout
2. [Component Reference](COMPONENTS.md) - UI components, props, and usage patterns
3. [UI Patterns & Styling](design/ui-patterns.md) - Design system and conventions
4. [Styling Guide](design/styling.md) - CSS/Tailwind patterns and themes
5. [Development Playbook](playbooks/development.md) - Local setup and testing
6. [Client Module Setup](../client/README.md) - Installation and scripts

### For DevOps/Infrastructure

1. [Prerequisites](installation/prerequisites.md) - System requirements
2. [Deployment Guide](DEPLOYMENT.md) - Production deployment checklist
3. [Deployment Playbook](playbooks/deployment.md) - Step-by-step deployment
4. [External Services](integration/external-services.md) - Third-party integrations
5. [Troubleshooting](troubleshooting/common-issues.md) - Common issues and solutions
6. [Database Configuration](database/schema.md) - MongoDB setup and optimization

### For Contributors

1. [Architecture Overview](architecture/overview.md) - System design and components
2. [Data Flow](architecture/data-flow.md) - How requests move through the system
3. [Backend Architecture](architecture/backend.md) - Server structure
4. [Frontend Architecture](architecture/frontend.md) - Client structure
5. [Styling Guide](design/styling.md) - Code style and conventions
6. [Contribution Workflow](DEVELOPMENT.md#contributing) - How to contribute code

## Documentation by Topic

### Architecture & Design

| Document                                            | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| [System Overview](architecture/overview.md)         | High-level system design with Mermaid diagrams |
| [Backend Architecture](architecture/backend.md)     | Express API layers and patterns                |
| [Frontend Architecture](architecture/frontend.md)   | React component structure and state management |
| [Data Flow](architecture/data-flow.md)              | Request lifecycle through all layers           |
| [Database Schema](database/schema.md)               | MongoDB collections with field descriptions    |
| [Database Relationships](database/relationships.md) | Collection relationships and references        |

### Development

| Document                                         | Purpose                                  |
| ------------------------------------------------ | ---------------------------------------- |
| [Development Guide](DEVELOPMENT.md)              | Local environment setup and workflow     |
| [Development Playbook](playbooks/development.md) | Step-by-step setup instructions          |
| [UI Patterns](design/ui-patterns.md)             | Component patterns and best practices    |
| [Styling Guide](design/styling.md)               | Code style, Tailwind, and Prettier rules |

### Deployment & Operations

| Document                                       | Purpose                                 |
| ---------------------------------------------- | --------------------------------------- |
| [Deployment Guide](DEPLOYMENT.md)              | Production checklist and best practices |
| [Deployment Playbook](playbooks/deployment.md) | Docker/Docker Compose deployment steps  |
| [Prerequisites](installation/prerequisites.md) | System requirements and versions        |
| [Configuration](installation/configuration.md) | Environment variables and setup         |

### Integration & Extensibility

| Document                                              | Purpose                       |
| ----------------------------------------------------- | ----------------------------- |
| [External Services](integration/external-services.md) | Third-party services and APIs |
| [MAESTRO Integration](integration/maestro.md)         | Orchestrator setup and usage  |

### Reference

| Document                                            | Purpose                               |
| --------------------------------------------------- | ------------------------------------- |
| [API Reference](API.md)                             | Complete REST API endpoint reference  |
| [Component Reference](COMPONENTS.md)                | Frontend component props and examples |
| [Troubleshooting](troubleshooting/common-issues.md) | Common issues and solutions           |
| [Debugging Guide](troubleshooting/debugging.md)     | Debug techniques and tools            |

## Related Resources

### Project Configuration

- [Root README](../README.md) - Project overview and quick start
- [OpenSpec Project Guide](../openspec/project.md) - Project conventions and structure
- [OpenSpec Agents Guide](../openspec/AGENTS.md) - AI assistant guidelines
- [CLAUDE.md](../CLAUDE.md) - Claude Code configuration

### Module Documentation

- [Client Module](../client/README.md) - React frontend setup and structure
- [Server Module](../server/README.md) - Express backend setup and structure

## Documentation Standards

All documentation follows these conventions:

- **Diagrams**: Use [Mermaid](https://mermaid.js.org) syntax for all diagrams
- **Links**: Use relative paths for internal cross-references
- **Code Examples**: Include real, working examples where possible
- **Sections**: Keep sections concise, scannable, and actionable
- **Updates**: Include documentation updates in PRs when changing functionality
- **Organization**: Group related information into logical sections

## Directory Structure

```
docs/
 README.md # This file
 API.md # REST API reference
 COMPONENTS.md # Frontend component reference
 DEVELOPMENT.md # Development workflow guide
 DEPLOYMENT.md # Production deployment guide

 architecture/ # System design
 overview.md # High-level architecture
 backend.md # Backend structure
 frontend.md # Frontend structure
 data-flow.md # Request flow diagrams

 database/ # Data layer documentation
 schema.md # MongoDB collections
 relationships.md # Collection relationships

 design/ # Design & development standards
 ui-patterns.md # UI component patterns
 styling.md # Code style & conventions

 integration/ # External services
 external-services.md # Third-party integrations
 maestro.md # MAESTRO orchestrator

 installation/ # Setup & configuration
 prerequisites.md # System requirements
 configuration.md # Environment setup

 playbooks/ # Step-by-step guides
 development.md # Development setup
 deployment.md # Production deployment

 troubleshooting/ # Issues & debugging
 common-issues.md # FAQs and solutions
 debugging.md # Debug techniques
```

## Getting Help

- **Setup Issues?** → [Troubleshooting Guide](troubleshooting/common-issues.md)
- **API Questions?** → [API Reference](API.md)
- **Component Help?** → [Component Reference](COMPONENTS.md)
- **Deployment Help?** → [Deployment Guide](DEPLOYMENT.md)
- **Architecture Questions?** → [Architecture Overview](architecture/overview.md)
