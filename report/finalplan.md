# Teambridge Final Plan

**Date:** June 20, 2026  
**Status:** Opinionated build plan  
**Related docs:** [initial-plan.md](./initial-plan.md), [initial-viability-report.md](./initial-viability-report.md)

---

## 0. Final Product Shape

`teambridge` is a **local-first team coordination layer for AI coding agents**.

It gives each teammate:

- Their own **git worktree + branch** from the same base commit
- The same **task vault** context, inspired by Ghost Vault
- A **local MCP server** so Claude Code, Cursor, Codex, Ghost, etc. can read/publish/ask through one API
- A **CLI and dashboard** to see who is in which workspace, on what branch, doing what
- A safe **agent-to-agent ask/inbox** layer for messages, not remote execution

Product rule:

> If an agent is running inside a teambridge worktree, shared context is available automatically. If it is not in a teambridge worktree, teambridge stays out of the way.

---

## 1. Final Architecture

```text
                            optional hosted relay
                      Supabase Realtime / Postgres / Auth
                                      |
                                      |
        ----------------------------------------------------------------
        |                                                              |
Developer A machine                                           Developer B machine
        |                                                              |
        v                                                              v
+---------------------------+                              +---------------------------+
| teambridge daemon         |                              | teambridge daemon         |
| - local HTTP API          |                              | - local HTTP API          |
| - HTTP MCP server :9474   |                              | - HTTP MCP server :9474   |
| - vault writer queue      |                              | - vault writer queue      |
| - workspace watcher       |                              | - workspace watcher       |
| - relay client            |                              | - relay client            |
+-------------+-------------+                              +-------------+-------------+
              |                                                          |
     --------------------                                      --------------------
     |        |         |                                      |        |         |
     v        v         v                                      v        v         v
   CLI   Dashboard   Agent MCP                              CLI   Dashboard   Agent MCP
                     + hooks                                                  + hooks
              |                                                          |
              v                                                          v
   .teambridge/worktrees/alice/                              .teambridge/worktrees/bob/
   branch: team/billing-v2/alice                             branch: team/billing-v2/bob
```

### The Three Layers

| Layer | Final implementation |
| --- | --- |
| **Brain** | Ghost Vault-shaped markdown task vault, materialized from event queue |
| **Hands** | `git worktree` per participant, branch `team/{workspace}/{user}` |
| **Nervous system** | Local daemon + CLI + web dashboard + MCP server + optional relay |

Important distinction:

- **CLI is not the backend.** It is a client.
- **Web dashboard does not subscribe to the CLI.** It subscribes to the daemon.
- **Agents do not edit vault files directly.** They use MCP tools; daemon writes safely.

---

## 2. Recommended Tech Stack

### 2.1 Language and Runtime

Use **TypeScript on Node.js 22+**.

Why:

- Best fit for CLI, local daemon, dashboard, MCP server, and JSON/YAML glue
- Works well with Cursor/Claude/Codex users
- Easy packaging via `npm`, `pnpm`, `npx`, Homebrew later
- MCP SDK ecosystem is JS-friendly
- Supabase client and Realtime support are mature

Avoid starting in Rust/Go unless performance becomes a real issue. The hard part is product state and agent integration, not CPU.

### 2.2 Monorepo Layout

```text
team-channel/
├── packages/
│   ├── cli/                 # teambridge binary
│   ├── daemon/              # local API, MCP, relay, vault writer
│   ├── core/                # shared schemas, config, git/worktree helpers
│   ├── mcp/                 # MCP resources/tools wrapper
│   ├── vault/               # Ghost Vault-inspired markdown + writer
│   ├── relay-client/        # Supabase/custom relay client
│   └── dashboard/           # local web UI
├── report/
└── package.json
```

Package manager: **pnpm**.

### 2.3 Libraries

| Area | Recommendation |
| --- | --- |
| CLI | `commander` or `oclif` |
| Local HTTP API | `Hono` or `Fastify` |
| MCP | `@modelcontextprotocol/sdk` |
| Git operations | `execa` wrapping `git` first; avoid complex git libraries early |
| Local DB | `better-sqlite3` or `node:sqlite` when stable enough |
| File watching | `chokidar` |
| Config validation | `zod` |
| YAML | `yaml` |
| Dashboard | React + Vite + TanStack Query |
| Realtime local events | Server-Sent Events first; WebSocket when bidirectional dashboard actions are needed |
| Hosted relay MVP | Supabase Auth + Postgres + Realtime |
| Tests | Vitest |
| Packaging | `tsx` for dev, `tsup` for build |

