# CLAUDE.md

Operational guide for AI agents working in this repository. For the product
vision, mental model, and non-negotiable rules, read [`agent.md`](./agent.md)
first — this file covers how to build, test, and navigate the code.

## What this is

**Condominium** (npm name `teambridge`) — a shared workspace for teams building
with AI coding agents. Multiple developers work on the same task in separate git
branches while sharing context through a vault, a local daemon, a dashboard, and
(eventually) MCP tools. Current status lives in [`PROGRESS.md`](./PROGRESS.md).

## Repository layout

```text
packages/core       Shared types + contracts (src/contracts/) — start here
packages/daemon     Local HTTP API on :9473 (state, vault, relay)
packages/vault      Vault materialization from events.jsonl
packages/cli        `teambridge` CLI (commander)
packages/mcp        MCP resource/tool stubs (server not yet wired)
apps/dashboard      React + Vite + TanStack Query UI on :5173
supabase/           Phase 2 relay migration (tc_ tables)
tests/integration/  End-to-end CLI + daemon tests
docs/               Concepts, daemon API, worktrees, design choices, plans
report/             Team build plan + Phase 2 relay plan
```

Local runtime state lives in `.teambridge/` at the git root (SQLite at
`.teambridge/state.sqlite`, worktrees, vault, avatars).

## Commands

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build                 # pnpm -r build (build before running the CLI/daemon)
pnpm daemon                # HTTP API on http://127.0.0.1:9473
pnpm seed                  # optional demo projects (Beacon, Silo, Forge)
pnpm dashboard             # dev UI on http://127.0.0.1:5173
pnpm dashboard:preview     # production build + preview
pnpm teambridge <args>     # run the built CLI (node packages/cli/dist/index.js)
pnpm test                  # per-package unit tests (node --test)
pnpm test:integration      # builds, then runs tests/integration/*.test.mjs
```

The CLI runs against the built output, so `pnpm build` after changing CLI or
daemon code before exercising a flow.

## Conventions

- **Contracts first.** Any API, event, or MCP change starts in
  `packages/core/src/contracts/`. Feature code imports shared contracts from
  there (`project.ts`, `avatar.ts`, `vault-annotations.ts`, etc.).
- **Language/stack:** TypeScript on Node 22+, pnpm workspace. Zod for
  validation, `better-sqlite3` for local state, `execa` shelling to `git`,
  Hono/Fastify for HTTP, React + Vite + TanStack Query for the dashboard.
- **Tests:** unit tests are `*.test.cjs` (`node --test`) next to the code;
  integration tests are `tests/integration/*.test.mjs`, run serially.
- **Naming hybrid:** UI and docs say **track**; several APIs and types still
  say **workspace** (`/workspaces/*` mutations vs. `/projects` + `/tracks`
  reads, `.teambridge/workspaces/{sessionName}/` on disk). This is intentional
  until a future `/tracks/*` rename — see [`docs/CONCEPTS.md`](./docs/CONCEPTS.md).
- **Vault is a projection, not the truth.** `events.jsonl` is canonical
  (ordered by per-workspace `seq`, not timestamps); markdown vault files are
  materialized views and can always be rebuilt.

## Key rules (see `agent.md` for the full list)

1. Shared brain, separate hands — shared context in the vault, code edits in
   each user's own worktree.
2. Events are the source of truth; vault markdown is a materialized view.
3. Never merge local vault folders — checkpoints come from ordered events.
4. Use `seq`, not timestamps, for replay ordering.
5. No remote execution — agents can message and publish context, never run
   commands or edit another teammate's machine/branch.
6. The daemon is the local runtime authority; CLI, dashboard, hooks, and MCP
   all talk to it.

## Environment

Copy `.env.example` to `.env`. `PEXELS_API_KEY` is optional (procedural avatar
fallback otherwise). `SUPABASE_*` vars enable the Phase 2 relay — never expose
`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET` to browser/client code.

## Docs index

| Doc | Contents |
|-----|----------|
| [agent.md](./agent.md) | Vision, mental model, non-negotiable rules |
| [PROGRESS.md](./PROGRESS.md) | What's built vs. pending, by phase |
| [todo.md](./todo.md) | Full build checklist |
| [docs/CONCEPTS.md](./docs/CONCEPTS.md) | Projects, tracks, vault, naming map |
| [docs/daemon-api.md](./docs/daemon-api.md) | HTTP API surface |
| [docs/cli-worktrees.md](./docs/cli-worktrees.md) | CLI worktree behavior |
| [docs/phase-1-design-choices.md](./docs/phase-1-design-choices.md) | Phase 1 event/vault rules |
| [report/team-implementation-plan.md](./report/team-implementation-plan.md) | Team execution plan |
