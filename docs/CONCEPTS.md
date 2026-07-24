# Coord Concepts

Canonical vocabulary for the Coord codebase and dashboard. Use these terms in UI copy and new docs.

## Hierarchy

```text
Project
  └── Track  (one coordinated work session, e.g. "auth-provider-swap")
        └── Vault  (flat markdown files: decisions, observations, …)
```

- **Project** — Organizational container for a product or initiative. Has a roster of **project members** (names, status, avatars). Example seed projects: Beacon, Silo, Forge (see `scripts/seed-demo.mjs`).
- **Track** — A scoped piece of work within a project. Maps to a git session with its own vault, event log, and **participants** (people/agents active on that track). User-facing UI says "track"; several APIs and types still say **workspace** for backward compatibility.
- **Vault** — Materialized markdown under `.coord/workspaces/{sessionName}/vault/`. Built from `events.jsonl`; not the cross-device source of truth in Phase 1 (events are).

## Two identity layers

| Layer | Type | Scope | Used for |
|-------|------|-------|----------|
| Project roster | `ProjectMember` | Project | Team sidebar, project-level display names and status |
| Track session | `Participant` | Track (workspace) | Per-track branch, agent, vault author chips |

Do not collapse these: a person is a **project member** once per project and a **participant** on each track they join.

## Naming map (hybrid until full API rename)

| Concept | UI / docs | SQLite | HTTP (today) | On disk |
|---------|-----------|--------|--------------|---------|
| Track | track | `tracks` table | `/workspaces/*` mutations; `GET /tracks` list | `.coord/workspaces/{sessionName}/` |
| Workspace type | — | — | `Workspace` in `@coord/core` | same as track dir |
| Project | project | `projects`, `project_members` | `GET /projects`, … | rows in `state.sqlite` |

**Intentional hybrid:** reads expose `/projects` and `/tracks`; start/join/events/vault still use `/workspaces/*`. A future breaking change may rename those paths to `/tracks/*`.

## Avatars

- Display names map to a URL-safe **slug** (`avatarNameSlug`) — apostrophes become hyphens (`Flynn O'Brien` → `flynn-o-brien`).
- On-disk id: `name_{slug}` under `.coord/avatars/`.
- Primary dashboard URL: `GET /avatars/by-name/:slug`.
- Flower images come from Pexels when `PEXELS_API_KEY` is set; otherwise procedural fallback.

## Vault row annotations

Optional metadata on vault list items, stored **in the markdown file** (not in the event log):

```markdown
- [tb color=#ef4444 assign=flynn-o-brien] Auth0 token refresh adds 40ms on cold sessions.
```

- `color` — `#RRGGBB` hex (dashboard highlight).
- `assign` — project member / participant **slug** (stable across tracks).

Written via `POST /workspaces/:id/vault/annotate`. Survives vault rebuild (extracted before replay, reapplied after). See `docs/daemon-api.md` and `packages/core/src/vault-annotations.ts`.

## Local user profile

- Stored at `.coord/user.json` after `coord init` (first name, last name, computed `displayName`).
- Same `displayName` is used for project roster rows and track participants when using the CLI.
- Avatar PNG is generated immediately via the daemon (`name_{slug}`); dashboard loads it through `/avatars/by-name/:slug`.
- Optional `defaultProjectId` — CLI sets this when you create a project so `coord start` links sessions to the right project sidebar.

## Phase 1 vs later

| Shipped locally | Planned |
|-----------------|---------|
| Daemon HTTP API, flat vault, `publish` events | Full CLI (publish, join, enter, vault search) |
| Dashboard: projects, tracks, vault highlights | MCP HTTP server wiring (resource/tool stubs exist) |
| CLI: `init`, `project create`, `start`, `join`, `status` | Supabase relay, inbox, conflicts UI |
| Seed script (`pnpm seed`) | Full `/tracks/*` API rename |
| Name-based avatars, vault annotations | |

Phase 1 event/vault rules remain in `docs/phase-1-design-choices.md`.