### 2.4 Why Not Build Web First?

Do **CLI + daemon first**, then web.

Reason:

- Worktree creation, vault access, MCP, and agent hooks are local-machine problems.
- A hosted web app cannot safely create local worktrees or install local MCP config.
- The dashboard is valuable only after the daemon has real state.

Final order:

```text
local daemon -> CLI -> MCP -> hooks -> local dashboard -> hosted relay/dashboard
```

---

## 3. Local Storage Model

### 3.0 Source-of-Truth Framing

The shared context is **local-first**, but the cross-device workspace has a remote canonical stream.

```text
Logical shared vault = workspace context everyone sees
Supabase = canonical event log + latest vault checkpoint + presence + auth
Local vault = materialized working copy of that shared context
Git = durable code + optional long-term team canon
```

For a real cross-device workspace, Supabase stores the **canonical shared context stream**: curated events, inbox messages, and periodic vault checkpoints. Each machine materializes that stream into local markdown files under `.teambridge/workspaces/{workspace}/vault/`.

If Supabase goes down, local work and the local task vault still work. New events queue locally and sync when the relay reconnects. A brand-new third teammate cannot fully bootstrap from Supabase while it is down unless the team is also using git-sync for the vault/events.

In practical terms:

| Layer | Stores | Source-of-truth role |
| --- | --- | --- |
| Supabase `workspace_events` | Curated observations, decisions, blockers, asks, replies | Canonical cross-device event stream |
| Supabase vault checkpoints | Latest compact materialized vault snapshot | Fast bootstrap for new joiners |
| Local task vault | Readable markdown context for the current workspace | Local materialized working copy for agents and humans |
| Local `events.jsonl` | Append-only workspace events | Offline queue and local replay log |
| Git | Code, branches, optional `.teambridge/team-vault/` | Durable code history and optional long-term team memory |

Event propagation rule:

```text
Events notify everyone
  -> each teammate daemon stores the event locally
  -> each daemon materializes it into that machine's local vault
  -> all agents can use the updated context through MCP / injected deltas
```

So the vault is **shared logically**, even though each teammate reads from a local materialized copy.

### 3.1 Repo Files

Inside each repo:

```text
.teambridge/
├── config.yaml                     # tracked, team convention
├── team-vault/                     # optional tracked team canon
├── workspaces/
│   └── billing-v2/
│       ├── manifest.json           # workspace join contract
│       ├── inbox/                  # durable ask/reply files
│       ├── events.jsonl            # append-only workspace event log
│       └── vault/                  # materialized task vault
└── worktrees/                      # gitignored local worktrees
```

`.gitignore`:

```gitignore
.teambridge/worktrees/
.teambridge/workspaces/*/vault/sessions/
.teambridge/workspaces/*/.local/
```

### 3.2 Machine-Local State

Do not put absolute local paths or machine-only tokens in `manifest.json`. Store them in:

```text
~/.teambridge/
├── config.yaml
├── state.sqlite
├── auth.json                  # relay auth token, if any
└── logs/
```

`state.sqlite` stores:

- Local repo roots
- Local worktree paths
- Daemon port
- Last seen event IDs
- MCP clients seen
- Relay connection state

### 3.3 Workspace Manifest

`manifest.json` is portable and safe to sync.

```json
{
  "schema_version": 1,
  "workspace_id": "ws_01j...",
  "name": "billing-v2",
  "repo": {
    "remote": "git@github.com:org/repo.git",
    "base_ref": "main",
    "base_commit": "abc1234"
  },
  "scope": ["packages/billing", "apps/checkout"],
  "created_by": "alice@example.com",
  "created_at": "2026-06-20T12:00:00Z",
  "branches": [
    {
      "participant": "alice@example.com",
      "branch": "team/billing-v2/alice",
      "owns": ["apps/web", "apps/admin"]
    }
  ],
  "relay": {
    "mode": "supabase",
    "workspace_channel": "ws_01j..."
  }
}
```

Local path mapping lives in `~/.teambridge/state.sqlite`, not the manifest.

---

## 4. Vault Model

### 4.1 Vault Types

| Vault | Location | Sync | Purpose |
| --- | --- | --- | --- |
| Personal vault | `~/ghost/vault/ghost-vault` | Never by teambridge | User preferences and private memory |
| Team vault | `.teambridge/team-vault/` | Optional git-tracked | Repo-level conventions and durable architecture |
| Task vault | `.teambridge/workspaces/{name}/vault/` | Relay or git-sync | Current workspace context |

