---
title: "feat: MCP resource contracts — relay-backed workspace state - Plan"
date: 2026-07-06
type: feat
origin: null
deepened: 2026-07-06
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: MCP resource contracts — relay-backed workspace state - Plan

## Goal Capsule

- **Objective:** Update MCP resource contracts in `packages/core` and the MCP stub resolver in `packages/mcp` to carry relay-backed workspace state, preparing the ground for the Phase 3 MCP HTTP server.
- **Authority:** Ronish's Phase 2 Step 2 scope from `todo.md` ("update MCP resource contracts to include relay-backed workspace state").
- **Stop conditions:** MCP resource contracts include relay fields, stub resolver passes relay data through, tests pass, `pnpm build` succeeds.
- **Execution profile:** Contract + stub work. Type-level changes in `packages/core`, resolver updates in `packages/mcp`.
- **Tail ownership:** Ronish.
- **Dependency:** Requires `RelayStatusResponse` and `SyncStateEntry` types from the dashboard plan (`2026-07-06-001-feat-relay-dashboard-screens-plan.md` U1).

## Product Contract

### Summary

This plan extends the MCP resource contracts to include relay-backed fields (relay sync state on the workspace resource, presence info on the participants resource) and updates the MCP stub resolver to pass relay data through from the daemon. This is type-level contract work, not MCP HTTP server implementation (that's Phase 3).

### Problem Frame

The MCP resource contracts in `packages/core/src/contracts/mcp.ts` and the stub resolver in `packages/mcp/src/resources.ts` only model local workspace state. When the Phase 3 MCP HTTP server is built, it will need to serve relay-backed data (sync state, presence) alongside local workspace status. Updating the contracts now follows the contracts-first rule: any API or MCP change starts in `packages/core/src/contracts/`.

### Requirements

- R1. The MCP workspace resource (`coord://workspace`) includes optional relay sync state (`relayStatus?: RelayStatusResponse`) alongside the existing `WorkspaceStatusResponse`.
- R2. The MCP participants resource (`coord://participants`) type documents that presence data (status, lastSeenAt) is relay-backed when relay mode is active.
- R3. The MCP stub resolver (`resolveMcpResource` in `packages/mcp/src/resources.ts`) passes relay status through when resolving `coord://workspace` and relay is configured.
- R4. The MCP daemon client (`packages/mcp/src/daemon-client.ts`) includes a `getRelayStatus` function that calls `GET /relay/status`.
- R5. The stub resolver degrades gracefully when relay is not configured (returns workspace status without relay fields).

### Scope Boundaries

**In scope:** MCP resource contract type updates in `packages/core`, MCP stub resolver updates in `packages/mcp`, MCP daemon client additions, tests.

**Deferred to Follow-Up Work:**
- MCP HTTP server implementation (Phase 3, Step 2 — Ronish).
- MCP workspace/worktree resolution using explicit query params, client CWD headers, `state.sqlite` worktree path mapping (Phase 3, Step 2 — Ronish).
- MCP tools (`team_publish`, `team_ask`, `team_reply`, `vault_search`, `vault_read`, `workspace_status`) (Phase 3, Step 3 — Ronish).
- Inbox/conflict MCP resources with real data (Phase 3).

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — `McpResourceResponse` is updated in `packages/mcp/src/resources.ts`, not `packages/core/src/contracts/mcp.ts`.** The `McpResourceResponse` union type is defined in `packages/mcp/src/resources.ts`, not in the core contracts. The core `mcp.ts` file only contains resource names, tool names, and request context types. The plan adds a new `McpWorkspaceResourceResponse` type in `packages/core/src/contracts/mcp.ts` that extends `WorkspaceStatusResponse` with an optional `relayStatus` field, and the `McpResourceResponse` union in `resources.ts` uses it for the workspace resource variant.

- **KTD2 — Relay status is optional on the workspace resource, not a separate resource.** Rather than adding a `coord://relay/status` resource, relay sync state is an optional field on the existing `coord://workspace` resource. This keeps the resource count unchanged and lets the MCP server fetch relay status alongside workspace status in one resolution call. When relay is not configured, the field is absent and the resource degrades to the current behavior.

- **KTD3 — Graceful degradation when relay is not configured.** The stub resolver attempts to fetch relay status when resolving `coord://workspace`. If the daemon returns an error (relay not configured, not logged in, or endpoint unavailable), the resolver returns workspace status without the `relayStatus` field rather than failing the entire resource resolution. This matches the dashboard's approach of showing "Local only" when relay is off.

### Assumptions

- The `RelayStatusResponse` and `SyncStateEntry` types from the dashboard plan (U1) are available in `@coord/core` before this plan's work begins.
- The daemon's `/relay/status` endpoint is stable in shape (camelCase sync rows after the dashboard plan's U2 transform).

---

## Implementation Units

### U1. Core contracts: MCP workspace resource type with relay fields

**Goal:** Add a `McpWorkspaceResourceResponse` type in `packages/core/src/contracts/mcp.ts` that extends `WorkspaceStatusResponse` with an optional `relayStatus` field.

