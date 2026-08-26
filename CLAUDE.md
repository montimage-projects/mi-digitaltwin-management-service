# CLAUDE.md — MI Digital Twin Management Platform

npm workspaces monorepo: React 18 + Vite SPA in `client/`, Node 20+ Express +
Mongoose API in `server/`. Environment setup, env vars, and toolchain caveats
live in @docs/AGENT_ENV.md — read it before your first build or test run.

## Commands

Run from the repo root (npm workspaces only):

| Task      | Command             | Notes                                           |
| --------- | ------------------- | ----------------------------------------------- |
| Install   | `npm ci`            | Never `bun install` — see Hard rules            |
| Build     | `npm run build`     | Client bundle, then server typecheck            |
| Test      | `npm test`          | Server vitest suite; no exported secrets needed |
| Typecheck | `npm run typecheck` | `tsc --noEmit` for client and server            |
| Lint      | `npm run lint`      | ESLint for both workspaces                      |
| Dev       | `npm run dev`       | Server and client concurrently                  |

## Architecture

- `client/src/` — React SPA (`pages/`, `components/`, `store/`); Vite dev proxy forwards `/api` to the server.
- `server/src/` — Express app layered `routes/` → `services/` → `models/` (Mongoose); Zod-validated config in `config/env.ts`.
- `docs/` — API reference, architecture, deployment, and workflow docs.

## Hard rules

- IMPORTANT: use `npm ci` / npm workspace commands only. `package-lock.json`
  is the sole dependency resolution source; `bun.lock` is untracked and
  gitignored — never reintroduce it.
- `npm test` needs no exported secrets: `server/tests/setup.ts` injects a
  CI-mirrored `JWT_SECRET` for vitest only. Running the server itself still
  requires exporting one, e.g.
  `export JWT_SECRET="$(openssl rand -base64 48)"`.
- Never commit `.env` files or secrets; use the `.env.example` templates.
- Husky pre-commit runs lint-staged plus typechecks on both workspaces — fix
  the failure; never bypass hooks with `--no-verify`.
- E2E tests silently skip without MongoDB at `mongodb://127.0.0.1:27017`
  (override via `SEED_TEST_MONGODB_URI`) — a green suite is not e2e proof.

## Workflow

- Keep changes minimal and scoped; match surrounding code style (prettier +
  eslint enforce formatting through pre-commit).
- Before pushing: `npm run typecheck && npm run lint && npm test`.
- Commits follow Conventional Commits: `<type>(<scope>): <description> (#<issue>)`.

## Token Efficiency

- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Just do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.