### 4.2 Task Vault Shape

```text
vault/
├── MEMORY.md
├── CURRENT_GOALS.md
├── conflicts.md
├── people.md
├── projects/
│   └── billing-v2.md
├── day-logs/
│   └── 2026-06-20.md
├── topics/
├── procedures/
└── sessions/              # excluded from sync/injection by default
```

### 4.3 Event Log First, Markdown Materialized

The durable truth should be **events**, with markdown as the readable materialization.

Flow:

```text
agent/team_publish
    -> append workspace event
    -> daemon writer queue
    -> update day-log / project file / blockers
    -> relay event to peers
```

Why:

- Easier to sync cross-device
- Easier to dedupe
- Easier to replay/rebuild vault
- Markdown stays human-readable

Use:

- `.teambridge/workspaces/{ws}/events.jsonl` for simple local MVP
- `events` table in Supabase for relay mode
- `vault/` as materialized docs

### 4.4 Hybrid Write Model

| Writer | What it writes |
| --- | --- |
| Main agent | `team_publish`: append observation, decision, blocker, failed attempt |
| Daemon background writer | Curates canonical markdown files |
| Human | `teambridge vault edit`, `teambridge reply`, dashboard edits later |
| Dream/archive job | Promotes task vault decisions into team vault |

Do not let multiple agents freely edit `projects/*.md`. That becomes merge chaos.

### 4.5 Injection Policy

Default:

- Inject compact context once at agent session start
- Inject teammate deltas only when new
- Never inject raw sessions
- Never inject same agent's own recent publish
- Never inject full 140k snapshot by default

Compact payload target: **5k-20k chars**.

Contents:

- Truncated vault tree
- `CURRENT_GOALS.md`
- `projects/{workspace}.md`
- Tail of today's day log
- `people.md` ownership/blockers
- Pending inbox items for current user

---

## 5. Worktree and Branch Model

### 5.1 Start

```bash
teambridge start billing-v2 [base_ref] --scope packages/billing,apps/checkout
```

Examples:

```bash
teambridge start billing-v2 main
teambridge start auth-refactor feature/auth-base
teambridge start checkout-polish HEAD
teambridge start billing-v2 --scope packages/billing,apps/checkout  # uses config default
```

Does:

1. Resolve `base_ref` from CLI argument or config default
2. Resolve and record immutable `base_commit`
3. Create workspace manifest
4. Scaffold task vault
5. Create creator branch and worktree
6. Register workspace in local daemon
7. Start relay channel if configured

Branch:

```text
team/billing-v2/alice
```

Worktree:

```text
.teambridge/worktrees/billing-v2/alice/
```

### 5.2 Join

```bash
teambridge join billing-v2 --own packages/billing-api
```

Does:

1. Load manifest from local repo, git-sync, or relay
2. Create branch from exact `base_commit`
3. Create participant worktree
4. Register participant in manifest/relay
5. Set `.teambridge/.active` or local state mapping
6. Print:

```bash
cd "$(teambridge enter billing-v2)" && claude
```

### 5.3 Base Ref Policy

Command syntax:

```bash
teambridge start <session_name> [base_ref]
teambridge join <session_name>
```

`base_ref` is optional for `start`; if provided, it can be a branch, tag, commit, `HEAD`, `main`, `origin/main`, etc.

`join` never takes a base branch. The creator already fixed the base in the workspace manifest.

Recommended default:

```yaml
worktrees:
  base_ref: current
```

Why:

- If someone starts a workspace from a feature branch, joiners should start from that same exact commit.
- `fresh` is good for independent tasks, but team workspace should preserve the creator's chosen base.

Options:

| Value | Behavior |
| --- | --- |
| `current` | Use current branch + current commit at `start` |
| `fresh` | Use `origin/HEAD` |
| `head` | Use local `HEAD`, including unpushed work |

Important:

```json
{
  "base_ref": "main",
  "base_commit": "abc1234"
}
```

`base_ref` is the human input / label. `base_commit` is what joiners actually fork from. Joiners must not re-resolve `main`, because `main` may have moved after the workspace started.

---

## 6. CLI, Daemon, and Web Relationship

### 6.1 Final Relationship

```text
CLI ---------
             \
Dashboard ----> local teambridge daemon ----> files / sqlite / relay / MCP
             /
Agents -----
```

