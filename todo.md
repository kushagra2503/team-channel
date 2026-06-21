# Teambridge TODO

This is the working checklist for building Teambridge. Anything not checked is still pending.

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
  - Nihal: add `packages/core`, `packages/daemon`, and `packages/vault`.
  - Kushagra: add `packages/cli` and CLI command parser skeleton.
  - Ronish: add `packages/mcp` and `apps/dashboard` skeletons.
- [ ] Step 3, Nihal first:
  - Add TypeScript build setup for core/backend packages.
  - Convert contract types into runtime-validated schemas where needed.
  - Add contract tests for workspace manifest shape, event shape, inbox messages, and checkpoint metadata.
  - Implement daemon startup and `GET /health`.
  - Implement local config discovery.
  - Implement local SQLite state using `better-sqlite3`.
  - Implement local workspace store.
- [ ] Step 4, Kushagra after daemon health/config exist:
  - Implement `teambridge init`.
  - Implement `teambridge status`.
  - Wire CLI calls to the local daemon.
- [ ] Step 5, Nihal + Kushagra in parallel:
  - Nihal: implement daemon workspace create/join APIs and persist workspace manifests.
  - Kushagra: implement `teambridge start <session_name> [base_ref]`, resolve `base_ref` to immutable `base_commit`, and create creator worktree/branch.
  - Kushagra: implement `teambridge join <session_name>`, use recorded `base_commit`, and create participant worktree/branch.
  - Kushagra: implement `teambridge enter <session_name>`.
- [ ] Step 6, Nihal + Kushagra in parallel:
  - Nihal: implement local event append to `events.jsonl`.
  - Nihal: implement typed local publish events: `decision`, `observation`, `blocker`, `test_result`, `attempt_failed`.
  - Nihal: implement event-type routing into vault files.
  - Nihal: implement local vault materialization and vault rebuild from events.
  - Kushagra: implement `teambridge publish <type> <text>`.
  - Kushagra: implement `teambridge vault read <path>`.
  - Kushagra: implement `teambridge vault search <query>`.
- [ ] Step 7, Ronish after daemon read endpoints exist:
  - Stub MCP resource names from contracts.
  - Stub dashboard API client against daemon response contracts.
  - Show local workspace list.
  - Show local participants/branches.
  - Show vault file highlights.
- [ ] Step 8, everyone: prove the local pass example below.

### Phase 1 Pass Example

```bash
# Nihal starts the workspace from main.
teambridge init
teambridge start billing-refactor main

# Kushagra and Ronish are simulated locally as separate participants/worktrees.
teambridge join billing-refactor --as kushagra
teambridge join billing-refactor --as ronish

# Nihal publishes a typed local event.
teambridge publish decision "Backend is the source of truth for invoice state."

# Any participant can read/search the materialized vault.
teambridge vault read CURRENT_GOALS.md
teambridge vault search "invoice state"
```

Pass when:

- [ ] Three local participants have separate branches from the same `base_commit`.
- [ ] A typed publish event updates the correct vault files.
- [ ] The vault can be deleted and rebuilt from `events.jsonl`.
- [ ] No Supabase, MCP, hooks, or dashboard polish is required for this workflow.

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
teambridge publish observation "Refresh endpoint retries forever when token refresh fails."

# Device B, Kushagra
teambridge join billing-refactor
teambridge vault search "Refresh endpoint"

# Device A goes offline, publishes locally, then reconnects.
teambridge publish blocker "Need backend decision before changing retry UI."
teambridge status

# Device C, Ronish, joins late.
teambridge join billing-refactor
teambridge vault read MEMORY.md
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
  - Kushagra: implement compact vault context generation UX.
  - Kushagra: implement delta injection for teammate updates.
- [ ] Step 3, Ronish + Kushagra in parallel after inbox endpoints exist:
  - Ronish: implement MCP tools: `team_publish`, `team_ask`, `team_reply`, `vault_search`, `vault_read`, `workspace_status`.
  - Kushagra: implement `teambridge ask`.
  - Kushagra: implement `teambridge inbox`.
  - Kushagra: implement `teambridge reply`.
  - Kushagra: add CLI affordances for unread inbox count and pending questions.
- [ ] Step 4, Ronish after dashboard APIs are stable:
  - Implement dashboard shell.
  - Show workspace list, participants, branches, presence, inbox, conflicts, and vault highlights.
  - Add dashboard actions for approving replies and resolving conflicts.
  - Show recent teammate deltas and latest vault highlights.
- [ ] Step 5, Nihal while integrations land:
  - Add end-to-end tests for two local participants.
  - Add end-to-end tests for offline/reconnect sync.
  - Add end-to-end tests for new joiner bootstrap.
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
  type: "observation",
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

