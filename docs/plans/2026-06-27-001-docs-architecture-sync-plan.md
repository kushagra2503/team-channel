---
title: "docs: Sync team documentation with Project/Track architecture"
status: completed
date: 2026-06-27
type: docs
origin: docs/plans/2026-06-21-001-feat-project-hierarchy-and-track-rename-plan.md
deepened: null
---

# docs: Sync team documentation with Project/Track architecture

## Summary

The codebase has shipped Project → Track hierarchy, a multi-route dashboard, name-based avatars, and vault row annotations — but team-facing docs still describe a workspace-only, CLI-first Phase 1. This plan updates existing docs to match reality, adds a small set of missing reference docs, and closes the hierarchy plan with an honest completion log.

## Problem Frame

New and returning teammates (Nihal, Kushagra, Ronish, and future contributors) rely on `agent.md`, handoff docs, and `todo.md` as sources of truth. Those files still describe workflows and APIs that do not exist yet (CLI) or under-document what does exist (dashboard, `/projects`, avatars, vault annotate). Without a coordinated doc pass, implementation drift will compound — especially around hybrid naming (`workspace` in API/types vs `track` in UI, `workspaces/` on disk vs `tracks` in SQLite).

## Requirements

- R1. Every existing team doc accurately reflects what is **shipped today** vs **planned** (CLI, Supabase relay, inbox).
- R2. The Project → Track → Vault hierarchy and dual identity model (ProjectMember vs Participant) are explained in one canonical glossary.
- R3. Daemon HTTP surface documented includes projects, tracks, avatars, and vault annotate — not only legacy `/workspaces/*` routes.
- R4. Dashboard onboarding covers `pnpm daemon`, `pnpm seed`, `pnpm dashboard`, routes, and env/query params.
- R5. Vault row annotation syntax and persistence behavior are documented (markdown `[tb ...]` tags, annotate API, rebuild preservation).
- R6. Avatar endpoints and slug rules are documented (including apostrophe normalization).
- R7. `todo.md` and `report/team-implementation-plan.md` reflect Ronish dashboard milestone progress without marking unbuilt CLI/MCP work as done.
- R8. The 2026-06-21 hierarchy plan is marked complete-with-gaps with a deviation log — not left as if nothing shipped.

## Key Technical Decisions

- KTD1. **Document hybrid API naming as intentional** — Mutations and vault/events stay on `/workspaces/*`; reads add `/projects`, `/tracks`, `/avatars/by-name`. Rationale: matches code today; avoids implying a breaking rename landed.
- KTD2. **Add new reference docs instead of bloating handoffs** — `docs/CONCEPTS.md` for vocabulary; `docs/daemon-api.md` for HTTP reference; `docs/dashboard.md` for app onboarding. Rationale: handoffs stay role-specific; API tables belong in one place.
- KTD3. **Preserve Phase 1 invariants verbatim** — Events remain source of truth; flat vault files unchanged; annotations are file-level metadata outside the event log. Rationale: `docs/phase-1-design-choices.md` is still canon for vault/event semantics.
- KTD4. **Use seed-demo project names in docs** — Beacon, Silo, Forge (from `scripts/seed-demo.mjs`), not Aurora/DevOps/Portal from the original plan. Rationale: docs should match `pnpm seed` output.
- KTD5. **README becomes the front door** — One-page quick start linking to CONCEPTS, daemon API, dashboard, and `agent.md`. Rationale: current README is a single heading.

## Scope Boundaries

**In scope**

- Update eight existing markdown files (listed below).
- Create three new reference docs (`CONCEPTS`, `daemon-api`, `dashboard`).
- Add completion/deviation section to the 2026-06-21 plan.

**Out of scope**

