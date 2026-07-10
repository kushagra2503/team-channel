# Condominium — Progress

Snapshot of what has been built so far and what remains. This is a status
digest; the authoritative checklist stays in [`todo.md`](./todo.md), and the
per-phase build plan lives in
[`report/team-implementation-plan.md`](./report/team-implementation-plan.md).

_Last updated: 2026-07-08._

## At a glance

| Phase | Theme | Status |
|-------|-------|--------|
| Phase 1 | Local-first foundation (daemon, CLI, vault, dashboard) | ✅ Complete |
| Phase 2 | Supabase relay + cross-device sync | 🟡 Relay live; conflicts pending |
| Phase 3 | Agent UX (MCP server, hooks, inbox) | 🟡 MCP server live; inbox/hooks pending |

## What works today

Runnable end-to-end on one machine:

```bash
pnpm install
pnpm build
pnpm daemon                 # HTTP API on http://127.0.0.1:9473
pnpm seed                   # optional demo projects: Beacon, Silo, Forge
pnpm dashboard              # React UI on http://127.0.0.1:5173
pnpm test:integration       # full CLI + daemon flow, incl. vault-flow.test.mjs
```

- **Daemon** (`packages/daemon`) — local HTTP API: health, config discovery,
  SQLite state, projects/tracks, participants, worktrees, publish events,
  vault materialization + rebuild, `vault context`, FTS5 vault search, avatars,
  repo context, and Supabase relay mirroring/sync.
- **CLI** (`packages/cli`, `pnpm teambridge`) — `init` (with `--relay
  local|supabase`), `status`, `project create|list`, `start`, `join`, `enter`,
  `publish`, `vault read|context|search`, `context` (compact vault context +
  teammate deltas), `hook install|uninstall|status` (Claude Code
  auto-injection), `ws show|who|branches`, plus relay commands `login`,
  `sessions`, `list`, `sync`, `status relay`.
- **Vault** (`packages/vault`) — flat Phase 1 files (`decisions.md`,
  `observations.md`, `blockers.md`, `test-results.md`, `attempts.md`)
  materialized from `events.jsonl`; row annotations (`[tb color= assign=]`)
  survive rebuild.
- **Dashboard** (`apps/dashboard`) — project picker, track sidebar, project
  members, vault highlights with color/assign, participant branch/agent,
  vault search + single-file viewer, worktree "enter" affordance, sidebar
  repo context panel, relay-session merge.
- **Core** (`packages/core`) — shared contracts in `src/contracts/`, the
  starting point for any API/event/MCP change.
- **MCP** (`packages/mcp`) — MCP server over stdio transport using
  `@modelcontextprotocol/sdk`. Five resources registered (`workspace`,
  `participants`, `vault/context`, `inbox` stub, `conflicts` stub) and six
  tools (`team_publish`, `vault_search`, `vault_read`, `workspace_status` —
  all live; `team_ask`, `team_reply` — stubs returning not-implemented).
  Workspace resolution from explicit params or `.teambridge/.active` fallback.
  Start with `teambridge mcp`. Integration tests spawn the server over stdio
  and verify JSON-RPC handshake, resource/tool lists, and stub errors.

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
- Push/pull sync (autonomous polling + manual `teambridge sync`); remote
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

**Still pending:**

- Conflict detection/resolution plumbing and conflict UX (CLI + dashboard).

## Phase 3 — Agent UX, MCP, inbox 🟡

**Live-verified:**

- MCP server over stdio transport using `@modelcontextprotocol/sdk` with
  `StdioServerTransport` (Claude Code compatible). Start with
  `teambridge mcp`.
- Five MCP resources registered: `teambridge://workspace` (with relay status),
  `teambridge://participants`, `teambridge://vault/context`,
  `teambridge://inbox` (stub), `teambridge://conflicts` (stub).
- Six MCP tools registered: `team_publish`, `vault_search`, `vault_read`,
  `workspace_status` (all calling the daemon); `team_ask`, `team_reply`
  (stubs returning `isError: true` — blocked on daemon inbox endpoints).
- Workspace resolution from explicit params or `.teambridge/.active` fallback.
- Integration tests spawning the server over stdio, verifying initialize
  handshake, resources/list, tools/list, and stub error responses.
- MCP resource contracts include relay-backed workspace state with graceful
  degradation when relay is unavailable.
- Dashboard relay screens: sync health, realtime event feed, checkpoint state,
  presence panel.
- Claude Code hook auto-injection: `teambridge hook install` writes a
  SessionStart hook into `.claude/settings.json` that runs `teambridge
  context`, so an agent opening a worktree gets shared context with no
  per-session flags. `teambridge context` emits smarter compact vault context
  (empty files dropped, per-file titles stripped, bullets deduped) plus a
  delta of what changed since a per-participant last-seen `seq`
  (`--peek`/`--deltas-only`/`--json`). Covered by
  `tests/integration/context-hook-flow.test.mjs`.

**Still pending:**

- Inbox: `teambridge ask|inbox|reply`, dashboard approval UI.
- Daemon inbox endpoints (Nihal — Phase 3 Step 1).
- Daemon conflict resolve endpoint (Nihal — Phase 3 Step 1).
- Dashboard actions for approving replies and resolving conflicts.
- End-to-end tests for offline/reconnect sync and new joiner bootstrap.

## Known gaps / follow-ups

- **Naming hybrid:** UI/docs say "track"; several APIs and types still say
  `workspace` (`/workspaces/*` mutations vs. `/projects` + `/tracks` reads).
  A future breaking change may rename to `/tracks/*`. See
  [`docs/CONCEPTS.md`](./docs/CONCEPTS.md).
- No packaged installer / IDE auto-launch daemon yet.
- Offline/reconnect and new-joiner-bootstrap e2e tests are still pending.

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
