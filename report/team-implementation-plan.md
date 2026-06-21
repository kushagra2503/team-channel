# Teambridge Team Implementation Plan

This document is the execution plan for the first Teambridge build. `agent.md` is the product vision and long-lived agent guide; this file is the team plan for Nihal, Kushagra, and Ronish.

## TL;DR

- Build Teambridge contract-first. Shared schemas live in `packages/core/src/contracts/` and every package imports from there.
- Nihal handles backend/core: daemon, local state, Supabase relay, event ordering, checkpoints, vault materialization, conflicts.
- Kushagra handles CLI and agent UX: `teambridge` commands, Claude Code hooks, auto-injection, inbox commands, terminal workflows.
- Ronish handles MCP and dashboard: MCP resources/tools, dashboard views, inbox/conflict UI, workspace visibility.
- Keep the first version local-first. Supabase is the relay and bootstrap layer, not where agents directly reason.
- Use one workspace vault. No personal/team/task vault split.
- Use git worktrees for isolated code edits. Use events and vault for shared context.
- Do not allow remote execution. Agents can message, publish, and read context, but they cannot operate another teammate's machine.

## Product Shape

Teambridge creates a shared coding session around one repo/task.

```bash
teambridge init
teambridge start <session_name> [base_ref]
teambridge join <session_name>
teambridge enter <session_name>
```

`start` records an immutable `base_commit`. Every joiner gets their own worktree/branch from that same commit. The shared context is not the code folder. The shared context is an event-sourced workspace vault that every teammate materializes locally.

## Team Responsibilities

### Nihal: Backend/Core

Responsible for:

- `packages/core`
- `packages/daemon`
- `packages/vault`
- Supabase schema and relay behavior
- Local `better-sqlite3` state
- Workspace/event/checkpoint/conflict contracts
- Event ordering with per-workspace `seq`
- Checkpoint builder lease and failover
- Vault materialization

Primary output:

- A daemon that can create/join workspaces locally, append events, materialize vault files, sync to Supabase, and recover from checkpoints.

### Kushagra: CLI/Agent UX

Responsible for:

- `packages/cli`
- Claude Code hooks
- User-facing command design
- Auto-injection flow
- Inbox CLI
- Vault read/search/debug CLI
- Good terminal ergonomics

Primary output:

- A `teambridge` CLI that makes start/join/status/ask/inbox/vault flows feel simple and requires no per-session flags in normal use.

### Ronish: MCP/Dashboard

Responsible for:

- `packages/mcp`
- `apps/dashboard`
- MCP resources and tools
- Workspace status UI
- Participants/branches/presence views
- Inbox and conflict UI

Primary output:

- Agents can use Teambridge through MCP, and humans can inspect workspace state through a local dashboard.

## Contract-First Rule

Before building a feature, define or update the shared contract first.

Contracts live here:

```text
packages/core/src/contracts/
├── api.ts
├── auth.ts
├── checkpoints.ts
├── config.ts
├── conflicts.ts
├── device.ts
├── errors.ts
├── events.ts
├── git.ts
├── inbox.ts
├── mcp.ts
├── participant.ts
├── presence.ts
├── vault.ts
├── workspace.ts
└── index.ts
```

Rules:

- Contract changes must be reviewed by all three before feature code depends on them.
- `createdAt` is display metadata only. Ordering uses `seq`.
- `base_ref` is only resolved during `start`. `join` uses recorded `base_commit`.
- Event payloads should describe context, not raw code diffs.
- Runtime validation can be added after the type shapes settle.

## Expected Package Layout

```text
packages/
├── core/                  # contracts, shared helpers, validation
├── cli/                   # teambridge command
├── daemon/                # local runtime authority
├── mcp/                   # HTTP MCP server
└── vault/                 # event -> vault materializer

apps/
└── dashboard/             # local dashboard served by daemon
```

## Core Behaviors

### Workspace Start

Command:

```bash
teambridge start <session_name> [base_ref]
```

Behavior:

- Resolve `base_ref` to immutable `base_commit`.
- Create workspace manifest.
- Create local worktree and branch for creator.
- Initialize local event log.
- Initialize workspace vault.
- Register workspace with daemon.
- If relay is enabled, create remote workspace row and first events.

### Workspace Join

Command:

```bash
teambridge join <session_name>
```

Behavior:

- Fetch workspace manifest.
- Use recorded `base_commit`.
- Fetch latest checkpoint.
- Fetch events after checkpoint `seq`.
- Materialize local vault.
- Create local worktree and branch.
- Register participant/device.

### Event Publishing

Events can be published by CLI, hooks, MCP tools, or daemon internals.

Required behavior:

