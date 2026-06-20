# Team Channel: Initial Viability Report

**Date:** June 20, 2026  
**Scope:** Shared Claude Code team sessions, cross-device context sync, and coordination with git worktrees  
**Status:** Idea-stage research — no implementation in this repo yet  
**Implementation plan:** [initial-plan.md](./initial-plan.md)

---

## Executive Summary

**Verdict: Viable as a focused product, with important caveats.**

The core idea — multiple humans, each running their own Claude Code (or Cursor/Codex) instance, sharing a live team context channel while isolating code edits — is **technically feasible and addresses a real gap**. Anthropic is moving in this direction with experimental Agent Teams, but that feature is **single-machine, single-session, and local-only today**. Cross-device multiplayer AI coding is not solved by any dominant tool yet.

Your worktree skepticism is partially right but misaimed: **worktrees do not ruin the idea; they are the correct isolation layer underneath a shared context layer.** The mistake would be sharing one working directory across multiple agents. The winning architecture separates:

| Layer | Purpose | Mechanism |
| --- | --- | --- |
| **Shared context (brain)** | What everyone knows | Ghost Vault–shaped task/team vault; background writer; compact injection |
| **Isolated execution (hands)** | Who edits what | Auto-provisioned git worktree + branch per participant |
| **Workspace ops (nervous system)** | Who is where | Manifest, CLI (`ws show` / `who` / `branches`), optional dashboard |

The product opportunity is **not** "one Claude controls another Claude." It is **"one team shares situational awareness while each Claude works safely in its own lane."**

See [initial-plan.md](./initial-plan.md) for full CLI surface, config schema, and build phases.

**Viability score (1–5):**

| Dimension | Score | Notes |
| --- | --- | --- |
| Technical feasibility | 4/5 | Hooks, MCP, worktrees, and relay servers are proven primitives |
| Market need | 3.5/5 | Real for 3–10 person eng teams doing AI-heavy work; niche for solo devs |
| Differentiation vs. incumbents | 3/5 | Agor, Continuum, and Claude Agent Teams overlap; cross-device human teams is the gap |
| Build complexity | 2.5/5 | Easy MVP; hard to get context hygiene, trust, and merge coordination right |
| Risk of platform absorption | 3/5 | Anthropic/Cursor may ship cross-session teams within 12–18 months |

**Recommendation:** Worth building as a narrow MVP — **`teambridge`**: vault-shaped shared memory + auto worktrees + CLI workspace visibility — not as a full "multiplayer Claude Code replacement." **Best wedge:** monorepo teams where each person owns their apps/plugins and shared packages need live coordination. **Brain model:** adapt Ghost Vault from `ghost_mono` rather than a flat `TEAM_CONTEXT.md`.

---

## TL;DR — Everything in This Report

A condensed summary of the original research, viability analysis, and follow-up use-case discussion.

### The Idea

Multiple developers, each on their own device, each running Claude Code (or Cursor/Codex), working on the same problem or repo — with **shared situational awareness** (discoveries, decisions, failed attempts, questions) but **without** one Claude blindly executing another's commands or silently overwriting the same files.

### Is It Possible?

**Yes.** Hooks, MCP, git worktrees, relay servers, and event schemas are proven building blocks. Claude Code Agent Teams prove Anthropic wants multi-agent coordination — but only **single-machine, single-session** today. Cross-device human teams remain unsolved.

### The Worktree Question (Your Main Skepticism)

**Worktrees do not ruin shared context. They complement it.**

| Layer | Answers |
| --- | --- |
| Shared context | *What does the team know?* |
| Worktrees | *Where does each agent safely edit?* |
| Human gates | *Who approves runs/edits/commits?* |

Model: **"Shared brain, separate hands."** Each person branches from the same base into their own worktree; a channel keeps reasoning in sync; merges happen at PR time like normal.

### What Exists Today (Fact-Checked)

| Thing | Reality |
| --- | --- |
| Claude Code Agent Teams | Real, experimental, off by default. Task list + mailbox. Local only. ~7× token cost. Worktree isolation for team agents is buggy. |
| Claude Code worktrees | First-class (`claude --worktree`). Official docs say worktrees = file isolation, agent teams = coordination. |
| Cursor shared team AI sessions | Not live. Shared Chats are async transcript links only. |
| Agor | Closest analog — multiplayer agent canvas + worktrees. Self-hosted. |
| Continuum | Cross-agent MCP memory daemon. Local only. |
| Gap | No dominant tool for **cross-device human teams + live context + worktree-safe editing + trust gates**. |

### Architecture (If You Build It)

Three layers — see [initial-plan.md](./initial-plan.md):

| Layer | Mechanism |
| --- | --- |
| **Brain** | Ghost Vault–shaped task vault (per workspace) + optional team vault; background writer; `vault_search` / compact injection |
| **Hands** | `teambridge create/join` auto-provisions worktree + `team/{workspace}/{user}` branch from shared base commit |
| **Nervous system** | Workspace manifest, `teambridge ws show/who/branches`, optional dashboard |

- **Publish, don't proxy** — share observations/decisions/questions, never auto-run another agent's commands
- **Scoped workspaces** — per feature, per plugin set, or per breaking change in shared packages
- **CLI-first** — `teambridge init` repo config + one-time hook install; vault auto-injects in worktree
- **Integration** — Claude Code SessionStart hook; no per-session attach flags

