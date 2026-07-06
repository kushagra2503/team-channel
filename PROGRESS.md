# Condominium — Progress

Snapshot of what has been built so far and what remains. This is a status
digest; the authoritative checklist stays in [`todo.md`](./todo.md), and the
per-phase build plan lives in
[`report/team-implementation-plan.md`](./report/team-implementation-plan.md).

_Last updated: 2026-07-06._

## At a glance

| Phase | Theme | Status |
|-------|-------|--------|
| Phase 1 | Local-first foundation (daemon, CLI, vault, dashboard) | ✅ Complete |
| Phase 2 | Supabase relay + cross-device sync | 🟡 Relay MVP live; realtime/checkpoints/conflicts pending |
| Phase 3 | Agent UX (MCP server, hooks, inbox) | ⬜ Not started (resource/tool stubs only) |

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
- **CLI** (`packages/cli`, `pnpm teambridge`) — `init`, `status`,
  `project create|list`, `start`, `join`, `enter`, `publish`,
  `vault read|context|search`, `ws show|who|branches`, plus relay commands
  `login`, `sessions`, `list`, `sync`, `status relay`.
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

**Still pending:**

- Supabase Realtime websocket subscription in the daemon (polling is the
  current correctness path).
- Checkpoint upload/download (`tc_workspace_vault_checkpoints`,
  `teambridge-checkpoints` bucket).
- Checkpoint lease acquisition/failover (`tc_checkpoint_leases`).
- Late-joiner bootstrap from checkpoint + replay (currently full event replay).
- Conflict detection/resolution plumbing and conflict UX (CLI + dashboard).
- Polished relay UI for sync health, presence, checkpoints, conflicts.

## Phase 3 — Agent UX, MCP, inbox ⬜

Not started beyond stubs. MCP resource/tool **names** exist in
`packages/mcp/src/resources.ts` and `tools.ts`, but there is no MCP HTTP
server, no Claude Code hook auto-injection, and no `ask`/`inbox`/`reply` CLI.

Planned:

- MCP HTTP server + resources (`teambridge://workspace`, `…/participants`,
  `…/vault/context`, `…/inbox`, `…/conflicts`) and tools (`team_publish`,
  `team_ask`, `team_reply`, `vault_search`, `vault_read`, `workspace_status`).
- Claude Code hook auto-injection (compact context + teammate deltas) with no
  per-session flags.
- Inbox: `teambridge ask|inbox|reply`, dashboard approval UI.

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
