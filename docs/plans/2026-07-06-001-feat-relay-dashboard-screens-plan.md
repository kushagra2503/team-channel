---
title: "feat: Relay dashboard screens — sync health, event feed, presence, checkpoint - Plan"
date: 2026-07-06
type: feat
origin: null
deepened: 2026-07-06
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Relay dashboard screens — sync health, event feed, presence, checkpoint - Plan

## Goal Capsule

- **Objective:** Build dashboard UI for relay sync health, participant presence, realtime event feed, and checkpoint state using existing daemon endpoints.
- **Authority:** Ronish's Phase 2 Step 2 scope from `todo.md` ("build dashboard screens for realtime event feed, participant presence, checkpoint state, and sync health using mocked/live events").
- **Stop conditions:** All new dashboard components render relay data from existing daemon endpoints, tests pass, `pnpm build` succeeds.
- **Execution profile:** Frontend work. Build core contract types first, then dashboard API client, then components, then integration.
- **Tail ownership:** Ronish.

## Product Contract

### Summary

This plan adds relay visibility to the dashboard: a sync health panel, a realtime event feed, enhanced participant presence, and a checkpoint state placeholder. All data comes from existing daemon endpoints (`/relay/status`, `/workspaces/:id/events`, `/workspaces/:id/status`).

### Problem Frame

The Supabase relay MVP is live — the daemon mirrors local state to Supabase, queues failed publishes, and polls for remote events. But the dashboard has no visibility into relay state: users can't see whether sync is working, how many events are pending, what other devices have published, or whether a checkpoint exists. This plan closes that gap with four new dashboard panels wired into the existing three-column layout.

### Requirements

- R1. A relay sync health panel shows whether the relay is configured, whether the user is logged in, how many events are pending remote push, and the last sync timestamp per workspace.
- R2. A realtime event feed panel shows recent workspace events (publish, etc.) with actor, type, target file, and seq, polled at the dashboard's existing refresh cadence.
- R3. Participant presence is surfaced in the dashboard using existing participant `status` and `lastSeenAt` fields from `/workspaces/:id/status`, with device/branch info already available. The `TrackParticipantsPanel` is enriched with `lastSeenAt` display.
- R4. A checkpoint state panel renders a "no checkpoints" placeholder when `latestCheckpoint` is absent from the workspace status response, ready to display checkpoint metadata when Nihal's backend work lands.
- R5. The `RelayMode` type in `packages/core` includes `'supabase'` alongside `'local'` as a forward-looking contract change to match the remote Supabase table's usage.
- R6. A sync health badge in the site header gives at-a-glance relay status (connected / pending / not logged in / local / offline) without opening the relay panel.
- R7. All new components follow existing dashboard patterns: polling via `setInterval` + `AbortController`, `motion/react` for transitions, shadcn/ui primitives, repo-relative test factories.
- R8. All new relay panels define error states for API call failures, mirroring the existing `tracksError`/`detailsError`/`vaultError` pattern in `DashboardPage`.

### Scope Boundaries

**In scope:** Dashboard relay panels (sync health, event feed, checkpoint placeholder), presence enhancement from existing data, relay status types in `packages/core`, dashboard API client additions, tests.