- Append locally first when possible.
- Sync to relay when online.
- Backend assigns canonical per-workspace `seq`.
- Local daemon applies events ordered by `seq`.
- Use `dedupeKey` where duplicate publishes are possible.

Phase 1 should already use typed publish events locally. The CLI can expose a simple shorthand:

```bash
teambridge publish decision "Backend is the source of truth for invoice state."
teambridge publish observation "Frontend reads derived totals from the invoice API."
teambridge publish blocker "Need refresh-token behavior decided before UI retry logic."
teambridge publish test_result "pnpm test passed for billing package."
```

These map to `WorkspaceEvent.type` values such as `decision`, `observation`, `blocker`, and `test_result`. The vault materializer should route each event type to the right local vault files:

```text
decision       -> MEMORY.md, CURRENT_GOALS.md, day-logs/{date}.md
observation    -> MEMORY.md, topics/{topic}.md, day-logs/{date}.md
blocker        -> CURRENT_GOALS.md, conflicts.md when relevant
test_result    -> day-logs/{date}.md, CURRENT_GOALS.md when it changes status
attempt_failed -> MEMORY.md, day-logs/{date}.md
```

The hosted relay later adds cross-device ordering and sync. It should not change the local event model.

### Vault Materialization

The vault is a readable local projection of ordered events.

Default files:

```text
.teambridge/workspaces/{session_name}/vault/
├── MEMORY.md
├── CURRENT_GOALS.md
├── conflicts.md
├── people.md
├── projects/
├── day-logs/
├── topics/
├── procedures/
└── sessions/
```

Important:

- Do not merge vault folders across users.
- Materialize from events/checkpoints.
- `sessions/` is excluded from sync/injection by default.

### Checkpoints

Checkpoints speed up new joiners.

Behavior:

- Build checkpoints from `previous checkpoint + events ordered by seq`.
- Store checkpoint metadata and blob path remotely.
- Use a checkpoint lease so another online daemon can take over if the leader disappears.
- A missing checkpoint must not break sync; it only makes bootstrap slower.

### Conflicts

Conflict examples:

- Two decisions contradict each other.
- A vault patch conflicts with current materialized state.

Behavior:

- Emit `conflict_detected`.
- Materialize to `conflicts.md`.
- Resolve with `conflict_resolved` or a decision event.
- Never silently overwrite conflicting context.

### Inbox

Agent-to-agent communication is async and durable.

Allowed:

- Ask teammate/agent a question.
- Reply later.
- Show message in CLI/dashboard.
- Store ask/reply as events.

Blocked:

- Remote command execution.
- Remote file edits.
- Automatic branch commits based on teammate messages.

## Local Daemon API

The daemon should expose local HTTP endpoints for CLI, dashboard, hooks, and MCP package internals.

Initial endpoint shape:

```text
GET  /health
GET  /workspaces
POST /workspaces/start
POST /workspaces/join
GET  /workspaces/:workspaceId/status
GET  /workspaces/:workspaceId/participants
GET  /workspaces/:workspaceId/events
POST /workspaces/:workspaceId/events
GET  /workspaces/:workspaceId/vault/context
GET  /workspaces/:workspaceId/vault/read
GET  /workspaces/:workspaceId/vault/search
GET  /workspaces/:workspaceId/inbox
POST /workspaces/:workspaceId/inbox/ask
POST /workspaces/:workspaceId/inbox/reply
GET  /workspaces/:workspaceId/conflicts
POST /workspaces/:workspaceId/conflicts/resolve
```

All responses should use `ApiResult<T>` from contracts.

## MCP Contract

MCP is the primary agent-facing API.

Resources:

```text
teambridge://workspace
teambridge://participants
teambridge://vault/context
teambridge://inbox
teambridge://conflicts
```

Tools:

```text
team_publish
team_ask
team_reply
vault_search
vault_read
workspace_status
```

Workspace resolution must be explicit and deterministic:

- Prefer explicit query params or configured workspace ID.
- Accept headers from hook/agent wrapper when available.
- Use daemon `state.sqlite` to map CWD/worktree path to workspace.
- Use `.teambridge/.active` only as fallback.

## Supabase Contract

Tables:

```text
workspaces
participants
devices
workspace_events
workspace_vault_checkpoints
checkpoint_leases
inbox_messages
presence
```

`workspace_events` must include:

```text
id
workspace_id
seq
type
actor_id
device_id
payload
dedupe_key
created_at
```

`seq` is the canonical ordering field. Use a per-workspace monotonic sequence strategy in Postgres. Do not use device timestamps for replay ordering.

## Implementation Phases

### Phase 1: Local-First Foundation

Goal: Teambridge works on one machine with multiple local participants/worktrees before any hosted sync exists.

