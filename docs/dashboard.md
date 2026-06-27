# Dashboard

Local web UI for browsing projects, tracks, team members, and vault highlights.

## Run locally

From the repo root (requires daemon + seed for demo data):

```bash
pnpm install
pnpm build
pnpm daemon          # http://127.0.0.1:9473
pnpm seed            # Beacon, Silo, Forge demo data
pnpm dashboard       # Vite dev server (default host 127.0.0.1)
```

Open the URL Vite prints (typically `http://127.0.0.1:5173`).

## Configuration

| Variable / param | Purpose |
|------------------|---------|
| `VITE_TEAMBRIDGE_DAEMON_URL` | Daemon base URL (default `http://127.0.0.1:9473`) |
| `VITE_TEAMBRIDGE_REPO_ROOT` | Git repo root sent as `repoRoot` on API calls |
| `?daemonBaseUrl=` query | Override daemon URL |
| `?repoRoot=` query | Override repo root |

The daemon resolves `repoRoot` to the git toplevel. Optional `.env` at repo root supplies `PEXELS_API_KEY` for real flower avatars.

## Routes

| Path | Screen |
|------|--------|
| `/` | Redirects to `/projects` |
| `/projects` | Project picker (Beacon, Silo, Forge after seed) |
| `/projects/:projectId` | Track dashboard for one project |

## Layout (`/projects/:projectId`)

| Region | Content |
|--------|---------|
| Top bar | Project name, breadcrumbs |
| Left sidebar | Tracks in this project |
| Center | Vault highlights — sections from vault context, per-row color/assign/copy |
| Right sidebar | Project members (team roster), collapsible |

## Vault highlights

- Parses flat vault files grouped by path (`decisions.md`, `observations.md`, …).
- **Color** — marks a row; persisted as `[tb color=#…]` in the vault markdown file.
- **Assign** — assigns row to a teammate by name slug; persisted as `[tb assign=slug]`.
- Changes call `POST /workspaces/:trackId/vault/annotate` (track id = workspace id).

See [CONCEPTS.md](./CONCEPTS.md) for annotation syntax.

## Cache

Browser cache key: `tb_cache_v2_${daemonUrl}` (tracks, status, vault context). Hard refresh after daemon-side avatar or vault file changes if the UI looks stale.

## Tests

```bash
pnpm --filter @teambridge/dashboard test
```