**Deferred to Follow-Up Work:**
- MCP resource contract updates (separate plan: `2026-07-06-002-feat-mcp-relay-contracts-plan.md`).
- Checkpoint upload/download backend (Phase 2, Step 5 — Nihal). The checkpoint UI is a placeholder until that lands.
- Supabase Realtime websocket subscription in the daemon (Phase 2, Step 3 — Nihal). The event feed uses polling.
- New daemon `/presence` endpoint reading from `tc_presence` (Nihal's backend scope). Presence is derived from existing participant data for now.
- Conflict detection/resolution plumbing and conflict UI (Phase 2, Step 6).
- CLI changes for relay state display (Kushagra's scope).

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Relay status types mirror the daemon's existing `/relay/status` response, with a camelCase transform in the daemon.** The daemon currently returns `{ configured, loggedIn, pending, sync[] }` where `sync` rows are raw SQLite rows with snake_case column names (`workspace_id`, `last_remote_seq`, etc.) via `querySql` with no transformation. Unlike other daemon responses (`rowToWorkspace`, `rowToParticipant`) which transform DB rows to camelCase, the relay status sync array is sent as-is. The plan adds a `rowToSyncState` transform in the daemon's `/relay/status` handler before sending the response, matching the existing `rowToWorkspace` pattern. `SyncStateEntry` uses camelCase fields: `workspaceId`, `lastRemoteSeq`, `lastSyncedAt`, `relayStatus`, `lastError`.

- **KTD2 — Event feed uses the existing `GET /workspaces/:id/events` endpoint.** The daemon already returns the full event log from `events.jsonl`. The dashboard client adds a `getWorkspaceEvents` function and the feed component polls it at the existing `TRACK_REFRESH_MS` cadence (3s), showing the most recent 20 events. No daemon changes needed.

- **KTD3 — Presence is derived from existing participant data, not a new endpoint.** The `Participant` type already carries `status: 'active' | 'idle' | 'offline'`, `lastSeenAt`, `branch`, and `agent`. The `TrackParticipantsPanel` already renders status dots and branch/agent metadata. This plan enriches the panel with `lastSeenAt` display (relative time). A future daemon `/presence` endpoint (Nihal's scope) can replace this with richer `tc_presence` data.

- **KTD4 — Checkpoint panel is a placeholder, not deferred.** `WorkspaceStatusResponse` already has an optional `latestCheckpoint?: VaultCheckpoint` field. The daemon doesn't populate it yet (Nihal's pending work). The panel renders "No checkpoints" when the field is absent and displays `seq`, `createdAt`, and `hash` when it appears. This means the UI is ready the moment the backend lands.

- **KTD5 — `RelayMode` type fix: add `'supabase'` as a forward-looking contract change.** The local SQLite `tracks` table has a CHECK constraint enforcing `relay_mode = 'local'`. The daemon writes `relay_mode: 'supabase'` only to the remote Supabase `tc_workspaces` table, and `remoteWorkspaceToWorkspace` maps it back to `'local'` for local use. The type widening to `'local' | 'supabase'` is a forward-looking contract change that allows future local use of `'supabase'` without schema changes. No SQLite constraint change is needed for this plan since local rows remain `'local'`.

- **KTD6 — Relay UI lives in the team sidebar as a third tab, always visible.** The team sidebar already has "All Members" and "This Track" tabs. Adding a "Relay" tab keeps the three-column layout intact. The tab is always visible (the tablist changes from `grid-cols-2` to `grid-cols-3`); when relay is not configured, the relay view shows "Local only" messaging. The site header gets a small sync health badge for at-a-glance status.

- **KTD7 — Header badge states with explicit precedence.** Badge states in priority order (highest first): (1) gray "Local" when not configured, (2) amber "Not logged in" when configured but not logged in, (3) red "Error" when any sync entry has `relayStatus: 'error'`, (4) red "Offline" when any sync entry has `relayStatus: 'offline'`, (5) amber "Pending N" when `pending > 0`, (6) green "Synced" when configured, logged in, pending === 0, and no error/offline sync entries. The badge uses `role="status"` with `aria-live="polite"`.

### High-Level Technical Design

```mermaid
flowchart TB
  subgraph Core["packages/core/src/contracts"]
    A[RelayStatusResponse\nSyncStateEntry]
    B[RelayMode: local | supabase]
  end

  subgraph Daemon["packages/daemon/src"]
    C["/relay/status handler\n+ rowToSyncState transform"]
  end

  subgraph Dashboard["apps/dashboard/src"]
    D[coordClient.ts\n+ getRelayStatus\n+ getWorkspaceEvents]
    E[RelaySyncHealth.tsx]
    F[EventFeed.tsx]
    G[CheckpointState.tsx]
    H[TrackParticipantsPanel.tsx\n+ lastSeenAt display]
    I[team-sidebar.tsx\n+ Relay tab]
    J[DashboardPage.tsx\n+ relay polling + error states]
    K[site-header.tsx\n+ sync badge]
  end

  A --> C
  B --> A
  C --> D
  D --> E
  D --> F
  D --> G
  E --> I
  F --> I
  G --> I
  H --> I
  I --> J
  J --> K
```

### Assumptions

- The daemon's `/relay/status` and `/workspaces/:id/events` endpoints are stable in shape (the `/relay/status` handler will gain a camelCase transform for sync rows, but the underlying SQL query is unchanged).
- The `RelayMode = 'local'` type widening doesn't break existing runtime behavior — the local SQLite CHECK constraint keeps local rows as `'local'`, and the Zod schema change is additive.
- The dashboard's polling-based refresh pattern (3-5s `setInterval` + `AbortController`) is sufficient for relay state visibility.

---

## Implementation Units

### U1. Core contracts: relay status types + RelayMode fix

**Goal:** Add `RelayStatusResponse` and `SyncStateEntry` types to `packages/core`, fix the `RelayMode` type to include `'supabase'`, and add Zod schemas for validation.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- `packages/core/src/contracts/api.ts` — add `RelayStatusResponse`, `SyncStateEntry` types
- `packages/core/src/contracts/workspace.ts` — update `RelayMode` to `'local' | 'supabase'`
- `packages/core/src/contracts/schemas.ts` — add `RelayModeSchema` as `z.enum(['local', 'supabase'])`, `SyncStateEntrySchema`, `RelayStatusResponseSchema`; update `WorkspaceSchema` to use the new `RelayModeSchema`
- `packages/core/src/contracts/index.ts` — re-export new types (already uses `export *`)
- `packages/core/test/contracts.test.cjs` — add tests for relay status shape and RelayMode validation

**Approach:** `SyncStateEntry` uses camelCase fields: `workspaceId`, `lastRemoteSeq`, `lastSyncedAt`, `relayStatus`, `lastError`. `RelayStatusResponse` wraps `{ configured: boolean, loggedIn: boolean, pending: number, sync: SyncStateEntry[] }`. The `RelayMode` fix is a one-line type change plus a Zod schema update from `z.literal('local')` to `z.enum(['local', 'supabase'])`.

**Patterns to follow:** Existing contract patterns in `api.ts` (response types are plain objects) and `schemas.ts` (Zod schemas mirror the types, named with `Schema` suffix).

**Test scenarios:**
- Happy path: `RelayStatusResponseSchema` validates a well-formed relay status object with `configured: true`, `loggedIn: true`, `pending: 0`, and a `sync` array with one entry containing all fields.
- Edge case: `RelayStatusResponseSchema` validates when `sync` is an empty array and `lastError` is null/undefined.
- Error path: `RelayStatusResponseSchema` rejects an object missing `configured` or `pending`.
- Validation: `RelayModeSchema` accepts both `'local'` and `'supabase'`; rejects `'remote'` or other strings.
- Validation: `WorkspaceSchema` accepts a workspace with `relayMode: 'supabase'` (previously would fail).

**Verification:** `pnpm --filter @coord/core build && pnpm --filter @coord/core test` passes. New types are importable from `@coord/core`.

### U2. Daemon: camelCase transform for relay status sync rows

**Goal:** Add a `rowToSyncState` transform in the daemon's `/relay/status` handler so sync rows use camelCase field names matching the `SyncStateEntry` contract.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- `packages/daemon/src/index.ts` — add `rowToSyncState` function; apply it to the `querySql` result in the `/relay/status` handler before `sendJson`
- `tests/integration/cli-flow.test.mjs` — verify `/relay/status` returns camelCase sync fields (if relay is configured)

**Approach:** The daemon's `/relay/status` handler currently does `const sync = querySql(dbPath, 'select * from remote_sync_state order by last_synced_at desc')` and sends the raw snake_case rows. Add a `rowToSyncState` function that maps `workspace_id` → `workspaceId`, `last_remote_seq` → `lastRemoteSeq`, `last_synced_at` → `lastSyncedAt`, `relay_status` → `relayStatus`, `last_error` → `lastError`. Apply it as `sync.map(rowToSyncState)` before sending. This matches the existing `rowToWorkspace` and `rowToParticipant` patterns.

**Patterns to follow:** `rowToWorkspace` and `rowToParticipant` transform functions already in `packages/daemon/src/index.ts`.

**Test scenarios:**
- Happy path: `/relay/status` returns sync entries with camelCase field names (`workspaceId`, `lastRemoteSeq`, etc.) when rows exist.
- Edge case: `/relay/status` returns an empty `sync` array when no sync state rows exist (no transform errors on empty array).
- Integration: existing CLI/daemon integration tests still pass after the transform is added.

**Verification:** `pnpm build` succeeds. `pnpm test:integration` passes. `/relay/status` response sync entries have camelCase keys.

### U3. Dashboard API client: relay + events endpoints

**Goal:** Add `getRelayStatus` and `getWorkspaceEvents` functions to the dashboard API client.

**Requirements:** R1, R2

**Dependencies:** U1

**Files:**
- `apps/dashboard/src/api/coordClient.ts` — add `getRelayStatus(config, signal)` calling `GET /relay/status`, add `getWorkspaceEvents(workspaceId, config, signal)` calling `GET /workspaces/:id/events`
- `apps/dashboard/src/api/coordClient.test.ts` — add tests for both new functions

**Approach:** Both functions follow the existing `getJson<T>` pattern. `getRelayStatus` returns `RelayStatusResponse`. `getWorkspaceEvents` returns `EventListResponse` (already defined in core contracts).

**Patterns to follow:** Existing `getWorkspaceStatus` and `getVaultContext` in `coordClient.ts` — same `getJson` + `AbortSignal` pattern.

**Test scenarios:**
- Happy path: `getRelayStatus` calls `GET /relay/status` with the correct URL and returns the parsed `RelayStatusResponse`.
- Happy path: `getWorkspaceEvents('ws_123', config, signal)` calls `GET /workspaces/ws_123/events` and returns `EventListResponse`.
- Edge case: `getRelayStatus` propagates the error message when the daemon returns a non-OK response.
- Integration: both functions pass `repoRoot` from `config` as a query parameter when set.

**Verification:** `pnpm --filter @coord/dashboard test` passes. Both functions are exported and callable.

### U4. Relay sync health panel

**Goal:** New dashboard component that renders relay sync status: configured, logged in, pending events count, per-workspace sync state.

**Requirements:** R1, R8

**Dependencies:** U3

**Files:**
- `apps/dashboard/src/components/RelaySyncHealth.tsx` (new) — renders relay config/login state, pending count, sync state entries
- `apps/dashboard/src/components/RelaySyncHealth.test.tsx` (new) — component tests
- `apps/dashboard/src/test/factories.ts` — add `makeRelayStatus` factory function

**Approach:** The component takes `RelayStatusResponse | undefined` and an optional `error?: string` prop. Renders: a config/login badge row (configured + logged in = "Connected", configured + not logged in = "Not logged in", not configured = "Local only"), a pending events count with warning style when > 0, and a list of sync state entries showing workspace ID, last remote seq, last synced at (relative time), and last error if present. When `error` is set, renders the error message in destructive color instead of the panel content. Uses shadcn/ui primitives and `motion/react` for enter transitions.

**Patterns to follow:** `TrackParticipantsPanel.tsx` for component structure (props-driven, motion transitions, shadcn/ui `SidebarGroup`, error rendering pattern).

**Test scenarios:**
- Happy path: renders "Connected" badge when `configured: true, loggedIn: true`, shows pending count as 0.
- Edge case: renders "Local only" when `configured: false`, hides sync state list.
- Edge case: renders "Not logged in" when `configured: true, loggedIn: false`.
- Happy path: renders sync state entries with workspace ID, last remote seq, and relative last synced time.
- Error display: shows `lastError` text in destructive color when present on a sync entry.
- Pending warning: shows pending count in amber/warning style when > 0.
- Loading state: renders "Loading relay status…" placeholder when data is undefined and no error.
- Error state: renders error message in destructive color when `error` prop is set.

**Verification:** `pnpm --filter @coord/dashboard test` passes. Component renders correctly for all relay states including error.

### U5. Event feed panel

**Goal:** New dashboard component that shows recent workspace events in reverse-chronological order.

**Requirements:** R2, R8

**Dependencies:** U3

**Files:**
- `apps/dashboard/src/components/EventFeed.tsx` (new) — renders recent events with actor, type, target file, seq
- `apps/dashboard/src/components/EventFeed.test.tsx` (new) — component tests
- `apps/dashboard/src/test/factories.ts` — add `makeWorkspaceEvent` factory function

**Approach:** The component takes `WorkspaceEvent[] | undefined` and an optional `error?: string` prop. Renders the most recent 20 events in reverse seq order. Each event row shows: actor display name (or actor ID), event type badge with text label (not color-only: `publish` = blue, `conflict_detected` = red, `checkpoint_created` = green), target file if present, and seq number. When `error` is set, renders the error message instead of the feed. Uses `motion/react` for row enter transitions. The component is presentational — polling is handled by the parent.

**Patterns to follow:** `TrackParticipantsPanel.tsx` `MemberRow` for row layout and motion transitions. `participantDisplay.ts` for name formatting.

**Test scenarios:**
- Happy path: renders events in reverse seq order (seq 5 before seq 3).
- Edge case: renders "No events yet" placeholder when the array is empty or undefined and no error.
- Happy path: shows event type badge with correct text label for `publish` events.
- Happy path: shows target file and actor for publish events.
- Truncation: shows at most 20 events when more are provided.
- Event type rendering: renders `conflict_detected` and `checkpoint_created` type badges with distinct colors and text labels.
- Error state: renders error message in destructive color when `error` prop is set.

**Verification:** `pnpm --filter @coord/dashboard test` passes. Component renders events correctly including error state.

### U6. Checkpoint state placeholder panel

**Goal:** New dashboard component that renders checkpoint state — a "no checkpoints" placeholder when absent, or checkpoint metadata when present.

**Requirements:** R4

**Dependencies:** U1

**Files:**
- `apps/dashboard/src/components/CheckpointState.tsx` (new) — renders checkpoint info or placeholder
- `apps/dashboard/src/components/CheckpointState.test.tsx` (new) — component tests

**Approach:** The component takes `VaultCheckpoint | undefined` (from `WorkspaceStatusResponse.latestCheckpoint`). When undefined, renders "No checkpoints yet" with a muted explanation ("Checkpoints will appear here once the relay builds them"). When defined, renders: checkpoint seq, created at (relative time), hash (truncated), and created by device ID. Uses shadcn/ui primitives matching the relay panel aesthetic.

**Patterns to follow:** `RelaySyncHealth.tsx` (U4) for panel structure and styling. `VaultHighlights.tsx` for data-driven rendering patterns.

**Test scenarios:**
- Happy path: renders "No checkpoints yet" when `latestCheckpoint` is undefined.
- Happy path: renders checkpoint seq, relative created at, truncated hash, and device ID when `latestCheckpoint` is present.
- Edge case: renders gracefully when `latestCheckpoint` exists but `createdByDeviceId` is empty.

**Verification:** `pnpm --filter @coord/dashboard test` passes. Component renders both states correctly.

### U7. Presence enhancement: lastSeenAt in TrackParticipantsPanel

**Goal:** Enrich the existing `TrackParticipantsPanel` with `lastSeenAt` display (relative time) alongside the existing status dots and branch/agent metadata.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- `apps/dashboard/src/components/TrackParticipantsPanel.tsx` — add `lastSeenAt` relative time display to `MemberRowData` and the `MemberRow` render
- `apps/dashboard/src/components/TrackParticipantsPanel.test.tsx` — add test for lastSeenAt rendering

**Approach:** The `MemberRowData` type already has access to `lastSeenAt` via `Participant.lastSeenAt`. Add a small relative-time line (e.g., "2m ago", "1h ago") below the existing status label in `MemberRow`, formatted using a simple relative-time helper. This is a minimal enhancement — the status dots and branch/agent display already work.

**Patterns to follow:** Existing `MemberRow` layout in `TrackParticipantsPanel.tsx`. Use a simple relative-time formatter (no new dependency — a small inline helper matching the codebase's no-moment/date-fns convention).

**Test scenarios:**
- Happy path: renders relative time (e.g., "2m ago") below the status label for online participants with a recent `lastSeenAt`.
- Edge case: does not render relative time when `lastSeenAt` is absent or empty.
- Existing behavior: status dots, branch, agent, and worktree "Enter" button still render correctly.

**Verification:** `pnpm --filter @coord/dashboard test` passes. Existing `TrackParticipantsPanel` tests still pass.

### U8. Dashboard integration: relay tab + header sync badge

**Goal:** Wire the new relay components into the dashboard layout. Add a "Relay" tab to the team sidebar, poll relay status and events in `DashboardPage`, and add a sync health badge to the site header.

**Requirements:** R1, R2, R3, R4, R6, R7, R8

**Dependencies:** U4, U5, U6, U7

**Files:**
- `apps/dashboard/src/components/team-sidebar.tsx` — add "Relay" as a third tab (always visible, `grid-cols-3`); render `RelaySyncHealth`, `EventFeed`, and `CheckpointState` stacked in the relay view; the relay tab content scrolls as a single container (matching existing `SidebarContent` overflow pattern)
- `apps/dashboard/src/pages/DashboardPage.tsx` — add `relayStatus`, `events`, `relayError`, and `eventsError` state; poll `getRelayStatus` (every 5s) and `getWorkspaceEvents` (every 3s) with error handling mirroring the existing `tracksError`/`detailsError` pattern; pass data and errors to team sidebar
- `apps/dashboard/src/components/site-header.tsx` — add a sync health badge with `role="status"` and `aria-live="polite"`; badge states per KTD7 precedence: gray "Local" (not configured) > amber "Not logged in" (configured, not logged in) > red "Error" (any sync entry `relayStatus: 'error'`) > red "Offline" (any sync entry `relayStatus: 'offline'`) > amber "Pending N" (pending > 0) > green "Synced" (all clear)
- `apps/dashboard/src/App.test.tsx` — update mock API to include `getRelayStatus` and `getWorkspaceEvents`; add tests for relay tab rendering and header badge states
- `apps/dashboard/src/test/factories.ts` — add `makeRelayStatus` and `makeWorkspaceEvent` if not already added in U4/U5

**Approach:** The team sidebar's `MembersView` type expands to `'all' | 'track' | 'relay'` with a third tab label "Relay". The TABS array grows from 2 to 3 entries and the tab grid changes from `grid-cols-2` to `grid-cols-3`. The relay tab button uses `role="tab"` with `aria-controls` matching the relay panel content. When the relay tab is active, the sidebar renders the three new components stacked in a single scrollable `SidebarContent` container. `DashboardPage` adds two new polling effects with error state variables (`relayError`, `eventsError`) mirroring the existing pattern. The header badge shows the worst-case state per the KTD7 precedence list.

**Patterns to follow:** Existing `DashboardPage` polling pattern (`useEffect` + `setInterval` + `AbortController` + error state). Existing `team-sidebar.tsx` tab pattern (`MembersViewTabs` with `motion.span` layout indicator). Existing `site-header.tsx` for header badge placement.

**Test scenarios:**
- Happy path: clicking the "Relay" tab shows the relay sync health panel, event feed, and checkpoint placeholder.
- Happy path: relay status is polled and the sync health panel updates when the daemon returns data.
- Happy path: events are polled for the selected track and the event feed renders them.
- Integration: switching tracks resets the event feed and polls events for the new track.
- Error state: relay panel shows error message when `getRelayStatus` fails.
- Error state: event feed shows error message when `getWorkspaceEvents` fails.
- Header badge: shows "Local" when relay is not configured.
- Header badge: shows "Synced" when configured, logged in, pending === 0, no error/offline entries.
- Header badge: shows "Pending 3" when there are 3 pending events.
- Header badge: shows "Not logged in" when configured but not logged in.
- Header badge: shows "Offline" when any sync entry has `relayStatus: 'offline'`.
- Tab switching: switching away from "Relay" tab and back preserves the relay data.
- Accessibility: relay tab has `role="tab"` and `aria-controls`; header badge has `role="status"` and `aria-live="polite"`.

**Verification:** `pnpm build` succeeds. `pnpm --filter @coord/dashboard test` passes. `pnpm test:integration` passes. Dashboard renders relay tab with live data when daemon is running.

---

## Verification Contract

| What | Command | Applies to |
|------|---------|------------|
| Core contract tests | `pnpm --filter @coord/core test` | U1 |
| Daemon transform | `pnpm test:integration` | U2 |
| Dashboard unit tests | `pnpm --filter @coord/dashboard test` | U3, U4, U5, U6, U7, U8 |
| Full build | `pnpm build` | All units |
| Integration tests | `pnpm test:integration` | U2, U8 (no regressions) |

## Definition of Done

- All 8 implementation units are complete with their test scenarios passing.
- `pnpm build` succeeds with no TypeScript errors.
- `pnpm --filter @coord/core test`, `pnpm --filter @coord/dashboard test`, and `pnpm test:integration` all pass.
- The dashboard "Relay" tab renders sync health, event feed, checkpoint state, and enhanced presence when the daemon is running.
- The site header shows a relay sync badge with all states handled (Local, Not logged in, Error, Offline, Pending, Synced).
- All relay panels define error states for API call failures.
- `RelayMode` type includes `'supabase'` and the Zod schema validates it.
- No dead-end or experimental code left in the diff.
