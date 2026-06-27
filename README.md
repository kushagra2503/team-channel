# Teambridge

Local-first coordination for teams using AI coding agents: shared vault context, separate git worktrees, and a dashboard to browse projects, tracks, and team notes.

## Quick start

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build
pnpm daemon          # API on http://127.0.0.1:9473
pnpm seed            # Demo projects: Beacon, Silo, Forge
pnpm dashboard       # UI on http://127.0.0.1:5173 (see Vite output)
```

Optional: add `PEXELS_API_KEY` to `.env` at the repo root for real flower profile photos.

## Monorepo layout

| Package / app | Role |
|---------------|------|
| `packages/core` | Shared contracts, types, avatar/vault helpers |
| `packages/daemon` | Local HTTP server (`pnpm daemon`) |
| `packages/vault` | Event → markdown materialization |
| `packages/mcp` | MCP server (stub / in progress) |
| `apps/dashboard` | React dashboard (`pnpm dashboard`) |
| `packages/cli` | Planned — not shipped yet |

State and avatars live under `.teambridge/` in the git repo root (`state.sqlite`, `workspaces/`, `avatars/`).

## Documentation

| Doc | Contents |
|-----|----------|
| [agent.md](./agent.md) | Product vision and mental model |
| [docs/CONCEPTS.md](./docs/CONCEPTS.md) | Project → Track → Vault glossary |
| [docs/daemon-api.md](./docs/daemon-api.md) | HTTP API reference |
| [docs/dashboard.md](./docs/dashboard.md) | Dashboard setup and routes |
| [docs/phase-1-design-choices.md](./docs/phase-1-design-choices.md) | Phase 1 vault/event invariants |
| [todo.md](./todo.md) | Team checklist |
| [report/team-implementation-plan.md](./report/team-implementation-plan.md) | Build plan by owner |

When you add daemon routes or dashboard behavior, update **CONCEPTS** and **daemon-api** in the same PR.

## Tests

```bash
pnpm test
```

## Repo name

This git repository is `team-channel`; the product name is **Teambridge**.
