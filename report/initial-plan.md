# Team Channel: Initial Plan

**Date:** June 20, 2026  
**Status:** Architecture + implementation plan (post-viability research)  
**Companion doc:** [initial-viability-report.md](./initial-viability-report.md)

---

## Executive Summary

Team Channel (`teambridge`) is a **CLI-first coordination layer** for human teams using AI coding agents. It combines three layers:

| Layer | Role | Mechanism |
| --- | --- | --- |
| **Brain** | What the team knows | Ghost Vault–shaped task/team vault (markdown tree, background writer, compact injection) |
| **Hands** | Where each person edits | Auto-provisioned git worktree + branch per participant |
| **Nervous system** | Who is where, on what branch | Manifest, CLI, dashboard, **MCP `ws_*` tools** |

**Product one-liner:** Shared memory + safe parallel execution for human teams using Claude Code, Cursor, and Codex — not a replacement for git, PRs, or the agents themselves.

**Recommended build order:**

1. `init` (hook + MCP install) + `start` + `join` + auto worktree + manifest  
2. `ws show` / `who` / `branches` CLI  
3. **Teambridge MCP server** (resources + tools) — primary cross-IDE agent API  
4. Task vault + auto-inject (hooks for Claude Code passive inject)  
5. Read-only web dashboard  
6. Cross-device relay  

---

## 1. Design Principles

1. **Publish, don't proxy** — agents share observations, decisions, and questions; never auto-execute another agent's commands.
2. **Shared brain, separate hands** — vault syncs reasoning; worktrees isolate file edits.
3. **CLI first, dashboard second** — CLI is source of truth; dashboard reads the same state.
4. **Curated context, not transcripts** — structured vault files beat raw chat dumps.
5. **Zero-config for agents** — if you're in a teambridge worktree, vault context auto-injects; no per-session CLI flags.
6. **Repo-local config** — injection policy and conventions live in `.teambridge/config.yaml` (like `.cursor/rules/`).
7. **Leave to opt out** — work outside the worktree or `teambridge leave`; no daily `--no-vault` flags.

---

## 2. Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TEAMBRIDGE WORKSPACE                         │
│  billing-v2  ·  base: main@abc1234  ·  scope: packages/billing  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │  VAULT    │        │ WORKTREES │        │  RELAY    │
   │  (brain)  │        │  (hands)  │        │ (presence)│
   └───────────┘        └───────────┘        └───────────┘
         │                    │                    │
   task vault            alice/ bob/           who is active
   team vault            branches              cross-device sync
   personal vault        isolated edits        manifest broadcast
```

### 2.1 Brain — Vault Layers

Adapt **Ghost Vault** from `ghost_mono/agentd/src/memory/vault.ts`:

| Vault | Location | Lifetime | Contents |
| --- | --- | --- | --- |
| **Personal** | `~/ghost/vault/ghost-vault` | Permanent | Preferences, people, your projects (existing Ghost) |
| **Team** | `.teambridge/team-vault/` | Repo-long-lived | Architecture decisions, conventions, repo canon |
| **Task** | `.teambridge/workspaces/{name}/vault/` | Per workspace | Decisions, blockers, failed attempts, ownership for *this* feature |

**Task vault schema** (reuse Ghost Vault layout):

```
vault/
├── MEMORY.md              # compact index / map
├── CURRENT_GOALS.md       # open loops for this workspace
├── conflicts.md           # unresolved contradictions
├── people.md              # participants + ownership
├── projects/{name}.md     # feature-specific decisions
├── day-logs/              # episodic progress from all agents
├── topics/                # durable subject notes
├── procedures/            # handoff / workflow notes
└── sessions/              # append-only evidence (optional, usually not synced cross-device)
```

**How agents use vault:**

| Phase | Behavior |
| --- | --- |
| Session start | Auto-inject compact orientation snapshot (once) if cwd is a teambridge worktree |
| During session | `vault_read` / `vault_search` on demand; small **deltas** for teammate events (deduped) |
| After each turn | Main agent **publishes** high-signal notes; background writer **curates** canonical files |
| On workspace archive | Dream-style consolidation promotes durable facts → team vault |

**Write model (hybrid):**

| Actor | Can do |
| --- | --- |
| Main agent | **`team_publish` / `vault_note`** — append-only: day-logs, decisions, blockers, observations |
| Background writer | Promote to `projects/`, dedupe, update `MEMORY.md`, resolve routing |
| Human via CLI | `teambridge vault edit …`, `teambridge ask/reply` |
| Direct canonical edits by multiple agents | No — queue through background writer + file lock |

Main agent writes **facts it just reasoned about**; background writer handles **file hygiene**.

**Auto-injection (no per-session CLI flags):**

| Situation | Behavior |
| --- | --- |
| `claude` started inside teambridge worktree | Compact vault injected once at session start via hook |
| Teammate publishes / inbox reply | Inject small delta only (event ID deduped) |
| Same agent's own recent publish | Skip re-injection — already in thread |
| cwd not under teambridge | No injection |
| `teambridge leave` or work outside worktree | No injection |

Injection policy lives in `.teambridge/config.yaml` (`vault.injection: compact`). Debug via `teambridge vault debug-snapshot`, not daily flags.

Reference implementation in Ghost:

- `buildMemoryContextFiles()` → inject at session start  
- `vaultMemoryAgent.ts` → post-turn background writer  
- `vaultLock.ts` → concurrent mutation safety  
- `vaultDreamRuntime.ts` → periodic consolidation  

### 2.2 Hands — Auto Worktrees

Each participant gets an isolated checkout from the **same base commit** recorded at workspace creation.

```
Creator:  teambridge start billing-v2
          → base: main @ abc1234
          → alice worktree: .teambridge/worktrees/alice/
          → branch: team/billing-v2/alice

