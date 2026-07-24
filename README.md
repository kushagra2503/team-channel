# Coord

Shared workspace for teams building with AI agents — projects, tracks, a shared vault, and a dashboard to stay aligned.

## Quick start

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build
```

To use the development build as `coord` from any repository:

```bash
npm link
cd /path/to/your/project
coord init
coord work my-track
```

`coord init` starts the local daemon when needed, creates your profile, and
creates a project named after the repository folder. `coord work` creates or
joins the track worktree and launches your configured agent there. Passing
`--claude`, `--codex`, `--cursor`, or `--shell` overrides the agent for one
run. After setup, bare `coord` selects a track and launches the default agent.

For dashboard development:

```bash
pnpm seed            # Optional demo projects: Beacon, Silo, Forge
pnpm dashboard       # UI on http://127.0.0.1:5173
```

When running without the global development link, prefix commands with
`pnpm`, for example:

```bash
pnpm coord init
pnpm coord work my-track
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
| `packages/cli` | CLI (`pnpm coord`) |

Local state lives in `.coord/` at the git root.

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
