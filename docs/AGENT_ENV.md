# Agent Environment Notes

Machine-readable environment notes so an agent (human or AI) can take a fresh
clone to a built state using only this file plus the repository files.
Serves milestone **ME** of `MODERNIZATION_PLAN.md` (task Pre.1).

## Toolchain

| Component | Requirement                                            | Notes                                                                                                       |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Node.js   | `>=20` (`engines` floor in `package.json`)             | Dev machine runs v24.11.1; GitLab CI runs node:22-slim (`node:22.23.1-bookworm-slim`, see `.gitlab-ci.yml`) |
| npm       | Ships with Node; npm workspaces (`client/`, `server/`) | Do not use bun/yarn/pnpm workspaces commands                                                                |
| Git       | Any recent version                                     | Husky hooks installed via the `prepare` script                                                              |

## Install

```bash
npm ci
```

- Installs exactly what is pinned in `package-lock.json` across both
  workspaces.
- Lockfiles are consolidated: `package-lock.json` (root/client/server) is the
  single resolution source. `bun.lock` files are untracked and gitignored —
  do not run `bun install` and never commit a `bun.lock`.

## Environment variables

Example files exist at three levels: `.env.example` (root/deployment),
`server/.env.example`, and `client/.env.example`.

| Variable         | Required                                                                     | Default | Notes                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`     | Yes — validation throws and startup aborts if unset or shorter than 32 chars | none    | Enforced by Zod in `server/src/config/env.ts`. Generate with `openssl rand -base64 48`                                                                                |
| `ENCRYPTION_KEY` | Yes — validation throws and startup aborts if unset or shorter than 16 chars | none    | Enforced by Zod in `server/src/config/env.ts`; placeholder/example values are refused by the startup checks in every `NODE_ENV`. Generate with `openssl rand -hex 16` |
| `ADMIN_PASSWORD` | Yes — validation throws and startup aborts if unset or shorter than 8 chars  | none    | Enforced by Zod in `server/src/config/env.ts`; known defaults (`intact2025`, `admin`, `password`) are refused by admin seeding                                        |

Other variables (`PORT`, `MONGODB_URI`, `CORS_ORIGIN`, ...) have safe
development defaults — see `server/src/config/env.ts` for the full schema.

For local development you can simply export the required secrets:

```bash
export JWT_SECRET="$(openssl rand -base64 48)"
export ADMIN_PASSWORD="<choose-a-strong-password>"
export ENCRYPTION_KEY="$(openssl rand -hex 16)"
```

`ENCRYPTION_KEY` is SHA-256 derived into the AES-256 key, so any value at or
above the 16-character floor works. Never rotate it once credentials have been
stored: already-encrypted `Infrastructure.credentials` become undecryptable.

## Recorded commands

Run from the repository root:

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run build`     | Builds the client bundle then typechecks/builds the server      |
| `npm run typecheck` | `tsc --noEmit` for client and server                            |
| `npm run lint`      | ESLint for client and server                                    |
| `npm run test`      | Runs the server test suite (`vitest`) via `npm run test:server` |

## Server test suite

`npm run test` works out of the box — no exported secrets needed. The vitest
config (`server/vitest.config.ts`) loads `server/tests/setup.ts`, which
injects the same CI-mirrored `JWT_SECRET`, `ADMIN_PASSWORD` and
`ENCRYPTION_KEY` values used by `.github/workflows/ci.yml` whenever a variable
is not already set in your shell (an explicit export still wins).

Note: this applies to tests only. Running the server itself still requires real
`JWT_SECRET`, `ADMIN_PASSWORD` and `ENCRYPTION_KEY` values.

Additional note: server e2e tests connect to MongoDB at
`mongodb://127.0.0.1:27017/...` by default (override with
`SEED_TEST_MONGODB_URI`). Without a reachable MongoDB those tests skip rather
than fail.

## Quick start for a fresh clone

```bash
git clone <repo-url> && cd mi-digitaltwin-management-service
npm ci
npm run build       # reach a built state
npm run typecheck && npm run lint && npm run test
```