- Implementing CLI, MCP tools, inbox UI, or full `/workspaces` → `/tracks` API rename.
- Supabase/relay documentation beyond “Phase 2 / not required for local dogfood”.
- Deleting dead dashboard components (`WorkspaceList.tsx`, etc.) — note as follow-up only.
- `docs/solutions/` compound archive (recommend `/ce-compound` after this lands).

### Deferred to Follow-Up Work

- Full API path rename to `/tracks/*` (document as future breaking change).
- Per-project dashboard cache key (`tb_cache_v2_${daemonUrl}_${projectId}`) — plan KTD4 not implemented.
- `AGENTS.md`, `CONTRIBUTING.md`, `.github/` templates.

---

## What Will Change (file-by-file)

This section is the explicit preview of edits. Implementation should follow it closely.

### `README.md` (rewrite)

| Today | Will become |
|-------|-------------|
| Single line `# team-channel` | Product intro (Teambridge), prerequisites, quick start: `pnpm install`, `pnpm build`, `pnpm daemon`, `pnpm seed`, `pnpm dashboard` |
| No links | Documentation index linking to `agent.md`, `docs/CONCEPTS.md`, `docs/daemon-api.md`, `docs/dashboard.md`, `docs/phase-1-design-choices.md` |
| No monorepo map | Short package table: `core`, `daemon`, `vault`, `mcp`, `apps/dashboard` |

---

### `agent.md` (substantial update)

| Section | Change |
|---------|--------|
| **Product Vision / example commands** | Add note: CLI examples are **target UX**; today use daemon + dashboard + seed. Keep commands as north-star. |
| **Core Mental Model** | Add hierarchy diagram: `Project → Track (workspace session) → Vault`. Clarify Supabase/relay is Phase 2 optional. |
| **Commands** | Split into “Planned CLI” vs “Available today” (daemon HTTP, dashboard). |
| **Workspace Vault** | Rename heading to **Track vault** with footnote: on-disk path remains `.teambridge/workspaces/{session_name}/vault/`. Add vault annotation syntax and annotate endpoint. |
| **Architecture** | Add dashboard (React Router), avatar generation, vault annotate flow. |
| **Team Responsibilities — Ronish** | Mark dashboard shell, project picker, track sidebar, team sidebar, vault highlights + annotations as **shipped**. Keep inbox/MCP/conflicts as pending. |
| **Contracts** | Mention `project.ts`, `avatar.ts`, `vault-annotations.ts`. |

---

### `todo.md` (status sync)

| Section | Change |
|---------|--------|
| **Step 2 / Step 9 (Ronish)** | Check off dashboard items that exist: API client, React Router, project selection, track list, project members sidebar, vault highlights, annotation persistence. |
| **New subsection** | “Dashboard milestone (Jun 2026)” listing projects/tracks API, seed, avatars, vault annotate as done. |
| **Phase 1 pass example** | Footnote: runnable today via `pnpm seed` + dashboard; CLI path still pending. |
| **Phase 3 Step 4** | Split done (shell, tracks, members, vault) vs pending (inbox, conflicts, presence, branches UI). |
| **Kushagra CLI items** | Leave unchecked — accurate. |

---

### `docs/phase-1-design-choices.md` (addendum)

| Section | Change |
|---------|--------|
| **Intro** | Short note: UI uses Project/Track terminology; Phase 1 event/vault rules unchanged. |
| **§8 Split Packages** | Add `packages/mcp`, `apps/dashboard`; note `packages/cli` still absent. |
| **§9 Success Criteria** | Add alternate local proof path: seed + dashboard viewing vault context. |
| **New §10 Vault row annotations** | Document `[tb color=#hex assign=slug]` format, annotate API, rebuild preservation, “not in event log”. |

---

### `docs/kushagra-handoff.md` (API refresh)

