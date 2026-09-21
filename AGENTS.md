# AGENTS.md — AI Agent Guide

Entry point for AI coding agents working in this repository. It maps agents to
the authoritative context files — it intentionally holds no command canon of
its own.

## Start here

1. Read [CLAUDE.md](CLAUDE.md) — single source of truth for commands,
   architecture, hard rules, and workflow.
2. Read [docs/AGENT_ENV.md](docs/AGENT_ENV.md) — environment setup, required
   env vars (`JWT_SECRET`), and toolchain caveats.

**IMPORTANT:** Do not duplicate recorded commands or hard rules from
`CLAUDE.md` here or in new docs. If a command or rule changes, update
`CLAUDE.md` and link to it.

## Documentation map

| Doc                                        | Read when                                     |
| ------------------------------------------ | --------------------------------------------- |
| [docs/API.md](docs/API.md)                 | Changing server routes or client API calls    |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Day-to-day development and contribution setup |
| [docs/COMPONENTS.md](docs/COMPONENTS.md)   | Working on React components                   |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md)     | Editing GitHub Actions or docs-quality checks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)   | Touching Docker, K8s, or Render deployment    |

## Agent conventions

- Fresh-session read order: `CLAUDE.md` → `docs/AGENT_ENV.md` → task-specific
  docs from the map above.
- Run all tooling from the repository root with npm workspace commands
  (see `CLAUDE.md`) — never bun/yarn/pnpm equivalents.
- Keep edits minimal and scoped; one logical change per commit following the
  Conventional Commits format defined in `CLAUDE.md`.
- Subagent definitions belong in `.claude/agents/`; none are currently defined —
  do not invent them.
- New markdown must pass the repo's markdown link-check and lint workflows
  (see `docs/WORKFLOWS.md`).

## Token Efficiency

- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Just do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.