Joiner:   teambridge join billing-v2
          → bob worktree: .teambridge/worktrees/bob/
          → branch: team/billing-v2/bob
          → forked from same abc1234
```

Git prevents two worktrees on the same branch — built-in collision guard.

### 2.3 Nervous System — Manifest + CLI + Dashboard

**Workspace manifest** (`.teambridge/workspaces/{name}/manifest.json`) is the join contract:

```json
{
  "name": "billing-v2",
  "repo_root": "/Users/alice/code/ghost_mono",
  "base_ref": "main",
  "base_commit": "abc1234",
  "scope": ["packages/billing", "apps/checkout"],
  "created_at": "2026-06-20T12:00:00Z",
  "created_by": "alice@example.com",
  "participants": [
    {
      "id": "alice@example.com",
      "display_name": "alice",
      "branch": "team/billing-v2/alice",
      "worktree_path": ".teambridge/worktrees/alice",
      "owns": ["apps/web", "apps/admin"],
      "agent": "claude-code",
      "status": "active",
      "last_seen": "2026-06-20T14:02:00Z"
    }
  ]
}
```

CLI and dashboard read: manifest + `git worktree list` + vault highlights + relay presence.

---

## 3. Repository Layout

```
repo/
├── .teambridge/
│   ├── config.yaml                 # repo config (git-tracked)
│   ├── team-vault/                 # long-lived team canon (optional)
│   ├── workspaces/
│   │   └── billing-v2/
│   │       ├── manifest.json       # join contract
│   │       ├── inbox/                # agent Q&A events (durable audit)
│   │       └── vault/              # task vault (Ghost Vault shape)
│   └── worktrees/                  # gitignored — per-participant checkouts
│       ├── alice/  → branch team/billing-v2/alice
│       └── bob/    → branch team/billing-v2/bob
└── (rest of repo)
```

Personal vault stays outside repo: `~/ghost/vault/ghost-vault`.

Add to `.gitignore`:

```
.teambridge/worktrees/
.teambridge/workspaces/*/vault/sessions/
.teambridge/workspaces/*/inbox/*.reply.md   # optional: gitignore if relay-only
```

Track or don't track task vault / team vault / inbox per team preference (recommend: track `team-vault/`; inbox via relay or git-sync).

---

## 4. Configuration

### 4.1 Repo Config — `.teambridge/config.yaml`

Created by `teambridge init`. Git-tracked.

```yaml
version: 1

worktrees:
  dir: .teambridge/worktrees/{user}
  branch_prefix: team/{workspace}/{user}
  base_ref: fresh                    # fresh | head | current
  copy_env: true
  env_patterns:
    - .env
    - .env.local
  port_range: [3000, 3099]           # optional dev server isolation

vault:
  task_dir: .teambridge/workspaces/{workspace}/vault
  team_dir: .teambridge/team-vault
  injection: compact                 # compact | full (debug) | off — repo default, not per-session flags
  max_snapshot_chars: 20000          # team task vault target; not 140k personal-Ghost scale
  delta_on_teammate_events: true
  exclude_from_snapshot:
    - sessions/
    - _system/

participants:
  identity: git.user.email           # git config user.email

hooks:
  claude_code:
    install_on_init: true            # SessionStart + PostToolUse (passive inject)
    session_start: inject_vault
    post_tool_use: publish_queue
  cursor:
    mcp_on_init: true                # Cursor uses MCP as primary surface

mcp:
  enabled: true
  port: 9474
  transport: http                    # http | stdio — http default (Superconductor pattern)
  install_mcp_json: true             # teambridge init writes/merges .mcp.json
  scope_from_cwd: true                 # resolve workspace from agent cwd / URL params
  auto_start_daemon: true            # daemon starts on first join or init

ownership:
  auto_from: pnpm-workspace.yaml     # optional: suggest package boundaries

relay:
  mode: local                        # local | git-sync | supabase

inbox:
  delivery: push                     # push | poll — push when relay up; poll fallback reads vault
  auto_answer: false                 # recipient human approves replies by default
  auto_answer_scope: []              # e.g. [factual, read_only] when enabled per-user
  interrupt_policy: queue            # queue | never — never interrupt mid-turn
  durable_copy: true                 # always write to vault inbox/ for audit + offline
  wait_timeout_ms: 120000            # for `teambridge ask --wait`
```

**`base_ref` options:**

| Value | Behavior |
| --- | --- |
| `fresh` | Branch from `origin/HEAD` (matches Claude Code default) |
| `head` | Branch from current local HEAD (includes unpushed work) |
| `current` | Explicit: use branch + commit at `create` time |

### 4.2 User Config — `~/.teambridge/config.yaml`

```yaml
display_name: alice
default_agent: claude-code
dashboard_port: 9473
relay:
  url: null                          # optional remote relay
```

---

## 5. CLI Command Surface

### 5.1 Repo Setup

```bash
teambridge init                       # create .teambridge/config.yaml
teambridge config get [key]
teambridge config set worktrees.base_ref head
```

### 5.2 Workspace Lifecycle

```bash
teambridge start <name> [--scope paths]     # alias: create
teambridge join <name> [--own paths]
teambridge leave [<name>]
teambridge enter [<name>]             # cd to your worktree; claude auto-injects vault
teambridge ws archive <name>          # promote vault → team vault, close room
teambridge ws cleanup <name>        # remove worktrees/branches (confirm)
```

### 5.3 Visibility (CLI Dashboard)

```bash
teambridge status                     # all workspaces (local + joined)
teambridge ws list
teambridge ws show billing-v2
teambridge ws who [billing-v2]
teambridge ws branches [billing-v2]
```

**Example `teambridge ws show billing-v2` output:**

```
Workspace: billing-v2
Repo:      ~/code/ghost_mono
Base:      main @ abc1234 (forked at create)
Vault:     .teambridge/workspaces/billing-v2/vault/
Relay:     connected (3 peers)

PARTICIPANTS
  alice   ● active   team/billing-v2/alice   .teambridge/worktrees/alice/
          agent: claude-code (vault: auto)
          owns: apps/web, apps/admin
          last: 2m ago — "checkout e2e passing"

  bob     ● active   team/billing-v2/bob     .teambridge/worktrees/bob/
          agent: claude-code (vault: auto)
          owns: packages/billing-api
          last: 8m ago — blocked on SubscriptionStatus enum

  carol   ○ idle     team/billing-v2/carol   .teambridge/worktrees/carol/
          last seen: 1h ago

BLOCKERS (from vault)
  bob → carol: waiting on packages/core enum PR

DECISIONS (recent)
  Webhook idempotency via Redis, not DB unique constraint
```

### 5.4 Vault

```bash
teambridge vault status
teambridge vault read projects/billing-v2.md
teambridge vault search "SubscriptionStatus"
teambridge vault edit projects/billing-v2.md   # human edit
```

### 5.5 Agent Ask & Inbox — Messaging vs Control

Cross-teammate agent communication is **supported** — as **async messaging with audit trail**, not remote session control.

#### What we allow vs block

| Allowed (agent-to-agent **messaging**) | Blocked (agent-to-agent **control**) |
| --- | --- |
| Alice's Claude sends a question to Kush's agent | Alice's Claude runs tools on Kush's machine |
| Kush's Claude replies with text/facts | Kush's Claude auto-edits/commits without Kush knowing |
| Real-time push via relay between local daemons | One agent opening/hijacking another's Claude session |
| Requester reads reply in next turn or `--wait` | Synchronous RPC that executes commands on peer |

**One line:** Agents can **talk**; they cannot **drive** each other by default.

#### Why vault/inbox + relay (not "pure socket only")

Alice (laptop A) and Kush (laptop B) never share one process. Something always sits in the middle:

```
Alice's Claude → teambridge daemon (A) → relay → teambridge daemon (B) → Kush's Claude
                      │                                              │
                      └──────── durable copy: vault inbox/ ──────────┘
```

| Layer | Role |
| --- | --- |
| **Relay / socket** | Fast delivery between daemons (this *is* agent-to-agent transport) |
| **Vault `inbox/`** | Durable, searchable, offline-safe audit log |
| **Queue + idle gate** | Kush mid-turn → message waits; no interrupt |
| **Human approval** | Kush sees "Alice's agent asked: …" before reply ships (default) |

Claude Agent Teams use the same pattern: **mailbox** JSON files, not one agent controlling another's terminal.

**Push vs poll** is implementation, not a product cap:

| Mode | Behavior | When |
| --- | --- | --- |
| **push** (default when relay up) | Reply delta injected to requester's next turn | Cross-device, live workspace |
| **poll** (fallback) | Requester's Claude reads `inbox/` via tool or SessionStart | Offline, git-sync-only, debug |

MVP can ship poll-only; Phase 2 adds push — UX improves, trust model unchanged.

#### Architecture diagram

```
┌──────────────────────────────────────────────────────────────┐
│  UX: team_ask({ to: "kush", text: "Is refresh public?" })   │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Transport: relay WebSocket / git-sync (agent-to-agent)       │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Durable: inbox/evt_4821.md + manifest event log              │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Delivery to Kush's session:                                  │
│    busy  → queue (interrupt_policy: queue)                    │
│    idle  → surface to Kush; auto_answer off → approve         │
│    done  → push delta to Alice OR inbox for poll              │
└──────────────────────────────────────────────────────────────┘
```

#### Inbox layout & event schema

```
.teambridge/workspaces/billing-v2/inbox/
├── evt_4821.md          # alice → kush
└── evt_4821.reply.md    # kush → alice
```

```markdown
---
id: evt_4821
from: alice@example.com
to: kush@example.com
status: pending | answered | expired
created_at: 2026-06-20T14:02:00Z
in_reply_to: null
---

Is refresh route public?
```

#### CLI & agent tools

```bash
teambridge ask kush "Is refresh route public?"
teambridge ask kush "..." --wait              # optional wait for text reply (not remote exec)
teambridge inbox
teambridge inbox show evt_4821
teambridge reply evt_4821 "Yes, public endpoint"
teambridge approve evt_4821                 # recipient approves before agent sends
```

| Tool (MCP — §9.5) | Effect |
| --- | --- |
| `team_ask({ to, text })` | Create inbox event + relay notify |
| `team_inbox()` | List pending for this user |
| `team_read_reply({ id })` | Read answer (poll path) |

#### Recipient delivery states

| State | Behavior |
| --- | --- |
| **Idle** | Notify recipient; default: human approves before agent replies |
| **Busy** (mid-turn) | Queue only — never interrupt tool loop |
| **Offline** | Persist in inbox; deliver on next `join` / reconnect |
| **auto_answer on** | Low-risk factual Q only; still logged to inbox |

Config: §4.1 `inbox:` block. Per-user override in `~/.teambridge/config.yaml`.

#### `--wait` optional RPC (Phase 2+)

Feels like direct agent-to-agent, but underneath: inbox + relay, **text reply only**, no remote bash/edit. Use for factual blockers, not "fix this file for me."

#### Trust rules (MVP)

1. Every ask/reply written to **inbox/** (audit).  
2. **No cross-machine tool execution** without human on that machine.  
3. Replies are **context**, not commands.  
4. `team_ask` scoped to workspace members.  
5. Rate-limit asks to prevent agent spam loops.

### 5.6 Vault Debug (not daily flags)

```bash
teambridge vault debug-snapshot               # print what would inject at session start
teambridge config set vault.injection off     # repo-wide disable (rare)
```

No `teambridge attach --compact|--no-vault` — joining a workspace + running `claude` in the worktree is sufficient.

---

## 6. Workspace Lifecycle (Detailed)

### 6.1 `teambridge init`

Run once per repo.

1. Create `.teambridge/config.yaml` with defaults  
2. Create `.teambridge/team-vault/` scaffold (optional team canon)  
3. Ensure `.gitignore` entries for worktrees  
4. **Install agent integration:** Claude Code hooks + **merge `.mcp.json`** (teambridge MCP server)  
5. Start or register **teambridge daemon** (MCP on `:9474` by default)  
6. Print next steps: `teambridge start …`

Does **not** create a workspace or worktrees. Hook install is one-time — not repeated per session.

### 6.2 `teambridge start billing-v2`

Run by workspace creator.

1. Resolve **base commit** from config (`fresh` / `head` / current branch)  
2. Create `.teambridge/workspaces/billing-v2/manifest.json`  
3. Scaffold **task vault** via `ensureVaultScaffold()`-equivalent  
4. Seed vault: `projects/billing-v2.md`, `people.md`, ownership from `--scope`  
5. Create **creator worktree**:
   - `git worktree add .teambridge/worktrees/{user} -b team/billing-v2/{user} {base_commit}`
   - Copy env files per `env_patterns`  
6. Register creator in manifest  
7. Start local relay registration (or write manifest for git-sync)  
8. Print: `teambridge enter` / `cd … && claude`

### 6.3 `teambridge join billing-v2`

Run by each additional participant.

1. Load manifest (local path or relay)  
2. Verify same repo root (or clone + join flow for cross-machine)  
3. Create **participant worktree** from manifest's `base_commit`  
4. Register in manifest with branch, path, identity  
5. Vault is active automatically when Claude/Cursor runs in the worktree (hook detects manifest)  
6. Optional: `teambridge own packages/billing-api` updates manifest + vault `people.md`  
7. Print: `teambridge enter billing-v2 && claude`

### 6.4 `teambridge leave` / `archive` / `cleanup`

| Command | Effect |
| --- | --- |
| `leave` | Detach from relay; work outside worktree = no vault injection; keep worktree on disk |
| `archive` | Run vault dream/consolidation → promote to team-vault; mark workspace closed |
| `cleanup` | `git worktree remove` + optional branch delete (interactive confirm) |

---

## 7. Web Dashboard (Phase 2)

Read-only first. Same data as CLI.

```bash
teambridge dashboard                  # http://localhost:9473
```

**Views:**

| View | Shows |
| --- | --- |
| Workspace list | Active / idle / archived workspaces |
| Workspace detail | Participants, branches, worktree paths, agent types |
| Ownership map | Path → person (from manifest + vault) |
| Vault highlights | Recent decisions, blockers, failed attempts |
| Inbox | Pending asks, replies, approval queue per participant |
| Branch graph | Base → participant branches (merge status optional) |

No live cursors or shared terminal in MVP — differentiate from Agor canvas.

---

## 8. Agent Integration — Auto-Inject (No Per-Session Flags)

### 8.1 Design rule

> **If you're in a teambridge worktree, vault context is on. If you're not, it isn't.**

Users run `claude` normally after `teambridge join`. No `attach`, no `--compact`, no `--no-vault` on the happy path.

### 8.2 Worktree detection

Hook resolves workspace from cwd:

```
.teambridge/worktrees/alice/     → manifest at ../workspaces/billing-v2/manifest.json
or .teambridge/.active → billing-v2   (symlink written on join)
```

If no teambridge context → hook no-ops (zero overhead).

### 8.3 Claude Code hooks (installed by `teambridge init`)

| Hook | When | Action |
| --- | --- | --- |
| **SessionStart** | `claude` starts in worktree | Inject compact orientation snapshot **once** |
| **PostToolUse** | After tool calls (optional) | Queue high-signal `team_publish` events |
| **Relay listener** | Teammate event / inbox reply | Inject **delta** on next turn (dedupe by `event_id`) |

**SessionStart injects (compact, ~5–20k chars):**

- Truncated vault tree  
- `CURRENT_GOALS.md`  
- `projects/{workspace}.md`  
- Tail of today's `day-logs/`  
- `people.md` / ownership blockers  

**Does not inject every turn.** Conversation thread holds this session's work.

**Does not re-inject:**

- Raw `sessions/` transcripts  
- Facts this agent published in the current thread  
- Full 140k snapshot (debug only via `vault.injection: full` in config)

### 8.4 Agent tools — via MCP (see §9)

All agent-callable tools (`vault_read`, `team_publish`, `team_ask`, etc.) are exposed through the **teambridge MCP server**, not ad-hoc per-IDE APIs. Claude Code hooks handle **passive** inject; MCP handles **active** tools across Claude Code, Cursor, Codex, and Ghost.

### 8.5 Hooks vs MCP — use both

| Job | Mechanism |
| --- | --- |
| Passive context at session start | Claude Code **SessionStart hook** (or IDE pre-loads MCP resource) |
| Cross-IDE same tool API | **MCP server** |
| Agent publish / ask / inbox | **MCP tools** |
| Inbox reply push to requester | Daemon → MCP resource update + optional delta hook |
| Worktree scoping | MCP URL: `?workspace=auto&worktree=auto` (see §9.3) |

### 8.6 Escape hatches (config/debug, not daily UX)

| Need | How |
| --- | --- |
| Solo work, no team context | Don't use worktree; or `teambridge leave` |
| Disable vault for whole repo | `teambridge config set vault.injection off` |
| Inspect inject payload | `teambridge vault debug-snapshot` |
| One-off env override | `TEAMBRIDGE_VAULT=off claude` (power users only) |

### 8.7 Ghost (future)

If building inside Ghost mono ecosystem:

- Reuse `vault.ts`, `vaultMemoryAgent.ts`, `vaultLock.ts` with configurable root  
- Teambridge MCP server exposes same tool names against task vault root  
- Ghost agent connects via thin MCP adapter (Continuum pattern)

---

## 9. MCP Integration

MCP is the **primary cross-IDE agent API** for teambridge. Hooks are Claude Code–specific sugar for passive inject; MCP is how Cursor, Codex, Ghost, and Claude Code all get the same vault, inbox, and workspace tools.

### 9.1 Why MCP fits

| Problem | MCP solution |
| --- | --- |
| N different hook formats per IDE | One MCP server, many clients |
| Cursor lacks Claude-style SessionStart hooks | MCP resources + tools from day one |
| Agent-to-agent ask/inbox | MCP tools → local daemon → relay (see §5.5) |
| Worktree/workspace scoping | URL params on HTTP MCP (Superconductor precedent) |
| Continuum/Agor pattern | Long-lived daemon + thin MCP adapter per agent |

**Reference:** Superconductor already uses HTTP MCP with worktree in the URL (`ghost_mono/.mcp.json`). Teambridge extends that pattern for team vault + inbox + presence.

### 9.2 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  teambridge daemon (local, one per machine)                   │
│  ├── manifest + worktree detect (from cwd / URL params)       │
│  ├── vault watcher + background writer queue                  │
│  ├── relay client (cross-device inbox/vault sync)             │
│  ├── HTTP MCP server :9474                                    │
│  └── same API surface as CLI + dashboard                      │
└──────────────────────────────────────────────────────────────┘
    ▲              ▲              ▲              ▲
    │              │              │              │
Claude Code     Cursor         Codex          Ghost
(.mcp.json)   (MCP settings)  (MCP)      (MCP adapter)
```

**Security rule:** Agents connect to **localhost MCP only**. Cross-device sync happens daemon-to-daemon via relay — never agent-to-agent socket across machines.

### 9.3 Install — `teambridge init`

`init` merges into project `.mcp.json` (or user-level equivalent):

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

Daemon resolves `auto` from:

1. MCP request metadata / agent cwd  
2. `.teambridge/.active` symlink (written on `join`)  
3. Path under `.teambridge/worktrees/{user}/`

If not in a teambridge worktree → MCP returns empty resources and no-op tools (zero overhead).

**Coexistence with Superconductor:**

```json
{
  "mcpServers": {
    "superconductor": {
      "type": "http",
      "url": "http://localhost:31418/mcp?sc_token=...&worktree=..."
    },
    "teambridge": {
      "type": "http",
      "url": "http://127.0.0.1:9474/mcp?workspace=auto&worktree=auto"
    }
  }
}
```

Superconductor = worktree/review/target branch. Teambridge = team vault, inbox, presence. Scoped separately.

### 9.4 MCP Resources (read-only context)

Resources support **passive orientation** — complement SessionStart hook inject.

| URI | Content | When read |
| --- | --- | --- |
| `teambridge://workspace/current/context` | Compact vault orientation (~5–20k): goals, project, blockers, ownership | Session start, IDE preload |
| `teambridge://workspace/current/manifest` | Participants, branches, base commit, scope | On demand |
| `teambridge://workspace/current/inbox/pending` | Unread asks for this user | On demand or push notify |
| `teambridge://workspace/current/inbox/deltas?since={event_id}` | New teammate events since cursor | Poll path; hook uses same payload for push |

**List resources** dynamically — only expose `current` when cwd resolves to a workspace.

Resource reads are **read-only** and **idempotent**. Same dedupe rules as hook inject: skip events already in thread.

### 9.5 MCP Tools (agent actions)

| Tool | Input | Effect |
| --- | --- | --- |
| `vault_tree` | — | List task vault markdown tree |
| `vault_read` | `path` | Read vault file (relative path) |
| `vault_search` | `query`, `limit?` | Keyword search task vault |
| `vault_snapshot` | `compact?` | Bounded snapshot for broad recall |
| `team_publish` | `type`, `text`, `tags?` | Append to publish queue → day-log / projects |
| `team_ask` | `to`, `text` | Create inbox event + relay notify (§5.5) |
| `team_inbox` | `status?` | List pending / answered for this user |
| `team_read_reply` | `event_id` | Read answer (poll path) |
| `team_approve_reply` | `event_id`, `text` | Human-gated send (recipient side) |
| `ws_status` | — | Workspace name, base, relay state |
| `ws_who` | — | Participants, branches, idle/busy |

Background writer consumes `team_publish` queue — same hybrid model as §11.

**Not exposed via MCP:** cross-machine bash/edit/commit, remote worktree control, auto-execute teammate commands.

### 9.6 MCP Prompts (optional)

| Prompt | Use |
| --- | --- |
| `workspace_briefing` | Preloaded summary: ownership, blockers, recent decisions |
| `handoff` | For someone joining mid-task: vault highlights + open inbox |

Prompts reference same content as `workspace/current/context` resource — DRY with inject payload.

### 9.7 Hooks + MCP together (recommended)

| Layer | Role |
| --- | --- |
| **MCP server** | Universal tools + resources; Cursor/Codex/Ghost primary path |
| **SessionStart hook** | Claude Code passive compact inject before first turn (no agent action needed) |
| **Delta hook** | Claude Code inject teammate `inbox/deltas` on relay push |
| **Daemon** | State, relay, vault writer, MCP backend |

Without hook, agent *can* still call `vault_snapshot` or read `workspace/current/context` resource at start — but hook guarantees zero-config for Claude Code.

### 9.8 MCP and inbox push

When Kush replies to Alice's ask:

```
1. Kush: teambridge reply evt_4821 "..."  OR  team_approve_reply via MCP
2. Daemon writes inbox/evt_4821.reply.md + relay broadcast
3. Alice's daemon receives push
4. Delivery to Alice's agent:
   a) MCP resource inbox/deltas updated (push path)
   b) Claude SessionStart/delta hook injects 3-line summary (passive path)
   c) Alice's agent calls team_read_reply (active poll path)
```

All three can coexist; push + delta hook is best UX when relay is up.

### 9.9 What MCP does not replace

| Still CLI / daemon | Why |
| --- | --- |
| `teambridge start` / `join` | Creates worktrees, manifest — not an agent action |
| Human approve inbox (default) | Trust boundary; MCP exposes tool, human triggers |
| Background vault curation | Daemon writer, not main agent |
| `teambridge ws cleanup` | Destructive git ops |

### 9.10 Implementation notes

- **Transport:** HTTP MCP default (matches Superconductor, Agor); stdio optional for subprocess-spawned agents  
- **Daemon lifecycle:** `teambridge join` ensures daemon running; `teambridge daemon status` for debug  
- **Ghost Vault alignment:** Same tool names/signatures as Ghost's `vault_*` where possible — familiar API  
- **Continuum pattern:** Single stateful daemon per repo/workspace; MCP is thin read/write adapter  
- **Rate limits:** MCP tool handlers enforce same ask/publish limits as CLI (§5.5 trust rules)

---

## 10. Cross-Device Sync

| Mode | MVP? | How |
| --- | --- | --- |
| **Local / same repo** | Yes | Manifest + vault on disk; both devs same clone path or synced repo |
| **Git-sync** | Yes | Commit manifest; vault sync via branch or dedicated sync branch |
| **Relay (Supabase/WebSocket)** | Phase 2 | Manifest + vault events broadcast; presence for `who` |

Cross-device join flow:

1. Creator pushes manifest branch or relay registers room  
2. Joiner clones repo (if needed), runs `teambridge join billing-v2`  
3. Joiner worktree created from manifest `base_commit`  
4. Vault syncs via relay or git pull of workspace vault dir  

---

## 11. Event Types & Publish Flow

Main agent **`team_publish`** (append, same turn) → background writer curates (after turn):

| Type | Main agent publishes | Background writer promotes to |
| --- | --- | --- |
| `observation` | "Refresh route skips JWT validation" | `day-logs/` → maybe `projects/` |
| `question` / `team_ask` | "@bob: does frontend retry on 401?" | `inbox/`, relay notify |
| `decision` | "Fix backend validation first" | `projects/{name}.md` |
| `attempt_failed` | "Client cache races webhook" | `projects/`, `topics/` |
| `test_result` | "3/3 auth tests pass" | `day-logs/` |
| `blocker` | "Waiting on enum PR" | `CURRENT_GOALS.md` |
| `ownership` | "alice owns apps/web" | `people.md`, manifest |

Teammate-facing events trigger **delta inject** to other agents (not full vault reload).

Never auto-execute `command_request` events.

---

## 12. Build Phases

| Phase | Deliverables | Effort |
| --- | --- | --- |
| **0** | Viability + plan docs | Done |
| **1** | `init`, `start`, `join`, auto worktree, manifest, `.gitignore`, `.mcp.json` | 2–3 weeks |
| **2** | `ws list/show/who/branches`, `status`, `enter`, `leave` | 1–2 weeks |
| **3** | **MCP server v1** — resources (`context`, `manifest`) + vault tools | 2–3 weeks |
| **4** | Task vault scaffold + background writer + `team_publish` MCP tool | 2–3 weeks |
| **5** | Claude Code SessionStart/delta hooks + MCP `team_ask` / inbox tools | 2–3 weeks |
| **6** | Read-only dashboard (same daemon API as MCP) | 2–3 weeks |
| **7** | Cross-device relay + inbox push via MCP `inbox/deltas` | 2–4 weeks |
| **8** | Cursor/Codex/Ghost MCP adapters; archive/dream consolidation | 2–3 weeks each |

**Dogfood target (end of Phase 5):** Two devs, monorepo split, `join` + `claude` in worktree — MCP tools + hook inject active, `ws show` reflects reality.

---

## 13. Integrations & Dependencies

| System | Relationship |
| --- | --- |
| **Ghost Vault** (`ghost_mono`) | Adapt vault schema, writer, lock — MCP exposes same `vault_*` tool names |
| **MCP (Anthropic standard)** | Primary cross-IDE agent API — resources, tools, prompts |
| **Continuum** | Reference: long-lived daemon + thin MCP adapter per agent |
| **Superconductor** | Coexist via separate `.mcp.json` entry; worktree URL param pattern |
| **Agor** | Reference: agents drive platform via internal MCP |
| **Claude Code worktrees** | Align `base_ref: fresh` with Claude's `worktree.baseRef` |
| **git worktree** | Core isolation primitive |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Worktree setup friction | Auto-provision on `start`/`join`; `teambridge enter` |
| Context pollution | Inject once at start + deltas only; no per-turn full reload; hybrid publish/curate |
| Duplicate context in thread | Dedupe event IDs; skip re-injecting agent's own publishes |
| Multi-writer vault corruption | Single background writer + `vaultLock` pattern |
| Cross-device manifest drift | Manifest is authoritative; relay or git-sync |
| Superconductor overlap | Integrate via `sc` rather than reimplement |
| Secrets in vault | Redaction in writer; never sync `sessions/` cross-device by default |
| Ownership not enforced by git | Coordination hints in manifest + vault only |
| Agent spam / cross-control | Rate-limit asks; inbox audit; no remote tool exec; human approve replies |

---

## 15. Example End-to-End Session

```bash
# Alice — repo setup + start (init installs hooks + .mcp.json once)
cd ~/code/ghost_mono
teambridge init                    # → .teambridge/config.yaml + .mcp.json + daemon
teambridge start billing-v2 --scope packages/billing,apps/checkout
teambridge own apps/web apps/admin
cd $(teambridge enter billing-v2) && claude    # vault auto-injects

# Bob — join from same or different machine
cd ~/code/ghost_mono
teambridge join billing-v2 --own packages/billing-api apps/worker
cd $(teambridge enter billing-v2) && claude    # same — no attach step

# Either — check status
teambridge ws show billing-v2
teambridge vault search "SubscriptionStatus"

# Carol — shared package owner
teambridge join billing-v2 --own packages/core

# Done — archive + cleanup
teambridge ws archive billing-v2
teambridge ws cleanup billing-v2
```

---

## 16. Open Questions

1. Track task vault in git or relay-only?  
2. Reuse Ghost vault code in-process vs standalone daemon + MCP?  
3. MCP transport default: HTTP (Superconductor-style) vs stdio?  
4. Superconductor as required backend vs optional co-installed MCP?  
5. Port allocation strategy for monorepo dev servers?  
6. Dashboard: TUI before web, or web first?  
7. Identity: git email sufficient for MVP auth?  
8. Should IDE preload MCP `workspace/current/context` resource automatically?

---

## 17. Related Documents

- [initial-viability-report.md](./initial-viability-report.md) — market research, fact-check, use cases, skeptic case  
- Ghost Vault implementation: `ghost_mono/agentd/src/memory/vault.ts`  
- Ghost memory agent: `ghost_mono/agentd/src/memory/vaultMemoryAgent.ts`  
- Superconductor MCP pattern: `ghost_mono/.mcp.json`
