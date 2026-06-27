# Daemon HTTP API

Local backend at `http://127.0.0.1:9473` (default). All JSON responses use `ApiResult<T>` from `@teambridge/core`.

## Common query parameters

| Param | Used on | Description |
|-------|---------|-------------|
| `repoRoot` | Most routes | Git repo root; daemon resolves to toplevel via `git rev-parse` |
| `maxBytes` | `GET .../vault/context` | Context size limit (default from `.teambridge/config.json`) |
| `path` | `GET .../vault/read` | Vault file name, e.g. `decisions.md` |

POST bodies may include `repoRoot` when the route accepts a JSON body.

## Health and config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/config?repoRoot=` | Read repo config |
| POST | `/config/init` | Create `.teambridge/config.json` |

## Projects and tracks (read)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects?repoRoot=` | List projects |
| GET | `/projects/:projectId/members?repoRoot=` | Project member roster |
| GET | `/projects/:projectId/tracks?repoRoot=` | Tracks belonging to project |
| GET | `/projects/:projectId/members/:memberId/avatar?repoRoot=` | Avatar PNG for member display name |
| GET | `/tracks?repoRoot=` | List all tracks (alias of workspace list) |
| GET | `/workspaces?repoRoot=` | List tracks (legacy name) |

## Workspaces / tracks (mutations and session data)

`:workspaceId` accepts track **id** or **session name** (`getWorkspaceByIdentifier`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workspaces/start` | Create track, manifest, vault, creator participant |
| POST | `/workspaces/join` | Join track; optional `worktreePath` |
| GET | `/workspaces/:id/status?repoRoot=` | Workspace + participants + `lastSeq` |
| GET | `/workspaces/:id/events?repoRoot=` | Event log |
| POST | `/workspaces/:id/events` | Append `publish` event |
| GET | `/workspaces/:id/vault/read?repoRoot=&path=` | Read one vault file |
| GET | `/workspaces/:id/vault/context?repoRoot=` | Concatenated vault context for agents/UI |
| POST | `/workspaces/:id/vault/annotate` | Update row color/assign in markdown (see below) |
| POST | `/workspaces/:id/vault/rebuild` | Rebuild vault from `events.jsonl` |
| GET | `/workspaces/:id/participants/:participantId/avatar?repoRoot=` | Avatar PNG for participant |

### POST `/workspaces/:id/vault/annotate`

Persists vault row metadata in the markdown file.

```json
{
  "repoRoot": "/path/to/repo",
  "path": "observations.md",
  "itemText": "Exact list item text without the leading dash",
  "color": "#ef4444",
  "assign": "flynn-o-brien"
}
```

- Pass `null` for `color` or `assign` to clear that field.
- Omit a field to leave it unchanged.
- `assign` must match `avatarNameSlug(displayName)` — see [CONCEPTS.md](./CONCEPTS.md).

Response: `{ file, context }` with updated file content and fresh vault context.

## Avatars (by name)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/avatars/by-name/:slug?repoRoot=` | Stable avatar by display-name slug |

Slug must match `^[\w-]+$` after URL decoding. Used by the dashboard for all profile pictures.

Optional query params for dither tuning: `query`, `size`, `algorithm`, `bayerLevel`.

## Dev PFP (development)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/dev/pfp/preview` | Generate preview PNG + metadata headers |
| POST | `/dev/pfp/regenerate` | Regenerate stored avatar for `participantId` |

## Not implemented (contract placeholders)

These appear in team plans but have **no handler** in the daemon today:

- `GET .../vault/search`
- Inbox routes (`/inbox`, ask/reply)
- Conflict routes (`/conflicts`, resolve)
- `GET .../participants` as a standalone list (participants come from `/status`)

## Related docs

- [CONCEPTS.md](./CONCEPTS.md) — Project/track vocabulary, hybrid naming
- [dashboard.md](./dashboard.md) — UI that calls this API
- [phase-1-design-choices.md](./phase-1-design-choices.md) — Event/vault semantics