```bash
teambridge init
teambridge start billing-v2 --scope packages/billing,apps/checkout
teambridge join billing-v2 --own packages/billing-api
cd $(teambridge enter billing-v2) && claude   # vault auto-injects
teambridge ws show billing-v2
```

### Use Cases — Ranked

| Strength | Examples |
| --- | --- |
| **Very strong** | Monorepo: each person owns their apps/plugins; shared `packages/core` coordination |
| **Strong** | Feature split by module; polish one part / expand another; parallel debugging; incident response; cross-layer FE/BE/tests |
| **Moderate** | Onboarding handoff, async timezone handoff |
| **Weak** | Same-file simultaneous editing; replacing Slack; fully autonomous cross-agent execution; solo dev (Agent Teams already covers) |

### Feature Building & Monorepo (Follow-Up Analysis)

These are **stronger** than generic "multiplayer Claude":

1. **Split feature by part** — Alice on checkout UI, Bob on webhooks, Carol on shared types. Works when seams are real.
2. **Polish vs expand** — different cadences; shared context prevents polishing against stale contracts.
3. **Monorepo multi-app/plugin** — **best use case.** Physical folder boundaries = natural worktree ownership. Shared context wins on API contracts, breaking changes in core packages, cross-app integration, and convention drift.

**Rule:** assign **package/directory ownership**, not vague "everyone on the feature."

### Ghost Vault Brain + Workspace Ops (Latest)

| Component | What |
| --- | --- |
| **Task vault** | Ghost Vault shape per workspace — `projects/`, `day-logs/`, `conflicts.md`; background writer |
| **Team vault** | `.teambridge/team-vault/` — durable repo canon |
| **`teambridge init`** | Repo config: worktree dir, branch prefix, `base_ref`, env copy |
| **Auto worktree** | `create`/`join` forks base commit → `team/{ws}/{user}` branch + worktree path |
| **CLI dashboard** | `ws show`, `who`, `branches` — participants, paths, vault blockers |
| **Auto-inject** | SessionStart hook in worktree; deltas for teammate events; no daily CLI flags |

Full plan: [initial-plan.md](./initial-plan.md)

### Skeptic Case (Still Valid)

- Anthropic may ship cross-session teams natively
- Token cost compounds (humans × Claudes × context injection)
- Context pollution can make Claudes worse if not curated
- Git/PRs already coordinate code — product must save time on **reasoning**, not duplicate git
- Agor exists; worktree + agent team bugs are real; secrets can leak in shared events

### Verdict

| Question | Answer |
| --- | --- |
| Viable? | Yes, as a narrow coordination + memory layer |
| Worktrees vs context? | Use both |
| Best wedge? | Monorepo multi-package teams |
| Build? | Phase 1: `init` + `create/join` + auto worktree + manifest + CLI `ws show`. Phase 2: Ghost Vault task brain. See [initial-plan.md](./initial-plan.md). |
| Don't build as? | Multiplayer terminal, PR replacement, or same-file co-editing tool |

**One-liner:** Teambridge is shared vault memory + safe parallel worktrees + workspace visibility for human teams using AI coding agents — not a replacement for Claude Code, git, or PRs.

---

## 1. Problem Statement

You described a scenario where:

- Developer A runs Claude Code on device A
- Developer B runs Claude Code on device B
- Both work on the same problem (e.g., fixing auth, designing a feature)
- They want shared awareness: user messages, AI responses, discoveries, failed attempts, decisions
- They do **not** want silent file overwrites or one agent blindly executing another's commands

This is distinct from:

- **Pair programming** (one human, one AI, one session)
- **Single-user agent teams** (one human orchestrates multiple Claudes on one machine)
- **Async PR review** (no live shared context)

The unsolved problem is **cross-human, cross-device, live AI session coordination with safe code isolation.**

---

## 2. Fact Check: What Exists Today

### 2.1 Claude Code Agent Teams (Official, Experimental)

**Confirmed:** Anthropic ships an experimental Agent Teams feature in Claude Code.

