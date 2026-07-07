# MI Digital Twin Management Service — Agent Context

## Critical Commands

```bash
npm run dev              # Full stack (server :3000 + client :5173)
npm run dev:server       # Backend only
npm run dev:client       # Frontend only
npm run build            # Client build + server typecheck
npm run lint             # ESLint client + server
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Prettier all files
npm run format:check     # Prettier check
npm run typecheck        # TypeScript strict mode (client + server)
npm test                 # Vitest server tests (requires MongoDB)
npm run security         # npm audit
```

## Architecture Map

- `client/` — React 18 + Vite + TypeScript. React Flow canvas, shadcn/ui, TanStack Query, Zustand, Monaco Editor.
- `server/` — Express.js + TypeScript + MongoDB/Mongoose. JWT auth, Zod validation, Kubernetes deployment service, SSE execution streaming.
- `k8s/` — Kustomize manifests (base + overlays: dev, prod, atlas).
- `docs/` — Architecture, API, deployment, troubleshooting.
- `.github/workflows/` — GitHub Actions CI (quality → typecheck → test → security → build).
- `.gitlab-ci.yml` — GitLab mirror pipeline (same stages).

## Hard Rules

- **NEVER** commit `.env` files — they are gitignored. Always reference `.env.example`.
- **ALWAYS** push to **both** remotes: `origin` (GitHub) and `gitlab`. Use `git push origin <branch> && git push gitlab <branch>`.
- **NEVER** rewrite entire files for single-line fixes. Target precise edits.
- **ALWAYS** run `npm run lint` and `npm run typecheck` before committing if code changed.
- **ALWAYS** use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- Server tests require MongoDB — start with `docker-compose up -d mongodb` or set `MONGODB_URI`.
- **NEVER** expose secrets, API keys, or tokens in code or config files.
- When changing more than 3 files, stop and confirm the approach first.

## Workflow Preferences

- For non-trivial tasks (3+ steps, architecture decisions), write a short plan before acting.
- Make minimal changes for small fixes; propose larger refactors separately.
- When ambiguous, ask before proceeding — don't guess.
- Prove changes with diffs, test output, or logs. Don't claim success without evidence.

## Token Efficiency
- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Just do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.
