# Condominium TODO

Working checklist for building Condominium. Anything not checked is still pending.

## Done

- [x] Replace old viability/initial/final reports with `agent.md` as the product vision source of truth.
- [x] Preserve `report/team-implementation-plan.md` as the team execution plan.
- [x] Create this `todo.md` task list.
- [x] Create the core contracts directory at `packages/core/src/contracts/`.
- [x] Add the first-pass contract files:
  - `workspace.ts`
  - `participant.ts`
  - `device.ts`
  - `events.ts`
  - `inbox.ts`
  - `vault.ts`
  - `checkpoints.ts`
  - `conflicts.ts`
  - `api.ts`
  - `mcp.ts`
  - `config.ts`
  - `auth.ts`
  - `presence.ts`
  - `git.ts`
  - `errors.ts`
  - `index.ts`

## Phase 1: Local-First Foundation

Goal: one machine can simulate Nihal, Kushagra, and Ronish as separate participants with separate worktrees, one shared local event log, and one materialized workspace vault.

### Phase 1 Execution Order

- [ ] Step 1, everyone: agree on the current contract shapes in `packages/core/src/contracts/`.
- [ ] Step 2, everyone in parallel:
  - [x] Nihal: add `packages/core`, `packages/daemon`, and `packages/vault`.
  - [x] Kushagra: add `packages/cli` and CLI command parser skeleton.
  - [x] Ronish: add `packages/mcp` and `apps/dashboard` skeletons.
- [ ] Step 3, Nihal first:
  - [x] Add TypeScript build setup for core/backend packages.
  - [x] Convert contract types into runtime-validated schemas where needed.
  - [x] Add contract tests for workspace manifest shape, participant shape, publish event shape, vault context shape, and API result shape.
  - [x] Implement daemon startup and `GET /health`.
  - [x] Implement local config discovery.
  - [x] Implement local SQLite state using a Phase 1 SQLite adapter.
  - [x] Implement local workspace store.
- [ ] Step 4, Kushagra after daemon health/config exist:
  - [x] Implement `teambridge init` (profile + avatar via daemon).
  - [x] Implement `teambridge status`.
  - [x] Implement `teambridge project create` and `teambridge project list`.
  - [x] Wire CLI calls to the local daemon.
  - [x] Make CLI requests repo-aware: resolve the current working directory to the current git repo root and send that `repoRoot` to the daemon.
  - [x] Daemon discovers git repo root from cwd when started via `pnpm daemon` (walk up to `.git`).
  - [x] Implement `teambridge ws show <session_name>`.
  - [x] Implement `teambridge ws who <session_name>`.
  - [x] Implement `teambridge ws branches <session_name>`.
  - [ ] Keep daemon startup generic; normal users should not have to start the daemon with `--repo` (auto-detect shipped; background service / IDE launch still pending).
- [x] Step 5, Nihal backend workspace APIs:
  - [x] Nihal: implement daemon workspace create/join APIs and persist workspace manifests.
  - [x] Local user profile APIs (`GET/POST /user/profile`, flower avatar on init). (moved from Step 9 — backend API work, not dashboard UI)
  - [x] `POST /projects` + roster member upsert; start/join link tracks to projects. (moved from Step 9 — backend API work, not dashboard UI)
  - [x] Stub MCP resource names from contracts (`packages/mcp/src/resources.ts`, `tools.ts`). (moved from Step 9 — done early; real MCP server work is Phase 3 Step 2)
- [ ] Step 6, Kushagra workspace CLI after backend workspace APIs exist:
  - [x] Ronish/Kushagra: implement `teambridge track start [NAME]` (wraps `/workspaces/start`, links `projectId`, uses local profile).
  - [x] Kushagra: implement `teambridge start <session_name> [base_ref]` (north-star alias / full worktree+branch flow) — creates a real worktree/branch for the starter, symmetric with `track join`.
  - [x] Kushagra: implement `teambridge track join [NAME] --as <display_name>` — uses recorded `base_commit`, creates an isolated git worktree + branch `teambridge/<session>/<safeName>` under `.teambridge/worktrees/`, idempotent re-join. See `docs/cli-worktrees.md`.
  - [x] Kushagra: implement `teambridge enter <session_name>` — prints the resolved worktree path for `cd "$(teambridge enter NAME)"`.
- [x] Step 7, Nihal backend event and vault APIs:
  - [x] Nihal: implement local event append to `events.jsonl`.
  - [x] Nihal: implement the single local user event type: `publish`.
  - [x] Nihal: require publish `targetFile` as a vault-relative markdown path.
  - [x] Nihal: support flat Phase 1 target files: `decisions.md`, `observations.md`, `blockers.md`, `test-results.md`, `attempts.md`.
  - [x] Nihal: implement local vault materialization and vault rebuild from events.
  - [x] Nihal: implement basic `vault context` by concatenating flat vault files up to a byte/character limit and returning `truncated`.