| Section | Change |
|---------|--------|
| **Intro** | Primary dogfood paths: dashboard + seed, not only curl. |
| **What exists now** | Add `apps/dashboard`, `scripts/seed-demo.mjs`, `pnpm seed`. |
| **Implemented endpoints** | Full table: `/projects`, `/projects/:id/members`, `/projects/:id/tracks`, `/tracks`, `/avatars/by-name/:slug`, `POST .../vault/annotate`, dev PFP routes — alongside existing `/workspaces/*` table. |
| **Terminology** | Track = workspace session; `projectId` on tracks from seed; CLI-created tracks may have null `projectId`. |

---

### `docs/nihal-daemon-requests.md` (status column)

| Section | Change |
|---------|--------|
| **Top summary** | Status table: #4 lookup by session name **Done**; #1–3, #5–7 **Open**. |
| **Per item** | Refresh references to function names instead of stale line numbers. |
| **Scope note** | New project/avatar/annotate endpoints are out of scope for this doc — see `docs/daemon-api.md`. |

---

### `docs/plans/2026-06-21-001-feat-project-hierarchy-and-track-rename-plan.md` (completion log)

| Section | Change |
|---------|--------|
| **Frontmatter** | `status: completed-with-gaps` |
| **New “Completion log”** | Per U1–U9: Done / Partial / Deviation (hybrid API paths, seed names Beacon/Silo/Forge, cache not keyed by projectId, dead components remain). |
| **Open Questions — Avatars** | Update: partially implemented via `/avatars/by-name/:slug` and member avatar routes. |
| **Features beyond plan** | List vault annotations, team sidebar collapse, Pexels avatar migration. |
| **U2 verification** | Fix `teambridge.db` → `state.sqlite`. |

---

### `report/team-implementation-plan.md` (execution sync)

| Section | Change |
|---------|--------|
| **Local Daemon API** | Add projects, tracks, avatars, vault annotate routes. |
| **Contract file tree** | Add `project.ts`, `avatar.ts`, `vault-annotations.ts`. |
| **Ronish section** | Delivered vs remaining split for dashboard/MCP. |
| **New short section** | Dashboard milestone summary with cross-links to CONCEPTS and daemon-api docs. |

---

### New: `docs/CONCEPTS.md`

Define:

- **Project** — organizational container; has **ProjectMembers** (team roster).
- **Track** — a coordinated work session (alias: `Workspace` in types/API); has **Participants** (per-track agents/branches).
- **Vault** — flat markdown projection per track under `.teambridge/workspaces/{sessionName}/vault/`.
- **Naming map** — UI “track” vs HTTP `/workspaces/*` vs DB table `tracks` vs disk `workspaces/`.
- **Avatar identity** — display name → slug → `name_{slug}` storage; assign tags use slug.
- **Vault annotations** — optional row metadata in markdown, not events.

---

### New: `docs/daemon-api.md`

HTTP reference grouped by:

- Health/config
- Projects & tracks (read paths)
- Workspaces (start/join/status/events/vault)
- Avatars (by-name, member, participant)
- Vault annotate + rebuild
- Dev PFP preview/regenerate

Include query params: `repoRoot`, `maxBytes`. Note default repo resolution via git toplevel.

---

### New: `docs/dashboard.md`

Cover:

- Scripts and ports (daemon 9473, Vite dev server)
- Routes: `/` → `/projects`, `/projects/:projectId`
- Env: `VITE_TEAMBRIDGE_DAEMON_URL`, `VITE_TEAMBRIDGE_REPO_ROOT`; URL query overrides
- Prerequisites: run seed for demo data
- UI map: project picker, track sidebar, vault highlights (color/assign), team sidebar
- Link to vault annotation syntax in CONCEPTS

---

## Implementation Units

### U1. Create canonical vocabulary (`docs/CONCEPTS.md`)

**Goal:** Single glossary for Project/Track/Participant/ProjectMember and naming hybrids.

**Requirements:** R2

**Files:** `docs/CONCEPTS.md`

**Approach:** Write from `packages/core/src/contracts/project.ts`, `workspace.ts`, and dashboard routing. Include naming map table.

