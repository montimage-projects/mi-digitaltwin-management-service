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

### Lint Thresholds

ESLint warnings are advisory everywhere — only errors block, both in the pre-commit hook (via lint-staged) and in CI.

### Pre-Commit Hooks & Bypass Policy

The `.husky/pre-commit` hook runs lint-staged (format + lint on staged files) and type checks; dependency auditing is owned exclusively by CI's security job, not by local hooks.

Bypassing hooks with `git commit --no-verify` is permitted only for exceptional cases (e.g., committing WIP to a personal branch or working around a broken toolchain). Never bypass hooks on shared or release branches — CI remains the final quality gate regardless.

## Testing

- Tests use **Vitest** in the server workspace
- Run `npm test` before pushing to verify nothing is broken
- Add tests for new features and bug fixes

### Regression-Test Policy

Every bug fix that touches source code **must** include a regression test that
proves the specific failure mode cannot re-occur. The test must follow the
**failing-then-passing** pattern:

1. **Describe the exact bug** — what input / condition triggered it.
2. **Assert the old (broken) behaviour would have failed** — if you could
   revert the fix, the test must red.
3. **Assert the fixed behaviour passes** — the test must green with the fix.

When a regression test for a given fix does not yet exist, **backfill one**
before merging. The test should be small, deterministic, and self-contained
(no network, no external services beyond the in-memory test DB).

**Example** — a fix that stopped the server from crashing when the seed
marker could not be written:

```ts
it('does not crash when the seed marker write fails', async () => {
  // Simulate a read-only data dir by making writeFile throw.
  const writeFileSpy = vi.spyOn(fsPromises, 'writeFile').mockRejectedValue(new Error('EACCES'));

  // The fix: ensureDataDir catches mkdir errors and the marker write
  // is wrapped in try/catch — the server must NOT throw.
  await expect(runSeedIfNeeded()).resolves.toBeUndefined();

  writeFileSpy.mockRestore();
});
```

**CI configuration fixes** that change shell logic (awk filters, exit codes,
job dependencies) also get a structural test that validates the configuration
document itself, because CI files are not directly executable:

```ts
it('accepts signed-with-sbom in the image signature gate', () => {
  // Regression for: signed-with-sbom was counted as unsigned.
  const statusLines = ['status=signed', 'status=signed-with-sbom', 'status=dry-run'];
  const unsignedCount = statusLines.filter((line) => {
    const [, value] = line.split('=');
    return value !== 'signed' && value !== 'signed-with-sbom';
  }).length;
  expect(unsignedCount).toBe(1); // only dry-run is unsigned
});
```

Run `npm test` after adding a regression test to confirm the full suite still
passes.

### Running Tests

```bash
# Run the full suite
npm test

# Run only server tests
npm run test:server

# Run only client tests
npm run test:client
```

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
