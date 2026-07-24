# Coord — Progress

Snapshot of what has been built so far and what remains. This is a status
digest; the authoritative checklist stays in [`todo.md`](./todo.md), and the
per-phase build plan lives in
[`report/team-implementation-plan.md`](./report/team-implementation-plan.md).

_Last updated: 2026-07-25._

## At a glance

| Phase | Theme | Status |
|-------|-------|--------|
| Phase 1 | Local-first foundation (daemon, CLI, vault, dashboard) | ✅ Complete |
| Phase 2 | Supabase relay + cross-device sync | ✅ Relay live; conflicts implemented |
| Phase 3 | Agent UX (MCP server, hooks, inbox) | ✅ MCP, hooks, inbox, dashboard polish live |

## What works today

Runnable end-to-end on one machine:

```bash
pnpm install
pnpm build
pnpm coord init             # auto-start daemon, profile, folder-named project
pnpm coord work my-track    # create/join worktree and launch the coding agent
pnpm seed                   # optional demo projects: Beacon, Silo, Forge
pnpm dashboard              # React UI on http://127.0.0.1:5173
pnpm test:integration       # full CLI + daemon flow, incl. vault-flow.test.mjs
```

- **Daemon** (`packages/daemon`) — local HTTP API: health, config discovery,
  SQLite state, projects/tracks, participants, worktrees, publish events,
  vault materialization + rebuild, `vault context`, FTS5 vault search, avatars,
  repo context, and Supabase relay mirroring/sync.
- **CLI** (`packages/cli`, `pnpm coord`) — simplified onboarding through
  `init` (auto-start daemon + folder-named project) and `work` (create/join a
  worktree + launch Claude Code, Codex, Cursor, Ghost, or a shell). Bare
  `coord` selects a track and launches the default agent. Lower-level commands
  remain available: `status`, `project create|list`, `start`, `join`, `enter`,
  `publish`, `vault read|context|search`, `context` (compact vault context +
  teammate deltas), `hook install|uninstall|status`, `ws show|who|branches`,
  plus relay commands `login`, `sessions`, `list`, `sync`, `status relay`.
- **Vault** (`packages/vault`) — flat Phase 1 files (`decisions.md`,
  `observations.md`, `blockers.md`, `test-results.md`, `attempts.md`)
  materialized from `events.jsonl`; row annotations (`[tb color= assign=]`)
  survive rebuild.
- **Dashboard** (`apps/dashboard`) — project picker, track sidebar, project
  members, vault highlights with color/assign, participant branch/agent,
  vault search + single-file viewer, worktree "enter" affordance, sidebar
  repo context panel, relay-session merge, inbox panel with reply actions,
  conflicts panel with resolution, recent teammate deltas, and teammate delta
  updates.
- **Core** (`packages/core`) — shared contracts in `src/contracts/`, the
  starting point for any API/event/MCP change.
- **MCP** (`packages/mcp`) — MCP server over stdio transport using
  `@modelcontextprotocol/sdk`. Five resources registered (`workspace`,
  `participants`, `vault/context`, `inbox`, `conflicts`) and six tools
  (`team_publish`, `vault_search`, `vault_read`, `workspace_status`,
  `team_ask`, `team_reply`) — all calling the daemon. Workspace resolution
  from explicit params, launcher environment, local `state.sqlite` worktree
  mapping, or `.coord/.active` fallback. `coord work` configures the MCP server
  for Claude Code and Codex automatically; it can also be started directly
  with `coord mcp`. Integration tests
  spawn the server over stdio and verify JSON-RPC handshake, resource/tool
  lists, live resource reads, and full ask/reply/conflict flows.

## Phase 1 — Local-first foundation ✅

All Phase 1 steps and the pass example in `todo.md` are checked off:

- Three simulated participants with separate branches from the same
  `base_commit`.
- `publish` events targeting flat vault files; filtering by `targetFile`.
- `vault context` returns `includedPaths`, `lastSeq`, `truncated`.
- Vault can be deleted and rebuilt from `events.jsonl`.
- Covered end-to-end by `tests/integration/vault-flow.test.mjs` and
  `tests/integration/cli-flow.test.mjs`.

## Phase 2 — Supabase relay 🟡

**Live-verified (relay MVP):**

- Migration `supabase/migrations/001_teambridge_relay.sql` applied: `tc_`
  tables, indexes, RLS, private checkpoint bucket, Realtime publication.
- `tc_append_event` RPC assigns canonical per-workspace `seq` and dedupes by
  `dedupeKey`.
- Daemon relay identity/device registration; mirrors projects/sessions/
  participants after login; queues failed publishes in `pending_remote_events`.
- Push/pull sync (autonomous polling + manual `coord sync`); remote
  events rebuild the local vault.
- CLI: `login`, `sessions`, `list`, `sync`, `status relay`; `join` can import a
  remote session before creating the worktree.
- Dashboard merges relay sessions with local sessions.

**Live-verified after relay MVP:**