**Test expectation:** none — documentation only

**Verification:** A new teammate can answer “what’s the difference between a project member and a participant?” from this file alone.

---

### U2. Rewrite `README.md` and add onboarding docs

**Goal:** Runnable quick start and doc index.

**Requirements:** R1, R4

**Dependencies:** U1 (links)

**Files:** `README.md`, `docs/dashboard.md`

**Approach:** Quick start commands verified against root `package.json` scripts. Dashboard doc matches `apps/dashboard/src/App.tsx` routes and `teambridgeClient.ts` config.

**Test expectation:** none — documentation only

**Verification:** Follow README quick start on a clean clone (with `.env` for Pexels optional) reaches project picker with seeded data.

---

### U3. Add daemon HTTP reference

**Goal:** One authoritative API doc derived from `packages/daemon/src/index.ts`.

**Requirements:** R3, R5, R6

**Dependencies:** U1

**Files:** `docs/daemon-api.md`

**Approach:** Group routes by prefix; document annotate body schema; document avatar slug validation; cross-link CONCEPTS for assign slugs.

**Test expectation:** none — documentation only

**Verification:** Every route handler in daemon `index.ts` appears in the doc or is explicitly marked internal/dev-only.

---

### U4. Update product vision and Phase 1 canon

**Goal:** Align `agent.md` and `phase-1-design-choices.md` without breaking Phase 1 invariants.

**Requirements:** R1, R5, R7

**Dependencies:** U1, U3

**Files:** `agent.md`, `docs/phase-1-design-choices.md`

**Approach:** Surgical section edits per “What Will Change” table. Keep event/vault rules intact; add annotation addendum.

**Test expectation:** none — documentation only

**Verification:** No statement in Phase 1 doc contradicts `packages/vault/src/index.ts` materialization behavior.

---

### U5. Sync handoffs, todo, and team report

**Goal:** Role-specific docs and checklists match shipped dashboard/daemon scope.

**Requirements:** R1, R7

**Dependencies:** U3

**Files:** `docs/kushagra-handoff.md`, `docs/nihal-daemon-requests.md`, `todo.md`, `report/team-implementation-plan.md`

**Approach:** Status tables and checked items per research findings. Kushagra doc links to `docs/daemon-api.md` instead of duplicating full route list.

**Test expectation:** none — documentation only

**Verification:** `todo.md` Ronish dashboard items match files under `apps/dashboard/src/pages/` and `VaultHighlights.tsx`.

---

### U6. Close hierarchy plan with completion log

**Goal:** Prevent replanning shipped work; record deviations honestly.

**Requirements:** R8

**Dependencies:** U1–U5 (facts stabilized)

**Files:** `docs/plans/2026-06-21-001-feat-project-hierarchy-and-track-rename-plan.md`

**Approach:** Update frontmatter; append Completion log section; do not delete original units.

**Test expectation:** none — documentation only

**Verification:** Each U1–U9 in original plan has Done/Partial/Deviation entry; status is `completed-with-gaps`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Docs drift again on next feature | Link implementers to update `docs/daemon-api.md` + CONCEPTS in PR checklist (note in README) |
| Hybrid naming confuses readers | CONCEPTS naming map table; repeat footnote in agent.md |
| Over-documenting unbuilt CLI | Explicit “Planned” vs “Shipped” labels in agent.md and README |
| Seed names change again | Document “see `scripts/seed-demo.mjs`” as source of truth |

## Sources & Research

- Code truth: `packages/daemon/src/index.ts`, `apps/dashboard/src/`, `packages/core/src/contracts/`, `scripts/seed-demo.mjs`
- Prior plan: `docs/plans/2026-06-21-001-feat-project-hierarchy-and-track-rename-plan.md`
- Phase 1 canon: `docs/phase-1-design-choices.md`
- Repo research (Jun 2026): hybrid API, dashboard milestone, annotation format