**Requirements:** R1, R2

**Dependencies:** Dashboard plan U1 (provides `RelayStatusResponse`)

**Files:**
- `packages/core/src/contracts/mcp.ts` — add `McpWorkspaceResourceResponse` type (extends `WorkspaceStatusResponse` with `relayStatus?: RelayStatusResponse`); document that participants presence is relay-backed when relay mode is active
- `packages/core/src/contracts/index.ts` — re-export new type (already uses `export *`)
- `packages/core/test/contracts.test.cjs` — add test verifying `McpWorkspaceResourceResponse` type shape

**Approach:** `McpWorkspaceResourceResponse` is `WorkspaceStatusResponse & { relayStatus?: RelayStatusResponse }`. The optional field means existing consumers don't break. Add a doc comment on the participants resource noting that `status` and `lastSeenAt` fields are relay-backed when the workspace's `relayMode` is `'supabase'`.

**Patterns to follow:** Existing type composition in `api.ts` (e.g., `WorkspaceStatusResponse` extends `Workspace` with participants and worktrees).

**Test scenarios:**
- Happy path: a `McpWorkspaceResourceResponse` with `relayStatus` populated passes type validation.
- Edge case: a `McpWorkspaceResourceResponse` without `relayStatus` (undefined) is valid — the field is optional.
- Type compatibility: a plain `WorkspaceStatusResponse` is assignable to `McpWorkspaceResourceResponse` (backward compatible).

**Verification:** `pnpm --filter @coord/core build && pnpm --filter @coord/core test` passes. New type is importable from `@coord/core`.

### U2. MCP stub resolver: relay-backed workspace resource

**Goal:** Update the MCP stub resolver and daemon client to surface relay state on the workspace resource.

**Requirements:** R3, R4, R5

**Dependencies:** U1

**Files:**
- `packages/mcp/src/resources.ts` — update `McpResourceResponse` union to use `McpWorkspaceResourceResponse` for the `coord://workspace` variant; update `resolveMcpResource` to fetch relay status alongside workspace status and attach it; add graceful degradation when relay fetch fails
- `packages/mcp/src/daemon-client.ts` — add `getRelayStatus` function that calls `GET /relay/status` and returns `ApiResult<RelayStatusResponse>`
- `packages/mcp/test/resources.test.cjs` — add tests for relay-backed resource resolution and graceful degradation

**Approach:** Add `getRelayStatus` to the MCP daemon client mirroring the existing `getWorkspaceStatus` pattern. Update `resolveMcpResource` for `coord://workspace` to call both `getWorkspaceStatus` and `getRelayStatus` in parallel. If `getRelayStatus` fails (relay not configured, not logged in, or error), return the workspace status without `relayStatus` — graceful degradation. If it succeeds, attach `relayStatus` to the response. Add `getRelayStatus` to the `McpDaemonReader` type.

**Patterns to follow:** Existing `resolveMcpResource` pattern in `resources.ts` (switch on resource name, call daemon reader, return `ApiResult`). Existing daemon-client pattern in `daemon-client.ts` (thin `getJson` wrapper returning `ApiResult`).

**Test scenarios:**
- Happy path: `resolveMcpResource('coord://workspace', { workspaceId })` returns workspace status with `relayStatus` attached when both `getWorkspaceStatus` and `getRelayStatus` succeed.
- Edge case: `resolveMcpResource('coord://workspace', { workspaceId })` returns workspace status without `relayStatus` when `getRelayStatus` fails (relay not configured) — no error propagated.
- Happy path: `resolveMcpResource('coord://participants', { workspaceId })` returns participants array (unchanged behavior).
- Error path: `resolveMcpResource('coord://unknown')` returns `apiFail('NOT_FOUND', ...)` (unchanged).
- Error path: `resolveMcpResource('coord://workspace', { workspaceId })` returns error when `getWorkspaceStatus` fails (workspace not found) — relay status is not fetched.
- Happy path: `getRelayStatus` calls `GET /relay/status` and returns `ApiResult<RelayStatusResponse>`.

**Verification:** `pnpm --filter @coord/mcp build && pnpm --filter @coord/mcp test` passes. `resolveMcpResource` returns relay status on the workspace resource when available.

---

## Verification Contract

| What | Command | Applies to |
|------|---------|------------|
| Core contract tests | `pnpm --filter @coord/core test` | U1 |
| MCP stub tests | `pnpm --filter @coord/mcp test` | U2 |
| Full build | `pnpm build` | All units |

## Definition of Done

- All 2 implementation units are complete with their test scenarios passing.
- `pnpm build` succeeds with no TypeScript errors.
- `pnpm --filter @coord/core test` and `pnpm --filter @coord/mcp test` pass.
- MCP resource contracts in `packages/core` include relay-backed fields (`McpWorkspaceResourceResponse`).
- The stub resolver in `packages/mcp/src/resources.ts` passes relay status through on the workspace resource.
- The resolver degrades gracefully when relay is not configured.
- No dead-end or experimental code left in the diff.
