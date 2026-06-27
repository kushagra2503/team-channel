# Dashboard

Local web UI for browsing projects, tracks, team members, and vault highlights.

## Run locally

From the repo root:

```bash
pnpm install
pnpm build
pnpm daemon          # http://127.0.0.1:9473
pnpm dashboard       # Vite dev server (default host 127.0.0.1)
```

**Demo data:** `pnpm seed` loads Beacon, Silo, Forge.

**Your own data (CLI, same backend the dashboard reads):**

```bash
pnpm teambridge init
pnpm teambridge project create --name "My App" --description "Optional"
pnpm teambridge track start my-track
```

`project create` sets your default project so `track start` links the track to the correct project sidebar without passing `--project`.

Then open the dashboard — your project, track name, roster avatar, and vault shell appear without seed.

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

Two identity layers: **project team** (roster) vs **track participants** (who is on this track / branch).

| Region | Content |
|--------|---------|
| Top bar | Project name, breadcrumbs |
| Left sidebar (top) | Repo context — local path (opens in Finder), branch, remote, last push (links to commit when known) |
| Left sidebar (middle) | Tracks in this project |
| Left sidebar (footer) | Track participants — agents on the selected track with branch names |
| Center | Vault highlights — sections from vault context, per-row color/assign/copy |
| Right sidebar | Project team roster, collapsible |

Vault assign chips use **first name only**; track participant rows show full name + branch.

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
pnpm test:integration   # repo root — CLI init → project → track against live daemon
```