- [x] Step 8, Kushagra vault CLI after backend event and vault APIs exist:
  - [x] Kushagra: implement `teambridge publish <target_file> <text>` — resolves the current track from the participant branch (`teambridge/<session>/<name>`), no `<session_name>` argument needed.
  - [x] Kushagra: implement `teambridge vault read <path>`.
  - [x] Kushagra: implement `teambridge vault search <query>` — backed by a real SQLite FTS5 index (`vault_search_index` in `state.sqlite`), kept consistent through `vault rebuild`. See `packages/daemon/src/index.ts` (`reindexVaultFile`) and the `GET /workspaces/:id/vault/search` route.
  - [x] Kushagra: implement `teambridge vault context`.
- [ ] Step 9, Ronish after daemon read endpoints exist:
  - [x] Stub dashboard API client against daemon response contracts.
  - [x] Show local workspace list (project picker + track sidebar).
  - [x] Show local participants (project members sidebar) — display name/status only; branch/agent are fetched but not rendered (see Dashboard milestone follow-ups below).
  - [x] Show vault file highlights (with color/assign annotations).
  - [x] CLI scaffold aligned with dashboard (`teambridge init`, `project create`, `track start` → same daemon data).
  - [x] Sidebar repo context panel (`GET /repo/context`, `POST /repo/open-path` — remote, branch, local path, last push + commit link).
  - [x] Vault chip first-name display (`participantFirstName`).
  - [x] Root ergonomics: `pnpm teambridge`, `pnpm dashboard:preview`, `VITE_TEAMBRIDGE_REPO_ROOT` baked at dashboard build.
  - [x] CLI integration tests in `tests/integration/` (`pnpm test:integration`).
- [ ] Step 10, everyone: prove the local pass example below.

### Dashboard milestone (Jun 2026)

Shipped on `feat/ronish-mcp-dashboard`:

- [x] Project → Track hierarchy in daemon (`GET /projects`, `/projects/:id/tracks`, `/tracks`)
- [x] Seed script (`pnpm seed`) — Beacon, Silo, Forge demo projects
- [x] React Router dashboard (`/` → project picker, `/projects/:projectId` → track view)
- [x] Name-based avatars (`GET /avatars/by-name/:slug`, member avatar routes)
- [x] Vault row annotations (`POST .../vault/annotate`, `[tb color= assign=]` in markdown)
- [x] Sidebar repo context panel (path, branch, remote, last push — full-width hover rows)
- [x] CLI ↔ dashboard parity (`init`, `project create`, `track start`, `status` — no seed required)
- [x] Integration tests for CLI + daemon (`tests/integration/`, `pnpm test:integration`)
- [x] Topbar cleanup (removed teammate count + note # chips)

Still pending: MCP HTTP server, inbox UI, conflicts UI, presence polish, `teambridge ask`/`inbox`/`reply`, packaged installer / auto-start daemon. `start`/`enter`/`publish`/`vault read|context|search`/`ws show|who|branches` are done on the CLI — see `docs/cli-worktrees.md` and `tests/integration/vault-flow.test.mjs` — but the dashboard was not updated alongside them, so it has no UI for several of these yet:

- [ ] Ronish: render participant `branch` and `agent` in `TrackParticipantsPanel.tsx` — the daemon's `/workspaces/:id/status` response already includes both per participant; the dashboard fetches but silently drops them today.
- [ ] Ronish: add a vault search UI (search box + ranked results list) calling the new `GET /workspaces/:id/vault/search` route — this SQLite FTS5-backed endpoint currently has zero dashboard consumer; `teambridge vault search` is CLI-only.
- [ ] Ronish: add a single-file vault viewer calling `GET /workspaces/:id/vault/read` — the dashboard only ever renders the concatenated `vault/context` blob (`VaultHighlights.tsx`), never an individual file; `teambridge vault read <path>` is CLI-only.
- [ ] Ronish: surface each participant's worktree path (or an "Enter" affordance) in the dashboard, mirroring `teambridge enter <session_name>` — currently only reachable from the CLI, no worktree-path concept exists in the UI.

CLI + dashboard dogfood (no seed):

```bash
pnpm build
pnpm daemon
pnpm teambridge init
pnpm teambridge project create --name "My App" --description "Local dogfood"
pnpm teambridge track start auth-redesign --project <project-id>
pnpm dashboard          # dev
# or: pnpm dashboard:preview   # production build
pnpm test:integration   # verify CLI + daemon end-to-end
```

### Phase 1 Pass Example

> **Runnable today:** `pnpm build`, `pnpm daemon`, then either `pnpm seed` + `pnpm dashboard` **or** the dogfood CLI flow above. Integration tests: `pnpm test:integration` (includes `tests/integration/vault-flow.test.mjs`, which runs the full flow below end-to-end). `start`/`enter`/`publish`/`vault read|context|search` are done. Note: `join` below is still `teambridge track join` — a bare `teambridge join` alias (matching `start`'s shorthand) was not in scope for this pass and remains a follow-up.

```bash
# Nihal starts the workspace from main.
teambridge init
teambridge start billing-refactor main

# Kushagra and Ronish are simulated locally as separate participants/worktrees.
teambridge track join billing-refactor --as kushagra
teambridge track join billing-refactor --as ronish

# Nihal publishes into a flat vault file (run from inside Nihal's worktree — see `teambridge enter`).
teambridge publish decisions.md "Backend is the source of truth for invoice state."

# Any participant can read/search the materialized vault (run from inside their own worktree).
teambridge vault read decisions.md
teambridge vault search "invoice state"
teambridge vault context
```

Pass when:

- [ ] Three local participants have separate branches from the same `base_commit`. (Proven for two participants in `tests/integration/vault-flow.test.mjs`; not yet run with three.)
- [x] A `publish` event with `targetFile` updates the correct flat vault file.
- [x] Filtering can work by `targetFile` for Phase 1.
- [x] `vault context` returns a concatenated flat-vault context with `includedPaths`, `lastSeq`, and `truncated`.
- [x] The vault can be deleted and rebuilt from `events.jsonl`. (Automated in `tests/integration/vault-flow.test.mjs` — calls `POST /vault/rebuild` and asserts search results are unchanged.)
- [x] No Supabase, MCP, hooks, or dashboard polish is required for this workflow.

Partial progress:

- [x] Single-participant CLI bootstrap + track start against live daemon (covered by `tests/integration/cli-flow.test.mjs`).
- [x] Dashboard reads vault context and annotations for seeded or CLI-created tracks.
- [x] Daemon implements publish materialization + vault rebuild APIs.
- [x] CLI publish/vault read/vault context/vault search all implemented and covered by `tests/integration/vault-flow.test.mjs` (two participants, `start` + `track join`, publish → read/context/search, `ws who`/`ws branches`).

## Phase 2: Supabase Relay and Cross-Device Sync

Goal: two or more real devices can sync context through Supabase, recover after offline work, and bootstrap late joiners from checkpoint + event replay.

### Phase 2 Execution Order

- [ ] Step 1, Nihal first:
  - Create Supabase project.
  - Define Postgres tables: `workspaces`, `participants`, `devices`, `workspace_events`, `workspace_vault_checkpoints`, `checkpoint_leases`, `inbox_messages`, `presence`.
  - Add Row Level Security policies.
  - Implement auth/session validation for daemon relay calls.
  - Implement canonical event insert with per-workspace monotonic `seq`.
- [ ] Step 2, Kushagra + Ronish in parallel while Nihal finishes relay internals:
  - Kushagra: implement CLI auth/login flow against mocked or early relay responses.
  - Kushagra: add relay mode configuration to `teambridge init`.
  - Kushagra: design `teambridge status` output for online/offline state, last synced `seq`, and pending local events.
  - Ronish: build dashboard screens for realtime event feed, participant presence, checkpoint state, and sync health using mocked events.
  - Ronish: update MCP resource contracts to include relay-backed workspace state.
- [ ] Step 3, Nihal next:
  - Implement Supabase Realtime subscriptions.
  - Implement offline queue and retry behavior.
  - Implement event dedupe via `dedupeKey`.
- [ ] Step 4, Kushagra after relay event APIs exist:
  - Update `teambridge start` to register workspace remotely when relay is enabled.
  - Update `teambridge join` to fetch remote manifest/checkpoint/events.
  - Update `teambridge status` to show real sync state.
  - Add clear CLI messages for reconnect/retry behavior.
- [ ] Step 5, Nihal + Ronish in parallel:
  - Nihal: implement checkpoint upload/download.
  - Nihal: implement checkpoint builder lease and failover.
  - Nihal: implement new joiner bootstrap from manifest, checkpoint, events after checkpoint `seq`, local vault materialization, and worktree from `base_commit`.
  - Ronish: show latest checkpoint `seq`, checkpoint age, and sync health in dashboard.
- [ ] Step 6, Nihal + Ronish + Kushagra in parallel:
  - Nihal: implement conflict detection primitives, conflict materialization into `conflicts.md`, and conflict resolution events.
  - Ronish: surface conflicts from `conflicts.md` and relay events in dashboard.
  - Kushagra: add CLI status output for checkpoint/bootstrap/conflict progress.
- [ ] Step 7, everyone: prove the cross-device pass example below.

### Phase 2 Pass Example

```bash
# Device A, Nihal
teambridge start billing-refactor main
teambridge publish observations.md "Refresh endpoint retries forever when token refresh fails."

# Device B, Kushagra
teambridge join billing-refactor
teambridge vault search "Refresh endpoint"

# Device A goes offline, publishes locally, then reconnects.
teambridge publish blockers.md "Need backend decision before changing retry UI."
teambridge status

# Device C, Ronish, joins late.
teambridge join billing-refactor
teambridge vault read observations.md
```

Pass when:

- [ ] Device A publishes an event and Device B materializes it.
- [ ] Offline events sync after reconnect without duplicates.
- [ ] Device C bootstraps from checkpoint + event replay.
- [ ] Events replay by canonical `seq`, not `createdAt`.
- [ ] Checkpoint builder failover works when the current leader disappears.

## Phase 3: Agent UX, MCP, Inbox, and Dashboard

Goal: agents and humans can use Teambridge naturally through hooks, MCP, inbox, and dashboard without per-session flags.

### Phase 3 Execution Order

- [ ] Step 1, Nihal first:
  - Implement hook context endpoint for compact vault context.
  - Implement delta context endpoint for teammate updates.
  - Implement inbox daemon endpoints.
  - Implement conflict resolve daemon endpoint.
  - Add daemon-side authorization checks for MCP and dashboard calls.
- [ ] Step 2, Ronish + Kushagra in parallel:
  - Ronish: implement MCP server over local HTTP.
  - Ronish: implement MCP workspace/worktree resolution using explicit query params, client CWD headers, local `state.sqlite` worktree path mapping, and `.teambridge/.active` fallback.
  - Ronish: implement MCP resources: `teambridge://workspace`, `teambridge://participants`, `teambridge://vault/context`, `teambridge://inbox`, `teambridge://conflicts`.
  - Kushagra: implement Claude Code hook auto-injection.
  - Kushagra: ensure normal use needs no per-session CLI flags.
  - Kushagra: upgrade Phase 1 `vault context` into smarter compact vault context generation UX.
  - Kushagra: implement delta injection for teammate updates.
- [ ] Step 3, Ronish + Kushagra in parallel after inbox endpoints exist:
  - Ronish: implement MCP tools: `team_publish`, `team_ask`, `team_reply`, `vault_search`, `vault_read`, `workspace_status`.
  - Kushagra: implement `teambridge ask`.
  - Kushagra: implement `teambridge inbox`.
  - Kushagra: implement `teambridge reply`.
  - Kushagra: add CLI affordances for unread inbox count and pending questions.
- [ ] Step 4, Ronish after dashboard APIs are stable:
  - [x] Implement dashboard shell (React Router, project picker, track sidebar).
  - [x] Show project members and vault highlights (color/assign annotations).
  - [x] Sidebar repo context for active track (git remote, branch, local path, last push).
  - [ ] Show workspace list, participants, branches, presence, inbox, conflicts, and vault highlights.
  - [ ] Add dashboard actions for approving replies and resolving conflicts.
  - [ ] Show recent teammate deltas and latest vault highlights.
- [ ] Step 5, Nihal while integrations land:
  - [x] Add end-to-end tests for CLI init → project → track → status (`tests/integration/`).
  - [ ] Add end-to-end tests for two local participants.
  - [ ] Add end-to-end tests for offline/reconnect sync.
  - [ ] Add end-to-end tests for new joiner bootstrap.
- [ ] Step 6, Kushagra + everyone:
  - Kushagra: document the first real dogfood workflow for Nihal, Kushagra, and Ronish.
  - Everyone: dogfood one real Teambridge session and fix gaps.

### Phase 3 Pass Example

```bash
# Kushagra enters his Teambridge worktree and starts Claude Code.
cd "$(teambridge enter billing-refactor)"
claude
```

Inside the agent session:

```text
team_publish({
  targetFile: "observations.md",
  payload: { text: "Frontend calls refresh endpoint without retry cap." }
})

vault_search({ query: "refresh endpoint" })

team_ask({
  to: "nihal",
  text: "Should backend return a terminal auth error after refresh failure?"
})
```

```bash
teambridge dashboard
```

Pass when:

- [ ] Claude Code receives compact context automatically inside a Teambridge worktree.
- [ ] Agent can publish, read, search, and ask through MCP.
- [ ] CLI inbox and dashboard show the same questions/replies.
- [ ] Dashboard shows participants, branches, presence, conflicts, and vault highlights.
- [ ] No MCP tool can remotely execute commands on another teammate's machine.