This phase proves the core product loop without Supabase, MCP, hooks, or dashboard polish. If this does not feel useful locally, remote sync will only hide problems.

Deliver:

- pnpm + TypeScript workspace setup
- Contract package builds
- CLI skeleton
- Daemon skeleton
- Local SQLite state
- `teambridge init`
- `teambridge start`
- `teambridge join`
- `teambridge status`
- Local event log
- Typed local publish events
- Event-type routing into vault files
- Local vault materialization
- Basic vault read/search

Workflow to achieve:

```bash
# Nihal starts a local workspace from main.
teambridge init
teambridge start billing-refactor main

# Teambridge creates Nihal's worktree and records the immutable base commit.
teambridge status
teambridge enter billing-refactor

# Kushagra is simulated locally as a second participant/worktree.
teambridge join billing-refactor --as kushagra

# Ronish is simulated locally as a third participant/worktree.
teambridge join billing-refactor --as ronish

# Nihal publishes context from his local worktree.
teambridge publish decision "Backend is the source of truth for invoice state; frontend only renders derived totals."

# Kushagra can read the same materialized vault from his own worktree.
teambridge vault read CURRENT_GOALS.md
teambridge vault search "invoice state"
```

Expected result:

- Two local worktrees can join the same workspace.
- Three simulated participants can have separate branches from the same `base_commit`.
- Typed events from one participant update the correct workspace vault files.
- The vault can be deleted and rebuilt from the local event log.
- Contracts are imported across packages.
- No part of the local workflow requires Supabase or internet access.

### Phase 2: Relay, Sync, and Bootstrap

Goal: Two devices can share context through Supabase.

Deliver:

- Supabase schema
- Auth/session flow
- Event insert with canonical `seq`
- Realtime subscriptions
- Offline queue/retry
- Checkpoint upload/download
- Checkpoint lease failover
- New joiner bootstrap
- Conflict events and `conflicts.md`

Workflow to achieve:

```bash
# Device A, Nihal
teambridge start billing-refactor main
teambridge publish observation "Refresh endpoint retries forever when token refresh fails."

# Device B, Kushagra
teambridge join billing-refactor
teambridge vault search "Refresh endpoint"

# Device A goes offline and publishes locally.
teambridge publish blocker "Need backend decision before changing retry UI."

# Device A reconnects. Device B receives the event and materializes it.
teambridge status
teambridge vault read CURRENT_GOALS.md

# Device C, Ronish, joins late.
teambridge join billing-refactor
teambridge vault read MEMORY.md
```

Expected result:

- Device A publishes an event and Device B materializes it.
- A new joiner can bootstrap from checkpoint + event replay.
- If checkpoint leader goes offline, another daemon can acquire lease.
- Events are replayed by canonical `seq`, not by `createdAt`.
- Offline events sync after reconnect without duplicates.
- Conflicts appear in `conflicts.md` instead of silently overwriting context.

### Phase 3: Agent UX, MCP, Dashboard

Goal: Agents and humans can use Teambridge naturally.

Deliver:

- HTTP MCP server
- MCP resources/tools
- Claude Code hook auto-injection
- Compact vault context
- Delta update injection
- `teambridge ask`
- `teambridge inbox`
- `teambridge reply`
- Dashboard workspace list
- Dashboard participants/branches/presence
- Dashboard inbox/conflicts views
- End-to-end dogfood workflow

Workflow to achieve:

```bash
# Kushagra enters his Teambridge worktree and starts Claude Code.
cd "$(teambridge enter billing-refactor)"
claude

# Claude automatically receives compact vault context through hooks.
# Claude can use MCP to publish, search, and ask.
```

Agent workflow to prove through MCP:

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

Human dashboard workflow:

```bash
teambridge dashboard
```

Expected dashboard state:

- Nihal, Kushagra, and Ronish appear with branches, presence, and last activity.
- Inbox shows open questions and replies.
- Conflicts are visible and can be resolved.
- Vault highlights show current goals, decisions, blockers, and recent changes.

Expected result:

- Claude Code gets context automatically inside a Teambridge worktree.
- Agent can publish/read/search/ask through MCP.
- Humans can see workspace state in dashboard.
- Normal use does not require per-session flags.
- No MCP tool can remotely execute commands on another teammate's machine.

## Review Checklist

Before merging any feature:

- Does it use the shared contracts?
- Does it preserve worktree isolation?
- Does it avoid remote execution?
- Does it use `seq` for event replay ordering?
- Does it work offline or degrade clearly?
- Does it keep normal UX free of per-session flags?
- Does it materialize vault state from events/checkpoints?
- Does it expose enough state for CLI/dashboard debugging?