| Claim | Status | Source |
| --- | --- | --- |
| Multiple Claude instances can coordinate | ✅ True | [Agent Teams docs](https://code.claude.com/docs/en/agent-teams) |
| Shared task list with file locking | ✅ True | Official docs |
| Inter-agent mailbox messaging (`SendMessage`) | ✅ True | Official docs |
| Disabled by default (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | ✅ True | Official docs |
| ~7× token cost vs. single session | ✅ Reported | [Claude Code costs docs](https://code.claude.com/docs/en/costs) |
| One team per session, scoped locally | ✅ True | Official docs — stored under `~/.claude/teams/` and `~/.claude/tasks/` |
| Teammates do **not** inherit lead conversation history | ✅ True | Official docs |
| Cross-device / cross-human teams | ❌ Not supported | Teams are local to one session on one machine |
| Worktree isolation for team agents | ⚠️ Broken / inconsistent | [GitHub #33045](https://github.com/anthropics/claude-code/issues/33045), [#38949](https://github.com/anthropics/claude-code/issues/38949), [#50280](https://github.com/anthropics/claude-code/issues/50280) |

**Key limitation for your idea:** Agent Teams solve **intra-session multi-agent coordination**, not **inter-human multiplayer coordination**. There is no `teambridge join fix-auth-bug` across two laptops today.

Anthropic's own guidance explicitly warns:

> "Two teammates editing the same file leads to overwrites. Break the work so each teammate owns a different set of files."

This validates your collision concern — and confirms that even Anthropic treats file isolation as a separate problem from context sharing.

### 2.2 Claude Code Worktrees (Official)

**Confirmed:** Claude Code has first-class worktree support.

- `claude --worktree <name>` creates isolated checkouts under `.claude/worktrees/`
- Subagents can use `isolation: worktree` in frontmatter
- Official docs position worktrees as **file isolation**, agent teams as **work coordination** — complementary, not competing

Source: [Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees.md)

### 2.3 Cursor / Cross-IDE Team Context

**Confirmed:** Cursor does **not** offer real-time shared AI chat sessions across teammates.

- Shared Chats exist (link to transcript, continue later) — async, not live
- Team Rules (`.cursor/rules/`) provide static shared instructions via git
- Community feature request for live team sessions is in backlog with no ETA

Source: [Cursor forum — Teams share same Chat sessions](https://forum.cursor.com/t/teams-share-same-chat-sessions-to-work-collaborate/161432)

### 2.4 Emerging Protocols and Adjacent Products

| Product / Protocol | What it does | Relevance |
| --- | --- | --- |
| **[Agor](https://github.com/preset-io/agor)** | Multiplayer canvas; branches as anchor entity; Claude/Codex/Gemini; live cursors, shared sessions | **Closest commercial analog** to your idea |
| **[Continuum](https://github.com/redstone-md/Continuum)** | MCP daemon with cross-agent memory, code graph, scratchpad | Shared context layer, local-only |
| **Google A2A** | Agent-to-agent protocol for collaboration | Infrastructure trend, not coding-specific yet |
| **MCP (Anthropic)** | Tool/context standard | Natural integration surface for a team channel |
| **BuildBetter CLI pattern** | Canonical `/context` dir synced to `CLAUDE.md`, `.cursor/rules/` | Static context sharing, not live |
| **Ghost Vault** (`ghost_mono`) | Filesystem markdown memory tree; background writer; dream consolidation | **Primary brain model to adapt** — `agentd/src/memory/vault.ts` |
| **Superconductor** | Worktree + target branch management for AI sessions | Execution isolation layer (this repo's workspace rules reference it); teambridge may wrap `sc` |

**Fact-check conclusion:** The idea is not novel in isolation, but **no dominant product cleanly combines cross-device human teams + live context sync + worktree-safe parallel editing + human approval gates.** Agor is the nearest; Continuum covers memory; Claude Agent Teams covers single-user orchestration.

---

## 3. Worktrees vs. Shared Context — Resolving Your Skepticism

### 3.1 Your Concern (Restated)

> "Worktrees were made so agents don't edit the same code. If everyone is in worktrees, doesn't that ruin the point of shared context? Or do we branch each instance off the same base with shared context that keeps updating?"

### 3.2 Answer: Worktrees and Shared Context Are Orthogonal

Think of it as two axes:

```
                    HIGH shared context
                           │
                           │   ★ Team Channel (target)
                           │
    ───────────────────────┼───────────────────────
                           │
    Single checkout        │        Worktree per agent
    (collision risk)       │        (safe execution)
                           │
                    LOW shared context
```

- **Shared context** answers: *What does the team know? What was tried? What was decided?*
- **Worktrees** answer: *Where does each agent safely write files without stomping others?*

They solve different problems. Combining them is the correct architecture, not a contradiction.

### 3.3 Recommended Model: "Shared Brain, Separate Hands"

```
Developer A (Claude Code)          Developer B (Claude Code)
        │                                    │
        ▼                                    ▼
   Worktree A                           Worktree B
   branch: team/fix-auth/alice          branch: team/fix-auth/bob
   edits: src/auth/middleware.ts       edits: src/auth/refresh.ts
        │                                    │
        └──────────────┬─────────────────────┘
                       ▼
              Team Context Channel
              (relay server or git-synced doc)
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   Observations   Decisions    Questions
   "refresh route  "fix backend  "@bob: does
    skips token     validation    frontend retry
    validation"     first"        on 401?"
                       │
                       ▼
              TEAM_CONTEXT.md (synthesized)
              injected into each Claude via hook/MCP
```

**Each Claude instance:**

1. Reads shared context at session start and on events
2. Writes only to its own worktree
3. Publishes summaries (not raw tool dumps) to the channel
4. Never executes another agent's proposed commands directly

**Merge happens at PR time**, not at edit time — same as normal team development, but with richer shared reasoning history.

### 3.4 When Worktrees *Do* Reduce Value

Worktrees hurt the product when:

- The task is **pure research/review** with no code edits → shared context alone is enough
- The task requires **same-file concurrent editing** → no architecture fixes this well; humans must serialize or pair
- The team is **one person with multiple agents** → Claude Agent Teams + subagent worktrees may suffice without a new product

Worktrees **do not** hurt when:

- Teammates own different files/modules (Anthropic's recommended split)
- Teammates investigate different hypotheses in parallel
- Cross-layer work (frontend/backend/tests) maps naturally to branch boundaries

---

## 4. Proposed Product Architecture

### 4.1 Core Principle: Publish, Don't Proxy

```
❌ BAD:  Claude A → runs command on Claude B's machine
✅ GOOD: Claude A → publishes observation → Claude B's human approves → B's Claude acts locally
```

### 4.2 Event Types (MVP Schema)

| Event type | Example | Auto-inject into other Claudes? |
| --- | --- | --- |
| `observation` | "Refresh route skips JWT validation" | Yes (summarized) |
| `question` | "Does frontend retry on 401?" | Yes, tagged @user |
| `proposal` | Diff proposal for `middleware.ts` | No — link only, human review |
| `decision` | "Fix backend first, then frontend guard" | Yes |
| `attempt_failed` | "Added retry loop; tests still fail with X" | Yes — high value |
| `test_result` | "3/3 auth tests pass on branch alice" | Yes |
| `command_request` | "Run migration on staging" | **Never auto-execute** |

### 4.3 Integration Surface

The safest MVP hooks into existing tools rather than replacing them:

```
Claude Code hook (post-tool-use)
        │
        ▼
Local teambridge agent (CLI daemon)
        │
        ▼
Team relay (WebSocket / Supabase Realtime / CRDT doc)
        │
        ▼
Other teammates' local agents
        │
        ▼
Inject into: CLAUDE.md append, MCP resource, or TEAM_CONTEXT.md
```

Cursor equivalent: `.cursor/hooks` or MCP server.

### 4.4 Context Hygiene (Critical)

Blindly syncing full transcripts will **degrade** every Claude instance:

| Problem | Mitigation |
| --- | --- | --- |
| Context window bloat | Summarize events; cap injected history |
| Stale information | TTL on observations; mark superseded decisions |
| Noise from parallel exploration | Separate "inbox" vs. "team canon" |
| Conflicting theories | Tag as `hypothesis` until `decision` promoted |
| Security leaks | Redact secrets; scope rooms per repo/team |

**TEAM_CONTEXT.md** should be a **curated synthesis**, not a dump of all chat logs.

> **Update (post–Ghost Vault review):** The flat `TEAM_CONTEXT.md` idea is superseded by a **Ghost Vault–shaped task vault** — structured markdown tree with `MEMORY.md`, `projects/`, `day-logs/`, `conflicts.md`, background writer, and compact injection. See [Section 4.5](#45-brain-model--ghost-vault-adaptation) and [initial-plan.md](./initial-plan.md).

### 4.5 Brain Model — Ghost Vault Adaptation

After reviewing `ghost_mono/agentd/src/memory/`, the recommended shared context layer is **not** a single markdown file or raw event relay. It is an adapted **Ghost Vault**:

| Vault layer | Location | Purpose |
| --- | --- | --- |
| Personal | `~/ghost/vault/ghost-vault` | Existing Ghost — preferences, your projects |
| Team | `.teambridge/team-vault/` | Repo-long-lived architecture + conventions |
| Task | `.teambridge/workspaces/{name}/vault/` | Per-workspace decisions, blockers, failed attempts |

**Why Ghost Vault fits:**

- Structured files beat transcript dumps (`projects/`, `day-logs/`, `conflicts.md`)
- **Hybrid write:** main agent `team_publish` (append) + background writer curates canonical files
- **Auto-inject** at SessionStart in worktree (compact, once); deltas for teammate events — no per-session CLI flags
- On-demand recall via `vault_search`, `vault_read`, `vault_snapshot`
- **Dream consolidation** promotes durable facts when workspace archives
- **File locking** (`vaultLock.ts`) for safe concurrent writes

**What teambridge must add:** configurable vault root (not only `~/ghost/vault/ghost-vault`), multi-machine sync, multi-agent writer queue, scoped injection by workspace.

### 4.6 Workspace Operations — CLI, Config, Auto Worktrees

Without visibility and auto-provisioning, worktrees feel like opaque magic. The **nervous system** layer:

**Repo setup:**

```bash
teambridge init    # → .teambridge/config.yaml (tracked) + gitignore rules
```

**Workspace lifecycle:**

```bash
teambridge start billing-v2 --scope packages/billing
teambridge join billing-v2 --own packages/billing-api
teambridge enter billing-v2
teambridge leave
```

**Visibility:**

```bash
teambridge status
teambridge ws list | show | who | branches
```

Each joiner gets auto worktree + branch `team/{workspace}/{user}` forked from manifest `base_commit`. Manifest is the join contract — participants, branches, paths, ownership. Vault injects automatically when agents run inside the worktree (hooks installed by `teambridge init`).

**Dashboard (Phase 2):** read-only web UI (`teambridge dashboard`) showing workspaces, participants, branch map, vault blockers/decisions. CLI remains source of truth.

**Write model:** Main agent **`team_publish`** (append-only, same turn) + background writer curates canonical files. See [initial-plan.md §2.1](./initial-plan.md).

**Auto-injection (no per-session flags):** If cwd is a teambridge worktree, Claude gets compact vault once at session start; teammate events inject small deduped deltas only. Policy in `.teambridge/config.yaml`. Debug via `teambridge vault debug-snapshot`. Opt out by leaving workspace or working outside worktree.

**Agent-to-agent messaging:** Supported via relay + durable `inbox/` — agents use **MCP tools** (`team_ask`, `team_inbox`). **Not** remote session control. See [initial-plan.md §5.5](./initial-plan.md#55-agent-ask--inbox--messaging-vs-control).

**MCP integration:** Primary cross-IDE agent API — daemon + HTTP MCP server (resources + tools), `.mcp.json` installed by `init`. Claude Code hooks for passive inject; MCP for Cursor/Codex/Ghost. See [initial-plan.md §9](./initial-plan.md#9-mcp-integration).

Full command surface, config schema, and hook design: [initial-plan.md §8](./initial-plan.md#8-agent-integration--auto-inject-no-per-session-flags).

---

## 5. Real Use Cases (Ranked by Strength)

### Tier 1 — Strong, Defensible Use Cases

| Use case | Why it works | Worktrees needed? |
| --- | --- | --- |
| **Monorepo multi-app/plugin ownership** | Physical folder boundaries = natural ownership; shared packages need live contract sync | Yes |
| **Feature split by module (polish vs expand)** | Different cadences and concerns; shared context prevents polishing stale contracts | Yes |
| **Parallel debugging (competing hypotheses)** | Each Claude tests a theory; failures/successes shared; avoids re-discovering dead ends | Optional — often read-only investigation first |
| **Cross-layer feature (FE/BE/tests)** | Natural file ownership boundaries; high coordination value | Yes |
| **Incident response** | Multiple engineers + Claudes triage logs, configs, deploys simultaneously | Yes for config/code changes |
| **Architecture/design sessions** | Shared decisions and tradeoffs matter more than code | No — context-only mode |
| **PR review with multiple AI reviewers** | Security/perf/coverage lenses in parallel; synthesize findings | No — read-only |

### Tier 2 — Valid but Narrower

| Use case | Caveat |
| --- | --- |
| **Onboarding new teammate mid-task** | Shared context helps; async Shared Chats partially solve this |
| **Async handoff between time zones** | Useful, but Slack + good docs may suffice |
| **Mob programming with AI** | One driver at a time; live context helps but is not 10× better than screen share |

### Tier 3 — Weak or Overhyped

| Use case | Why skeptical |
| --- | --- |
| **Two Claudes editing the same function simultaneously** | Fundamentally bad; worktrees don't help; merge hell |
| **Replacing standup / Slack** | Chat tools win on notifications and social norms |
| **Fully autonomous cross-agent execution** | Trust, security, and accountability break down |
| **Solo dev with one Claude** | Agent Teams + worktrees already cover this |

---

## 5.1 Use Case Deep Dive — Feature Building & Monorepo Teams

*Added from follow-up discussion: building features across multiple people, polish-vs-expand splits, and monorepo multi-app/plugin ownership.*

These scenarios are **stronger than generic "multiplayer Claude Code"** because they map to how real teams already split work. The product succeeds when it matches natural ownership boundaries — and fails when everyone is vaguely "on the feature" with no path assignment.

### Feature Building — Multiple Parts, Multiple People

**Verdict: Strong, if the split is real.**

Works when the feature has natural seams:

```
Feature: "New billing flow"
├── Alice → checkout UI polish (apps/web)
├── Bob   → Stripe webhook handler (packages/billing-api)
└── Carol → shared types + migration (packages/core)
```

Each person gets a worktree + branch. Shared context carries what git/PRs handle poorly:

- "Bob: I'm changing `SubscriptionStatus` enum — don't hardcode `'active'`"
- "Alice: checkout disabled state depends on Bob's webhook — blocked until PR #412 merges"
- "We tried caching invoice state client-side — failed, race with webhook"

**Where it breaks down:** one tightly coupled surface — e.g. both people editing the same React form + its API handler + shared types simultaneously. That's not a product problem; that's "pair or serialize." Shared context helps you *notice* the coupling early ("you're both touching `auth/types.ts`") but doesn't remove it.

**Practical rule:** assign **package or directory ownership**, not "everyone on the feature."

### Polish vs Expand — Different Cadences, Same Feature

**Verdict: Strong.**

| Person | Mode | Shared context value |
| --- | --- | --- |
| Polisher | Refinement, UX, edge cases, tests | "Here's what broke when I tightened validation" |
| Expander | New surface area, new endpoints | "New API shape — don't polish against old contract" |

Polish and expansion have different velocities and different failure modes. Without shared context, the polisher optimizes against a contract the expander is mid-change. The channel keeps both Claudes aligned on the *current* API shape and decisions.

### Monorepo — Multiple Apps/Plugins, Same Architecture

**Verdict: Very strong — likely the best use case for this product.**

This is where worktrees + shared context feel **designed for each other**, not in tension.

Typical layout:

```
repo/
├── apps/
│   ├── web/          ← Alice
│   ├── admin/        ← Alice
│   ├── mobile-api/   ← Bob
│   └── worker/       ← Bob
├── packages/
│   ├── core/         ← shared — high coordination
│   ├── ui/           ← Carol owns, others consume
│   └── plugin-sdk/   ← Dave extends
└── plugins/
    ├── slack/        ← Dave
    └── github/       ← Dave
```

Each person owns **their apps/plugins** in their own worktree. Collisions stay rare because boundaries are physical (folders/packages).

**Where shared context is high leverage:**

1. **Shared package changes** — someone bumps `packages/core` and everyone needs to know before their Claudes assume old APIs
2. **Architecture decisions** — "All plugins use event bus, not direct imports" lives in team canon, not five separate Claude sessions re-deriving it
3. **Cross-app integration** — Bob's worker expects an event Alice's web app must emit; that's a coordination event, not a merge conflict
4. **Convention drift** — without sync, each person's Claude invents slightly different patterns for the same monorepo

This is **Turborepo/Nx-style ownership** with a live reasoning layer on top. Git handles "who owns which package" via branches; what's missing is **live architectural intent and failed attempts** across parallel sessions.

**Multiple apps per person:** Fine — one worktree can span multiple packages if they're owned together. Or one worktree per app if isolation matters more.

### How to Model It in Team Channel

Don't use one big room per repo. Use **scoped rooms:**

```bash
teambridge start billing-v2 --scope packages/billing,apps/checkout
teambridge create plugin-slack-v3 --scope plugins/slack,packages/plugin-sdk
teambridge create core-breaking-change --scope packages/core   # affects everyone
```

Each room gets:

- **Ownership map** — who owns which paths (reduces accidental same-file edits)
- **Shared decisions** — API contracts, breaking changes
- **Per-person worktree** — `team/billing-v2/alice`, `team/billing-v2/bob`
- **Integration checkpoints** — "core package bumped, regenerate types before continuing"

Example `TEAM_CONTEXT.md` for a monorepo feature room:

```markdown
## Active ownership
- alice: apps/web, apps/admin (polish pass)
- bob: packages/billing-api, apps/worker (expansion)
- carol: packages/core (shared — ask before changing exports)

## Decisions
- 2026-06-20: Webhook idempotency via Redis, not DB unique constraint

## Blockers
- bob waiting on carol's SubscriptionStatus enum (packages/core#89)

## Failed attempts (don't repeat)
- Client-side invoice cache → race with webhook
```

Each Claude reads this; each writes only in its assigned worktree.

### Fit Summary — Feature & Monorepo Scenarios

| Scenario | Fit | Notes |
| --- | --- | --- |
| Feature split by module/layer | **Strong** | Requires real seams |
| Polish one part / expand another | **Strong** | High coordination value across cadences |
| Monorepo, each person on their apps/plugins | **Very strong** | Best dogfood candidate |
| Same file / same component simultaneously | **Weak** | Pair or serialize |
| Fully independent plugins, stable SDK | **Moderate** | Lower coordination need; context still helps for conventions |

### Updated Wedge Recommendation

The original report suggested starting with **"Shared Debugging Channel."** After this analysis, the **stronger wedge** is:

> **Monorepo multi-package coordination** — each person owns their apps/plugins, shared packages get a live decision + blocker channel.

Debugging/incident response remains a good secondary wedge. Generic "team AI sessions" is too vague to validate quickly.

---

## 6. The Skeptic's Case

### 6.1 Arguments Against Building This

1. **Anthropic may ship it.** Agent Teams exist; cross-session and cross-device is a logical next step. Building on experimental APIs is risky.

2. **Token cost compounds.** Agent Teams already cost ~7× a single session. Four humans × four Claudes × shared context injection = expensive and slow.

3. **Context pollution is real.** More shared information can make each Claude *worse* if not curated. Teams may spend more time managing the channel than coding.

4. **Git already coordinates code.** Branches, PRs, and code review are the proven merge layer. This product adds value only if shared *reasoning* saves more time than coordination overhead.

5. **Agor exists.** A well-funded open-source project already targets multiplayer agent orchestration with worktrees. Competing head-on requires clear differentiation.

6. **Worktree isolation bugs in Agent Teams.** If even Anthropic struggles to combine teams + worktrees reliably ([open GitHub issues](https://github.com/anthropics/claude-code/issues/50280)), a third-party tool inherits that pain.

7. **Security surface.** Shared context channels leak credentials, PII, and proprietary logic if not scoped and redacted.

### 6.2 Counter-Arguments (Why It's Still Worth Exploring)

1. **Cross-device human teams is genuinely unsolved.** Agent Teams ≠ Developer A on laptop + Developer B on desktop.

2. **Human-in-the-loop is the moat.** A product that enforces "share context, not control" fits enterprise trust requirements better than raw agent-to-agent protocols.

3. **Tool-agnostic layer wins.** Supporting Claude Code + Cursor + Codex via MCP/hooks has broader reach than any single vendor feature.

4. **The `/context` pattern is static; this is dynamic.** Git-committed rules don't capture live debugging discoveries.

5. **Failed attempts are undervalued.** Normal git/PR workflows lose *why* something didn't work. Shared attempt history is high-leverage for debugging sessions.

---

## 7. Competitive Positioning

### Where Team Channel Could Win

| Differentiator | vs. Claude Agent Teams | vs. Agor | vs. Continuum |
| --- | --- | --- | --- |
| Cross-device human teammates | ✅ Gap | Partial (self-hosted canvas) | ❌ Local daemon only |
| Lightweight CLI-first (`teambridge join`) | ✅ Simpler | Heavier platform | MCP-only |
| Human approval gates by default | ✅ Trust model | Unknown | N/A |
| Worktree orchestration built-in | ✅ If done right | ✅ Core feature | ❌ |
| IDE-agnostic (Claude + Cursor) | ❌ Claude only | Multi-agent | Multi-agent |

### Suggested Positioning Statement

> **Team Channel is the shared memory and coordination layer for human teams using AI coding agents — not a replacement for Claude Code, git, or PRs.**

---

## 8. MVP Definition

> **Updated:** MVP is now defined in [initial-plan.md](./initial-plan.md). Summary below.

### 8.1 Smallest Useful Version

```bash
teambridge init
teambridge start billing-v2 --scope packages/billing,apps/checkout
teambridge join billing-v2 --own packages/billing-api
cd $(teambridge enter billing-v2) && claude
teambridge ws show billing-v2
```

**Phase 1 delivers (workspace ops):**

1. `.teambridge/config.yaml` via `teambridge init` + **one-time Claude hook install**
2. Workspace manifest + auto worktree/branch on `start` and `join`
3. CLI visibility: `status`, `ws list/show/who/branches`, `enter`, `leave`
4. Fork-from-base-commit so all participants share same starting point

**Phase 2 delivers (brain + auto-inject):**

5. Task vault scaffold (Ghost Vault shape) per workspace
6. **SessionStart auto-inject** when `claude` runs in worktree (compact, once)
7. `team_publish` + background writer; `vault read/search` CLI
8. Teammate event **delta inject** (deduped)

**Phase 3 delivers (visibility + cross-device):**

9. Read-only web dashboard
10. Relay or git-sync for cross-machine join
11. `ask` / `inbox`; `archive` / dream consolidation → team vault

**MVP explicitly does NOT deliver:**

- Direct agent-to-agent command execution
- Automatic merging of branches
- Real-time shared terminal / live cursors (Agor territory)
- Full transcript sync across devices

### 8.2 Technical Stack Options

| Component | Option A (simple) | Option B (scalable) |
| --- | --- | --- |
| Relay | Local manifest + git-sync | Supabase Realtime / WebSocket |
| Context store | Ghost Vault task dir (markdown) | Vault + event log + summarization |
| Worktree helper | `git worktree` wrapper | Integrate Superconductor (`sc`) |
| Vault runtime | Adapt `ghost_mono/agentd` memory module | Standalone CLI reimplementation |
| Agent integration | MCP server (primary) + Claude Code hooks | + Cursor/Codex/Ghost MCP clients |
| Dashboard | CLI only | Local web UI on `:9473` |

### 8.3 Estimated Build Effort

| Phase | Scope | Rough effort |
| --- | --- | --- |
| Phase 0 | Research + viability + plan | Done |
| Phase 1 | `init`, `create/join`, auto worktree, manifest, CLI `ws *` | 3–5 weeks (1 dev) |
| Phase 2 | Task vault + compact injection + background writer + hooks | 4–6 weeks |
| Phase 3 | Dashboard + relay + archive/dream | 4–6 weeks |
| Phase 4 | Cursor/Codex adapters | 2–3 weeks each |

Full phase breakdown: [initial-plan.md §11](./initial-plan.md#11-build-phases).

---

## 9. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Platform ships native feature | Medium | High | Focus on cross-IDE + human gates + attempt memory |
| Context pollution degrades output | High | High | Strict summarization; curated canon vs. inbox |
| Users expect real-time co-editing | Medium | Medium | Clear docs: "shared brain, separate hands" |
| Worktree setup friction | High | Medium | Auto-provision on `create`/`join`; `teambridge enter`; `teambridge init` config |
| Secret leakage in shared events | Medium | Critical | Redaction pipeline; never sync raw env files |
| Low adoption (coordination overhead) | Medium | High | Start with debugging/incident use cases only |

---

## 10. Decision Framework: Should You Build This?

### Build if:

- You want to learn the multi-agent coordination space and can ship a CLI MVP in weeks
- You have a specific team (your own) who would dogfood cross-device AI debugging
- You differentiate on **trust boundaries + attempt memory**, not "multiplayer terminal"
- You integrate with existing tools (hooks/MCP) rather than replacing them

### Don't build (yet) if:

- You expect this to replace PRs, Slack, or git workflow
- You need same-file simultaneous editing
- You cannot commit to context hygiene (summarization, TTL, redaction)
- You plan to compete directly with Agor as a full canvas platform without a wedge

### Alternative: Narrowest Wedge

Two validated entry points (pick one to dogfood):

**Option A — Shared Debugging Channel** (original recommendation)

- Read-heavy, write-light
- No automatic code injection
- Optimized for incident response and hypothesis tracking
- Lowest collision risk

**Option B — Monorepo Package Coordination** (updated recommendation)

- Each person owns apps/plugins in their worktree
- Room scoped to feature or shared package (`packages/core`)
- Optimized for API contract sync, breaking changes, polish-vs-expand splits
- Highest long-term product value for eng teams on Turborepo/Nx-style repos

Both avoid same-file co-editing. Expand to full worktree orchestration once context sync proves valuable.

---

## 11. Conclusion

| Question | Answer |
| --- | --- |
| Is it possible? | **Yes.** Primitives exist: hooks, MCP, worktrees, relay servers, event schemas. |
| Do worktrees ruin the idea? | **No.** They are the execution isolation layer. Shared context is the coordination layer. Use both. |
| Is there real usefulness? | **Yes, for specific workflows** — monorepo multi-app teams, feature splits by module, polish-vs-expand, parallel debugging, cross-layer features, incident response. Not for same-file mob editing. |
| Best use case? | **Monorepo teams** — each person owns apps/plugins; shared packages need live coordination. |
| Is it crowded? | **Partially.** Agor and Claude Agent Teams overlap, but cross-device human team context with trust gates is still open. |
| Recommended next step? | Phase 1 per [initial-plan.md](./initial-plan.md): `init` + `create/join` + auto worktree + manifest + CLI. Dogfood monorepo feature split with 2 devs. Then Phase 2 vault brain. |

**Bottom line:** Viable as **teambridge** — vault brain + auto worktrees + workspace CLI. Feature building and monorepo multi-app ownership remain the strongest fits. Implementation detail lives in [initial-plan.md](./initial-plan.md).

---

## 12. Sources

- [Claude Code — Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Claude Code — Worktrees](https://code.claude.com/docs/en/worktrees.md)
- [Claude Code — Run agents in parallel](https://code.claude.com/docs/en/parallel-agents) (referenced from worktrees doc)
- [GitHub — Agent Teams worktree isolation bugs (#33045, #38949, #50280)](https://github.com/anthropics/claude-code/issues/50280)
- [Cursor Forum — Shared team chat sessions (backlog)](https://forum.cursor.com/t/teams-share-same-chat-sessions-to-work-collaborate/161432)
- [Agor — Multiplayer agent orchestration](https://github.com/preset-io/agor)
- [Continuum — Cross-agent MCP memory](https://github.com/redstone-md/Continuum)
- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- Ghost Vault — `ghost_mono/agentd/src/memory/vault.ts` (local codebase)
- [initial-plan.md](./initial-plan.md) — implementation plan for teambridge

---

## Appendix A: Example Session Flow (Updated)

```
1. Alice: teambridge init
2. Alice: teambridge create fix-auth-bug
3. Bob:   teambridge join fix-auth-bug
   → auto worktrees: alice/ bob/  branches: team/fix-auth-bug/{user}

4. Alice's Claude (in worktree, compact vault):
   - Reads task vault (empty + ownership map)
   - Investigates middleware
   - Background writer: observation in day-logs + projects/

5. Bob's Claude (in worktree):
   - Vault injects Alice's observation
   - Checks frontend refresh call
   - Publishes blocker + question in vault

6. Alice confirms → decision in projects/fix-auth-bug.md

7. teambridge ws show fix-auth-bug  → both active, branches visible

8. Each implements in own worktree; test results in day-logs

9. Humans review PRs, merge sequentially
10. teambridge ws archive fix-auth-bug  → promote vault → team-vault
```

## Appendix C: Monorepo Feature Session Flow

```
1. Carol: teambridge start billing-v2 --scope packages/billing,apps/checkout,packages/core
2. Alice: teambridge join billing-v2
3. Bob:   teambridge join billing-v2

4. Worktree setup:
   - alice → team/billing-v2/alice  (apps/web, apps/admin)
   - bob   → team/billing-v2/bob    (packages/billing-api, apps/worker)
   - carol → team/billing-v2/carol  (packages/core)

5. Task vault seeded with ownership map (not flat TEAM_CONTEXT.md)

6. Carol's Claude (packages/core):
   - Adds SubscriptionStatus enum
   - Vault writer: decision in projects/billing-v2.md

7. Bob's Claude (expansion):
   - vault_search finds enum decision before implementing webhooks
   - attempt_failed recorded in vault (DB unique constraint)

8. Alice's Claude (polish):
   - Reads Bob's API shape from vault before polishing checkout UI

9. teambridge ws show billing-v2 — all participants + branches visible

10. Integration checkpoint: carol bumps packages/core → vault + relay notify

11. Humans review 3 PRs, merge core first, then billing-api, then web
12. teambridge ws archive billing-v2
```

## Appendix B: Open Questions for Phase 2 Research

1. Optimal summarization strategy: per-event, periodic, or on-demand?
2. Track task vault in git vs relay-only?
3. Reuse Ghost vault code in-process vs standalone CLI reimplementation?
4. How to handle conflicting decisions when two Claudes disagree? (Ghost `conflicts.md` pattern)
5. Integration priority: Claude Code hooks vs. MCP server vs. both?
6. Superconductor as required backend vs optional wrapper?
7. Pricing model if SaaS: per-room, per-seat, or per-event?
8. Auto-detect package boundaries from `pnpm-workspace.yaml` / `turbo.json`?
9. Dashboard: TUI before web, or web first?
10. Identity: git email sufficient for MVP?
11. Port allocation per worktree for monorepo dev servers?
