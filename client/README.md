# Client Module

React frontend application for the MI Digital Twin Management Service.

## Overview

The client is a single-page application (SPA) built with React, TypeScript, and Vite. It provides the user interface for managing cybersecurity services, digital twin projects, and scenario topologies.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- Backend server running (see [server/README.md](../server/README.md))

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`.

## Available Scripts

| Script               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start Vite development server with HMR             |
| `npm run build`      | Build for production (runs TypeScript check first) |
| `npm run preview`    | Preview production build locally                   |
| `npm run lint`       | Run ESLint                                         |
| `npm run lint --fix` | Fix auto-fixable lint issues                       |

## Project Structure

```
src/
 components/ # React components
 ui/ # shadcn/ui primitives
 layout/ # Layout components
 topology/ # Topology editor components
 services/ # Service-related components
 projects/ # Project-related components
 scenarios/ # Scenario-related components
 pages/ # Route page components
 lib/ # Utilities and API client
 store/ # Zustand state stores
 hooks/ # Custom React hooks
 types/ # TypeScript type definitions
 App.tsx # Root component with routing
 main.tsx # Application entry point
 index.css # Global styles and Tailwind
```

## Environment Variables

| Variable       | Description     | Default                 |
| -------------- | --------------- | ----------------------- |
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |

## Technology Stack

| Technology      | Purpose                   |
| --------------- | ------------------------- |
| React 19        | UI framework              |
| TypeScript      | Type safety               |
| Vite            | Build tool and dev server |
| Tailwind CSS    | Utility-first styling     |
| shadcn/ui       | Component library         |
| React Query     | Server state management   |
| Zustand         | Client state management   |
| React Router v7 | Client-side routing       |
| React Flow      | Topology canvas           |
| Monaco Editor   | YAML editing              |

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test --coverage
```

## Building for Production

```bash
# Build
npm run build

# Output will be in dist/
```

The build process:

1. Runs TypeScript type checking
2. Bundles with Vite
3. Outputs optimized assets to `dist/`

## Development Guidelines

### Adding Components

Use shadcn/ui CLI to add components:

```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
```

### Code Style

- ESLint + Prettier for formatting
- Functional components with hooks
- Named exports preferred

### State Management

- **Server state**: React Query for API data
- **Client state**: Zustand for UI state

## Troubleshooting

### Blank Page

Check browser console for errors. Common causes:

- API URL misconfigured
- Build errors
- Missing environment variables

### HMR Not Working

```bash
# Restart dev server
npm run dev
```

### Type Errors

```bash
# Run type check
npx tsc --noEmit
```

## Next Steps

- **Getting Started?** → [Development Guide](../docs/DEVELOPMENT.md)
- **Building Components?** → [Component Reference](../docs/COMPONENTS.md)
- **Need API?** → [API Reference](../docs/API.md)
- **Need Help?** → [Troubleshooting](../docs/troubleshooting/common-issues.md)

## Related Documentation

- [Frontend Architecture](../docs/architecture/frontend.md) - Component structure and patterns
- [Component Reference](../docs/COMPONENTS.md) - UI component API and usage
- [UI Patterns](../docs/design/ui-patterns.md) - Design system and conventions
- [Styling Guide](../docs/design/styling.md) - CSS/Tailwind guidelines
- [Development Guide](../docs/DEVELOPMENT.md) - Full development workflow
- [Development Playbook](../docs/playbooks/development.md) - Step-by-step setup

---

Maintained by [Montimage](https://montimage.eu).