The daemon is the source of truth at runtime.

### 6.2 CLI Responsibilities

CLI commands:

```bash
teambridge init
teambridge start <session_name> [base_ref]
teambridge join <session_name>
teambridge enter <session_name>
teambridge status
teambridge ws show <workspace>
teambridge ws who <workspace>
teambridge ws branches <workspace>
teambridge ask <person> "question"
teambridge inbox
teambridge vault search "query"
teambridge dashboard
```

CLI should:

- Start daemon if needed
- Call daemon HTTP API
- Fall back to direct file reads only for recovery/debug

### 6.3 Dashboard Responsibilities

Dashboard is a local web UI served by the daemon:

```bash
teambridge dashboard
# opens http://127.0.0.1:9473
```

It subscribes via SSE/WebSocket to daemon events:

- Workspace list
- Participants and presence
- Branches/worktrees
- Inbox asks/replies
- Vault decisions/blockers
- Relay status

It should be read-mostly in MVP. Later:

- Approve/reply to inbox
- Edit ownership
- Archive workspace
- Open worktree in Cursor/VS Code

### 6.4 Hosted Web Later

Local dashboard first. Hosted dashboard later can read relay state, but local daemon remains required for:

- Creating worktrees
- Running git
- Installing MCP config
- Agent hooks
- Reading local files

---

## 7. MCP: Final Role

MCP is the **primary agent-facing API**.

Hooks provide auto-injection for Claude Code, but MCP is how all agents/tools access teambridge capabilities.

### 7.1 MCP Server

Local daemon exposes:

```text
http://127.0.0.1:9474/mcp?workspace=auto&worktree=auto
```

Installed by `teambridge init` into `.mcp.json`:

```json
{
  "mcpServers": {
    "teambridge": {
      "type": "http",
      "url": "http://127.0.0.1:9474/mcp?workspace=auto&worktree=auto"
    }
  }
}
```

### 7.2 MCP Resources

| URI | Purpose |
| --- | --- |
| `teambridge://workspace/current/context` | Compact orientation snapshot |
| `teambridge://workspace/current/manifest` | Base commit, branches, participants |
| `teambridge://workspace/current/inbox/pending` | Pending asks for current user |
| `teambridge://workspace/current/inbox/deltas?since=...` | New teammate events |
| `teambridge://workspace/current/vault/tree` | Vault file tree |

### 7.3 MCP Tools

| Tool | Purpose |
| --- | --- |
| `vault_tree` | List vault files |
| `vault_read` | Read a vault markdown file |
| `vault_search` | Search task/team vault |
| `vault_snapshot` | Bounded snapshot |
| `team_publish` | Publish observation/decision/blocker |
| `team_ask` | Ask teammate's agent/human |
| `team_inbox` | List inbox |
| `team_read_reply` | Read reply |
| `team_approve_reply` | Human-approved reply send |
| `ws_status` | Current workspace state |
| `ws_who` | Participants and branches |

### 7.4 MCP Prompts

Optional:

| Prompt | Purpose |
| --- | --- |
| `workspace_briefing` | Explain workspace context to an agent |
| `handoff_summary` | Summarize what a joiner needs to know |
| `archive_summary` | Generate task closeout summary |

### 7.5 Hooks vs MCP

| Need | Mechanism |
| --- | --- |
| Claude gets context before first response | Claude Code SessionStart hook |
| Cursor/Codex/Ghost access same context | MCP resources/tools |
| Agent publishes decisions | MCP `team_publish` |
| Agent asks teammate | MCP `team_ask` |
| Teammate reply pushed | Relay -> daemon -> MCP delta resource + optional hook injection |

Do both.

---

## 8. Agent-to-Agent Messaging

### 8.1 Principle

Agent-to-agent **messaging** is allowed. Agent-to-agent **remote execution** is not.

Allowed:

- Ask another teammate's agent a question
- Receive a text answer
- Push an inbox delta to requester
- Store ask/reply in durable inbox

Blocked:

- Alice's Claude running bash on Bob's machine
- Alice's Claude editing Bob's branch
- Auto-committing based on a teammate's instruction

### 8.2 Flow

```text
Alice's Claude
  -> MCP tool team_ask({ to: "kush", text: "Is refresh route public?" })
  -> Alice daemon writes inbox event
  -> relay pushes event to Kush daemon
  -> if Kush idle: notify; if busy: queue
  -> Kush approves or agent auto-answers if allowed
  -> reply written to inbox + event log
  -> relay pushes reply to Alice daemon
  -> Alice agent gets delta or calls team_read_reply
```

