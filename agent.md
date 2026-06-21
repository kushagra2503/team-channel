# Teambridge Agent Guide

This repository is for **Teambridge**, a local-first coordination layer for human teams using AI coding agents.

Teambridge lets multiple developers work on the same coding task with separate branches/worktrees while sharing the same evolving context through a workspace vault, MCP tools, and event sync.

For team execution details, keep and use `report/team-implementation-plan.md`. This file is the product vision; the report file is the build plan for Nihal, Kushagra, and Ronish.

## Product Vision

Teambridge is for teams where each developer has their own AI coding agent, but the agents need shared situational awareness.

Example:

```bash
teambridge start billing-v2 main
teambridge join billing-v2
cd "$(teambridge enter billing-v2)" && claude
```

Each teammate gets:

- A separate git worktree and branch from the same recorded `base_commit`
- A local materialized workspace vault at `.teambridge/workspaces/{session_name}/vault/`
- Shared context updates from teammate events
- MCP tools for agents to read, publish, ask, and inspect workspace state
- CLI/dashboard visibility into participants, branches, presence, inbox, and vault highlights

## Core Mental Model

```text
Supabase = canonical ordered event stream + checkpoints + presence + auth
Local daemon = local runtime authority
Local vault = materialized readable copy of shared context
MCP = agent-facing API
Hooks = passive auto-injection for Claude Code
Git = code and branches
```

Events notify everyone, then materialize locally, then all agents can use the updated context through MCP or injected deltas.

## Non-Negotiable Rules

1. **Shared brain, separate hands.** Shared context lives in the workspace vault. Code edits happen in each user's own worktree.
2. **Events are source of truth.** Markdown vault files are materialized views, not the canonical cross-device truth.
3. **No local vault folder merging.** Checkpoints are built from ordered events, not by merging Alice's and Bob's vault folders.
4. **Use `seq`, not timestamps.** Event replay uses per-workspace monotonic `seq`: the local daemon assigns it in local-only mode, and the relay assigns it in Supabase mode.
5. **No remote execution.** Agents can message and publish context. They cannot run commands or edit another teammate's machine/branch.
6. **Daemon is the local runtime authority.** CLI, dashboard, hooks, and MCP talk to the daemon.
7. **MCP is the primary agent API.** Hooks only make Claude Code feel automatic.
8. **Contracts first.** Any API/event/MCP change starts in `packages/core/src/contracts/`.

## Commands

Primary user-facing commands:

```bash
teambridge init
teambridge start <session_name> [base_ref]
teambridge join <session_name>
teambridge enter <session_name>
teambridge status
teambridge ws show <session_name>
teambridge ws who <session_name>
teambridge ws branches <session_name>
teambridge publish <type> <text>
teambridge ask <person> "question"
teambridge inbox
teambridge reply <message_id> "answer"
teambridge vault search <query>
teambridge vault read <path>
teambridge vault debug-snapshot
teambridge dashboard
```

`start` resolves `base_ref` to immutable `base_commit`. `join` always uses the recorded `base_commit`; it must not re-resolve `main` or any moving branch.

For local simulation and dogfooding, `start` and `join` may accept a display-name option such as `--as kushagra`. This is participant metadata only, not path locking.

## Architecture

```text
Developer machine
  -> teambridge daemon
     -> local HTTP API
     -> HTTP MCP server :9474
     -> workspace vault materializer
     -> checkpoint builder / relay client
     -> local SQLite state
  -> CLI
  -> dashboard
  -> agent hooks
  -> agents through MCP
```

Optional hosted relay:

```text
Supabase
  -> workspace_events with canonical per-workspace seq
  -> workspace_vault_checkpoints
  -> inbox_messages
  -> presence
  -> auth / team membership
```

## Workspace Vault

There is only one Teambridge vault type in the first product: the **workspace vault**.

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
└── sessions/              # excluded from sync/injection by default
```

The vault is shared logically, but each teammate reads from a local materialized copy.

## Event Flow

```text
agent/team_publish or teambridge publish
  -> local daemon
  -> local events.jsonl
  -> local vault materialization
  -> Supabase workspace_events when relay is enabled
  -> subscribed teammate daemons
  -> teammate local events.jsonl
  -> teammate local vault materialization
  -> MCP resources / hook deltas
```

Published context uses typed events from the start. Examples:

```bash
teambridge publish decision "Backend is the source of truth for invoice state."
teambridge publish observation "Frontend reads derived totals from the invoice API."
teambridge publish blocker "Need refresh-token behavior decided before UI retry logic."
teambridge publish test_result "pnpm test passed for billing package."
```

The local vault materializer routes event types into the right files:

```text
decision       -> MEMORY.md, CURRENT_GOALS.md, day-logs/{date}.md
observation    -> MEMORY.md, topics/{topic}.md, day-logs/{date}.md
blocker        -> CURRENT_GOALS.md, conflicts.md when relevant
test_result    -> day-logs/{date}.md, CURRENT_GOALS.md when it changes status
attempt_failed -> MEMORY.md, day-logs/{date}.md
```

## Checkpoints

Supabase stores latest vault checkpoints for fast bootstrap.

New joiner flow:

```text
teambridge join billing-v2
  -> fetch workspace manifest
  -> fetch latest checkpoint
  -> fetch events after checkpoint `seq`
  -> materialize local vault
  -> create worktree from base_commit
```

Checkpoint builders apply:

```text
previous checkpoint + workspace_events ordered by `seq`
```

If events collide, create `conflict_detected` and materialize the issue in `conflicts.md`. Do not silently overwrite.

## Agent-to-Agent Messaging

Agents can talk through inbox events:

```text
team_ask({ to: "kushagra", text: "Is refresh route public?" })
```

Allowed:

- Ask another teammate a question
- Receive text replies
- Push inbox deltas
- Store ask/reply in durable inbox

Blocked:

- Running commands on another machine
- Editing another branch directly
- Auto-committing from teammate instructions

## Tech Defaults

- Runtime: TypeScript on Node.js 22+
- Package manager: pnpm
- CLI: commander or oclif
- Local HTTP API: Hono or Fastify
- MCP: `@modelcontextprotocol/sdk`
- Local DB: `better-sqlite3`
- Git operations: `execa` shelling out to `git`
- Config validation: zod
- Dashboard: React + Vite + TanStack Query
- Hosted relay: Supabase Auth + Postgres + Realtime
- Tests: Vitest

## Team Responsibilities

- **Nihal:** backend/core, daemon, Supabase relay, event ordering, checkpoint builder, vault materialization, `better-sqlite3`, conflict primitives.
- **Kushagra:** CLI, Claude hook UX, ask/inbox CLI, vault debug/search/read, terminal workflows.
- **Ronish:** MCP tools/resources, dashboard, inbox approval UI, workspace visibility, vault highlights.

All feature work should import shared contracts from `packages/core/src/contracts/`.