- Supabase Realtime websocket subscription in the daemon, with polling/manual
  sync kept as fallback.
- Checkpoint upload/download (`tc_workspace_vault_checkpoints`,
  `teambridge-checkpoints` bucket).
- Checkpoint lease acquisition/failover (`tc_checkpoint_leases`).
- Late-joiner bootstrap from checkpoint + replay.
- Presence heartbeat through `tc_presence`, reflected into participant status.
- Two-user verification with `nihal@test.com` and `kush@test.com`: session
  discovery, join, checkpoint bootstrap, realtime receive, presence, remote
  events, and cleanup.

**Live-verified after inbox/conflict pass:**

- Conflict-marker parsing from publish text, `conflict_detected` /
  `conflict_resolved` events, `conflicts.md` materialization, CLI conflict
  commands, and dashboard conflict resolve UI.

## Phase 3 — Agent UX, MCP, inbox ✅

**Live-verified:**

- MCP server over stdio transport using `@modelcontextprotocol/sdk` with
  `StdioServerTransport` (Claude Code compatible). Start with
  `coord mcp`.
- Five MCP resources registered: `coord://workspace` (with relay status),
  `coord://participants`, `coord://vault/context`,
  `coord://inbox`, `coord://conflicts` — all backed by daemon calls.
- Six MCP tools registered: `team_publish`, `vault_search`, `vault_read`,
  `workspace_status`, `team_ask`, `team_reply` — all calling the daemon.
- Workspace resolution from explicit params, local `state.sqlite` worktree
  mapping, or `.coord/.active` fallback.
- Integration tests spawning the server over stdio, verifying initialize
  handshake, resources/list, tools/list, and workspace-resolution errors.
- MCP resource contracts include relay-backed workspace state with graceful
  degradation when relay is unavailable.
- Dashboard relay screens: sync health, realtime event feed, checkpoint state,
  presence panel.
- Dashboard inbox panel with live `team_ask`/`team_reply` flow and reply
  affordance for messages addressed to the local user.
- Dashboard conflicts panel showing open/resolved conflicts, affected paths,
  and a resolution action for open conflicts.
- Dashboard teammate delta panel based on per-participant context pointers
  (`lastSeenSeq`), with a "Mark seen" update action.
- Dashboard recent teammate deltas panel in the Relay view.
- Daemon inbox endpoints (`GET /workspaces/:id/inbox`,
  `POST /workspaces/:id/inbox/ask`, `POST /workspaces/:id/inbox/:id/reply`) and
  conflict endpoints (`GET /workspaces/:id/conflicts`,
  `POST /workspaces/:id/conflicts/:id/resolve`) with participant-level actor
  validation.
- `coord ask|inbox|reply` CLI commands, live MCP ask/reply, and end-to-end
  local verification in `tests/integration/inbox-conflicts-flow.test.mjs`.
- Conflict-marker parser, `conflicts.md` materialization, and `coord
  conflicts` CLI command.
- Daemon hook/delta context endpoints (`/context/hook`, `/context/deltas`) for
  IDE hooks and dashboard callers, covered by
  `tests/integration/context-hook-flow.test.mjs`.
- Mock-relay end-to-end verification for offline/reconnect retry and late
  joiner checkpoint bootstrap in
  `tests/integration/relay-reconnect-bootstrap.test.mjs`.
- Claude Code hook auto-injection: `coord hook install` writes a
  SessionStart hook into `.claude/settings.json` that runs `coord
  context`, so an agent opening a worktree gets shared context with no
  per-session flags. `coord context` emits smarter compact vault context
  (empty files dropped, per-file titles stripped, bullets deduped) plus a
  delta of what changed since a per-participant last-seen `seq`
  (`--peek`/`--deltas-only`/`--json`). Covered by
  `tests/integration/context-hook-flow.test.mjs`.

## Known gaps / follow-ups

- **Naming hybrid:** UI/docs say "track"; several APIs and types still say
  `workspace` (`/workspaces/*` mutations vs. `/projects` + `/tracks` reads).
  A future breaking change may rename to `/tracks/*`. See
  [`docs/CONCEPTS.md`](./docs/CONCEPTS.md).
- No packaged installer / IDE auto-launch daemon yet.

## Where to look next

| Want to… | Read |
|----------|------|
| Understand the vision + rules | [`agent.md`](./agent.md) |
| Working conventions for agents | [`CLAUDE.md`](./CLAUDE.md) |
| Vocabulary (project/track/vault) | [`docs/CONCEPTS.md`](./docs/CONCEPTS.md) |
| HTTP API surface | [`docs/daemon-api.md`](./docs/daemon-api.md) |
| CLI worktree behavior | [`docs/cli-worktrees.md`](./docs/cli-worktrees.md) |
| Phase 1 event/vault rules | [`docs/phase-1-design-choices.md`](./docs/phase-1-design-choices.md) |
| Full task checklist | [`todo.md`](./todo.md) |