### 8.3 Push and Poll

| Mode | Use |
| --- | --- |
| Push | Relay online; best UX |
| Poll | Git-sync/offline fallback |
| `--wait` | Optional RPC-like CLI wait for text reply only |

### 8.4 Inbox Storage

```text
.teambridge/workspaces/billing-v2/inbox/
├── evt_4821.md
└── evt_4821.reply.md
```

Example:

```markdown
---
id: evt_4821
from: alice@example.com
to: kush@example.com
status: pending
created_at: 2026-06-20T14:02:00Z
---

Is refresh route public?
```

### 8.5 Auto-Answer Policy

Default:

```yaml
inbox:
  auto_answer: false
  interrupt_policy: queue
```

Later opt-in:

```yaml
inbox:
  auto_answer: true
  auto_answer_scope:
    - factual
    - read_only
```

Never auto-answer requests that imply edits, commands, commits, deploys, or secrets.

---

## 9. Cross-Device Sync and Services

### 9.1 MVP Local Modes

Start with two modes:

| Mode | Description |
| --- | --- |
| Local-only | Same machine or manual file sync; no hosted service |
| Git-sync | Workspace manifest and events pushed through git branch |

But for the real product, use a relay.

### 9.2 Recommended Hosted Relay: Supabase

Use Supabase for the first real cross-device version.

Supabase is **not** where agents read markdown during normal work. Agents read the **local materialized vault** through MCP. But Supabase **does** hold the canonical cross-device event stream and latest checkpoint so a new participant can join and reconstruct the same shared context.

Sync flow:

```text
Alice daemon
  -> append local events.jsonl
  -> update local vault markdown
  -> send event to Supabase workspace_events
  -> periodically upload compact vault checkpoint
  -> Bob daemon receives event
  -> append Bob local events.jsonl
  -> update Bob local vault markdown
```

This is the core shared-context loop: **events notify everyone, then materialize locally, then all agents can use that context.**

New joiner bootstrap:

```text
Carol runs teambridge join billing-v2
  -> fetch workspace manifest from Supabase
  -> fetch latest vault checkpoint
  -> fetch events after checkpoint
  -> materialize .teambridge/workspaces/billing-v2/vault/
  -> create Carol's worktree from base_commit
```

Why:

- Auth, Postgres, Realtime, and Row Level Security in one place
- Realtime channels fit presence/inbox/events
- Easy GitHub OAuth
- Faster to ship than custom infra

Use Supabase for:

- Teams/orgs
- Repo registration
- Workspace records
- Participant presence
- Canonical workspace event log
- Latest vault checkpoint / bootstrap payload
- Inbox asks/replies
- Last-seen cursors

Do **not** store:

- Raw source files
- `.env`
- Raw session transcripts by default
- Secrets

### 9.3 Supabase Tables

```text
teams
team_members
repos
workspaces
workspace_participants
workspace_events
workspace_vault_checkpoints
inbox_messages
presence
device_keys
```

`workspace_events`:

```sql
id uuid primary key
workspace_id uuid
type text
actor_id uuid
payload jsonb
created_at timestamptz
dedupe_key text
```

`workspace_vault_checkpoints`:

```sql
id uuid primary key
workspace_id uuid
event_id uuid
format text -- markdown_bundle | compact_json
payload jsonb -- compact files or object storage pointer
created_at timestamptz
created_by_device_id uuid
```

`inbox_messages`:

```sql
id uuid primary key
workspace_id uuid
from_user_id uuid
to_user_id uuid
status text
body text
reply_to uuid null
created_at timestamptz
answered_at timestamptz null
```

### 9.4 Later Infra

If Supabase becomes limiting, move to:

- Postgres
- Redis or NATS for realtime
- WebSocket gateway on Fly.io/Render
- Optional CRDT layer only if collaborative editing of vault files becomes necessary

Do not add CRDT early. Event log + single writer is simpler.

---

## 10. Security and Trust

### 10.1 Permission Boundaries

| Action | Allowed by default? |
| --- | --- |
| Read task vault | Yes |
| Publish note/decision | Yes |
| Ask teammate | Yes, rate-limited |
| Reply to ask | Human-approved by default |
| Read another branch files | No, unless local git access exists |
| Run command on teammate machine | No |
| Edit teammate branch | No |
| Commit/deploy/merge | Human action only |

### 10.2 Secret Handling

