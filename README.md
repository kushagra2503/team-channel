# Condominium

Shared workspace for teams building with AI agents — projects, tracks, a shared vault, and a dashboard to stay aligned.

## Quick start

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build
pnpm daemon          # API on http://127.0.0.1:9473
pnpm seed            # Optional demo projects: Beacon, Silo, Forge
pnpm dashboard       # UI on http://127.0.0.1:5173
```

**Your own data (no seed):**

```bash
pnpm teambridge init
pnpm teambridge project create --name "My App"
pnpm teambridge start my-track
```

Optional: add `PEXELS_API_KEY` to `.env` for flower profile photos.

## What's in the repo

| Package / app | Role |
|---------------|------|
| `packages/core` | Shared types and contracts |
| `packages/daemon` | Local API (`pnpm daemon`) |
| `packages/vault` | Vault materialization |
| `packages/mcp` | MCP server (in progress) |
| `apps/dashboard` | Web UI (`pnpm dashboard`) |
| `packages/cli` | CLI (`pnpm teambridge`) |

Local state lives in `.teambridge/` at the git root.

## Docs

| Doc | Contents |
|-----|----------|
| [agent.md](./agent.md) | Vision and mental model |
| [CLAUDE.md](./CLAUDE.md) | Agent working guide (build, test, conventions) |
| [PROGRESS.md](./PROGRESS.md) | What's built vs. pending, by phase |
| [docs/CONCEPTS.md](./docs/CONCEPTS.md) | Projects, tracks, vault |
| [docs/daemon-api.md](./docs/daemon-api.md) | HTTP API |
| [docs/dashboard.md](./docs/dashboard.md) | Dashboard setup |
| [todo.md](./todo.md) | Build checklist |

## Tests

```bash
pnpm test
pnpm test:integration
```
