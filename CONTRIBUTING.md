# Contributing to MI Digital Twin Management Service

Welcome! We appreciate your interest in contributing. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## How to Report Issues

Report bugs and request features via [GitHub Issues](https://github.com/montimage-projects/mi-digitaltwin-management-service/issues). Include:

- A clear, descriptive title
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (OS, Node version, browser)

## Branch Strategy

- Branch from `main`
- Naming convention: `feat/<issue-number>-<description>` or `fix/<issue-number>-<description>`
- Keep branches short-lived and focused on a single concern

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code restructuring
- `chore:` — maintenance, tooling, dependencies
- `test:` — adding or updating tests

Examples:

- `feat: add scenario deployment to Kubernetes`
- `fix: resolve CI pipeline failures`
- `docs: update API reference with new endpoints`

## Pull Request Process

1. Fork the repository or create a feature branch
2. Make your changes on the branch
3. Open a pull request against `main`
4. Ensure all CI checks pass (quality, typecheck, test, build, security)
5. Request review from a maintainer
6. Address feedback and update the PR as needed
7. A maintainer merges once all checks pass and reviews are approved

## Coding Standards

- **ESLint** — run `npm run lint` before pushing
- **Prettier** — run `npm run format:check` to verify formatting
- **TypeScript** — strict mode enabled; run `npm run typecheck` to verify
- Follow existing patterns in the codebase

## Testing

- Tests use **Vitest** in the server workspace
- Run `npm test` before pushing to verify nothing is broken
- Add tests for new features and bug fixes

## Development Setup

Requirements:

- **Node.js** 20+
- **Docker & Docker Compose** (for MongoDB)

```bash
# Clone and install
git clone https://github.com/montimage-projects/mi-digitaltwin-management-service.git
cd mi-digitaltwin-management-service
npm install

# Configure environment
cp .env.example .env

# Start infrastructure
docker-compose up -d

# Start development servers
npm run dev
```

The backend runs on http://localhost:3000, the frontend on http://localhost:5173.

## Project Structure

```
.github/workflows/     # GitHub Actions CI/CD pipelines
.husky/                # Git hooks configuration
client/                # React frontend (Vite + TypeScript)
server/                # Express backend (TypeScript)
docs/                  # Technical documentation
k8s/                   # Kubernetes manifests (Kustomize)
```

- `client/` — React 18, Vite, Tailwind CSS, shadcn/ui, React Query, Zustand
- `server/` — Express.js, MongoDB/Mongoose, Zod, JWT auth
- `docs/` — Architecture, API reference, deployment guides, playbooks