- Redact common secret patterns in `team_publish`
- Never sync `.env`
- Never sync `vault/sessions/` by default
- Warn if event payload looks like token/private key
- Allow team-level blocked patterns

### 10.3 Auth

MVP:

- Identity from `git config user.email`
- Local trust

Hosted:

- Supabase Auth with GitHub OAuth
- Team membership in Supabase
- RLS on all workspace data

---

## 11. Build Phases

### Phase 1 - Local Workspace Core

Deliver:

- `teambridge init`
- `.teambridge/config.yaml`
- `.mcp.json` merge
- daemon start/status
- `teambridge start`
- `teambridge join`
- auto worktree + branch
- manifest
- `teambridge enter`

Acceptance:

- Two local users/identities can create separate branches from same base
- `teambridge ws show` displays branches and ownership

### Phase 2 - CLI Visibility

Deliver:

- `status`
- `ws list/show/who/branches`
- ownership commands
- local daemon API
- SSE stream for state changes

Acceptance:

- CLI accurately shows workspace participants and worktree paths

### Phase 3 - MCP Server v1

Deliver:

- HTTP MCP server
- `.mcp.json` install
- Resources: context, manifest, inbox pending
- Tools: `ws_status`, `ws_who`, `vault_tree`, `vault_read`, `vault_search`

Acceptance:

- Claude/Cursor can call MCP tools from inside teambridge worktree

### Phase 4 - Vault Writer

Deliver:

- Task vault scaffold
- `events.jsonl`
- `team_publish`
- background writer queue
- compact context generation

Acceptance:

- Agent publishes decision -> vault updates -> another agent can read it

### Phase 5 - Auto-Inject

Deliver:

- Claude Code SessionStart hook
- compact inject once
- delta inject for teammate events
- dedupe event IDs
- debug snapshot command

Acceptance:

- User runs `claude` normally in worktree and sees team context without flags

### Phase 6 - Agent Ask/Inbox

Deliver:

- `team_ask`
- `team_inbox`
- `team_read_reply`
- CLI `ask`, `inbox`, `reply`
- inbox files
- local queue behavior

Acceptance:

- Alice asks Bob, Bob replies, Alice's agent receives reply as context

### Phase 7 - Dashboard

Deliver:

- Local dashboard served by daemon
- Workspace list/detail
- Participants
- Branches
- Vault highlights
- Inbox approval queue

Acceptance:

- Dashboard reflects same state as CLI without CLI running

### Phase 8 - Hosted Relay

Deliver:

- Supabase Auth
- workspace event sync
- Realtime presence
- inbox push
- RLS

Acceptance:

- Two laptops in different networks can join same workspace and exchange vault/inbox events

### Phase 9 - Archive/Dream

Deliver:

- workspace archive
- task vault -> team vault promotion
- summary generation
- stale workspace cleanup

Acceptance:

- Closing workspace produces durable team memory and cleanup plan

---

## 12. Final Defaults

| Decision | Default |
| --- | --- |
| Runtime | TypeScript / Node.js 22+ |
| CLI | Commander or oclif |
| Local daemon | Hono/Fastify HTTP |
| Local DB | SQLite |
| Dashboard | React + Vite |
| Local events | SSE first |
| Agent API | MCP over HTTP |
| Cross-device relay | Supabase |
| Vault format | Ghost Vault-style markdown |
| Sync truth | Event log first, markdown materialized |
| Worktree base | `teambridge start <session_name> [base_ref]`; default `current` |
| Agent context | Auto compact inject in worktree |
| Agent messaging | Inbox + relay, text only by default |
| Remote execution | Off by default, not MVP |

---

## 13. Final Mental Model

```text
teambridge start <session_name> [base_ref]
  -> resolves base_ref to base_commit
  -> creates workspace, task vault, branch, worktree, manifest

teambridge join <session_name>
  -> creates participant branch/worktree from recorded base_commit

claude inside worktree
  -> gets compact context automatically
  -> reads deeper context through MCP
  -> publishes decisions through MCP
  -> asks teammates through MCP inbox

teambridge daemon
  -> owns vault writes, MCP, dashboard, relay, presence

dashboard
  -> visualizes daemon state

relay
  -> syncs events/inbox/presence across machines
```

One-liner:

> Teambridge is a local-first daemon with a CLI, MCP server, task vault, worktree manager, and optional hosted relay. CLI starts work. MCP lets agents participate. Dashboard shows the room. Vault remembers. Worktrees keep code safe.

