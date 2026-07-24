---
title: "feat: MCP server over stdio with resources and tools - Plan"
date: 2026-07-07
type: feat
origin: null
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: MCP server over stdio with resources and tools - Plan

## Goal Capsule

- **Objective:** Build a local MCP server using `@modelcontextprotocol/sdk` with stdio transport that exposes 5 resources and 6 tools, enabling agents like Claude Code to read workspace state and publish vault entries through the Coord daemon.
- **Authority:** Ronish's Phase 3 Step 2 + Step 3 scope from `todo.md`.
- **Stop conditions:** MCP server starts via `coord mcp`, registers all resources and tools, stdio transport works with Claude Code, 4 unblocked tools call the daemon correctly, 2 blocked tools return not-implemented, tests pass, `pnpm build` succeeds.
- **Execution profile:** Server + contract work. New `packages/mcp/src/server.ts` entry point, workspace resolution logic, daemon client additions, CLI command wiring.
- **Tail ownership:** Ronish.

## Product Contract

### Summary

This plan builds the MCP HTTP server (Phase 3 Step 2) as a stdio server using the official `@modelcontextprotocol/sdk`. It registers 5 resources (`coord://workspace`, `coord://participants`, `coord://vault/context`, `coord://inbox`, `coord://conflicts`) and 6 tools (`team_publish`, `vault_search`, `vault_read`, `workspace_status`, `team_ask`, `team_reply`). The 4 unblocked tools call the daemon directly. The 2 blocked tools (`team_ask`, `team_reply`) and 2 blocked resources (`coord://inbox`, `coord://conflicts`) return not-implemented stubs until Nihal ships inbox/conflict daemon endpoints.

### Problem Frame

The MCP resource/tool stubs in `packages/mcp/src/resources.ts` and `tools.ts` are name-only — no server, no transport, no daemon wiring. Agents like Claude Code need a subprocess they can spawn that speaks the MCP protocol over stdio and gives the agent read access to workspace state and write access to publish events. The existing `resolveMcpResource` function and `daemon-client.ts` provide the resolution and daemon-calling foundation; this plan wires them into a real MCP server.

### Requirements

- R1. The MCP server starts over stdio transport using `@modelcontextprotocol/sdk`'s `McpServer` + `StdioServerTransport`.
- R2. The server resolves the active workspace from: explicit query params (workspaceId or sessionName) first, then CWD header, then `state.sqlite` worktree path mapping, then `.coord/.active` fallback.
- R3. The server registers 5 resources: `coord://workspace` (with relay status), `coord://participants`, `coord://vault/context`, `coord://inbox` (stub), `coord://conflicts` (stub).
- R4. The server registers 6 tools: `team_publish`, `vault_search`, `vault_read`, `workspace_status` (all calling the daemon), `team_ask` and `team_reply` (stubs returning not-implemented).
- R5. The `coord mcp` CLI command spawns the MCP server process.
- R6. The daemon client gains `postJson`, `publishEvent`, and `searchVault` functions to support the publish and search tools.
- R7. Blocked stubs return clear not-implemented errors so agents know the capability exists but is awaiting backend work.

### Scope Boundaries

**In scope:** MCP server entry point in `packages/mcp`, workspace resolution logic, daemon client additions, CLI command, `@modelcontextprotocol/sdk` dependency, tests.

**Deferred to Follow-Up Work:**
- `team_ask` and `team_reply` real implementation (blocked on Nihal's inbox daemon endpoints, Phase 3 Step 1).
- `coord://inbox` and `coord://conflicts` real data (blocked on Nihal's inbox/conflict endpoints).
- Claude Code hook auto-injection (Kushagra, Phase 3 Step 2).
- Dashboard inbox/conflicts UI (blocked on Nihal, Phase 3 Step 4).
- MCP workspace resolution via client CWD headers (the `cwd` field in `McpRequestContext` is accepted but CWD-to-worktree mapping via `state.sqlite` is deferred; U2 implements `.coord/.active` and explicit params only, with CWD as a stretch goal).

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Use `@modelcontextprotocol/sdk` with `McpServer` and `StdioServerTransport`.** The official SDK handles JSON-RPC framing, capability negotiation, and the protocol-level details. `StdioServerTransport` is the correct transport for Claude Code, which spawns the MCP server as a subprocess and communicates over stdin/stdout. No HTTP server is needed.

- **KTD2 — Workspace resolution is a layered fallback: explicit params > `.coord/.active` > error.** The MCP server receives `workspaceId` or `sessionName` as explicit parameters when available. When absent, it reads `.coord/.active` (a file containing the active session name) as a fallback. CWD-to-worktree mapping via `state.sqlite` is deferred to keep the initial implementation simple — the `.coord/.active` file covers the common case where a user is working inside a Coord worktree.

- **KTD3 — Blocked tools and resources return structured not-implemented errors, not silent empty data.** `team_ask` and `team_reply` return `isError: true` with a message explaining the inbox endpoint is not yet implemented. `coord://inbox` and `coord://conflicts` resources return empty arrays with a note. This signals to the agent that the capability exists but is awaiting backend work, rather than looking like there are no inbox messages or conflicts.

- **KTD4 — The `coord mcp` CLI command spawns the server as a Node subprocess.** The CLI command runs `node packages/mcp/dist/server.js` which starts the stdio transport. Claude Code's MCP configuration points to this command. The CLI is a thin wrapper — no argument parsing needed beyond optional `--repo` for repo root.

- **KTD5 — Resources use the existing `resolveMcpResource` function, tools use a new `resolveMcpTool` function.** The existing `resolveMcpResource` in `resources.ts` already handles workspace, participants, and vault context. A parallel `resolveMcpTool` function in a new `tools.ts` (replacing the current stub) dispatches tool calls to the appropriate daemon client function. Both functions share the same `McpResourceContext` for workspace resolution.

### Assumptions

- `@modelcontextprotocol/sdk` v1.x is compatible with Node.js 22+ and the pnpm workspace.
- The daemon is running on `http://127.0.0.1:9473` when the MCP server is invoked.
- `.coord/.active` contains the active session name (written by future hook injection or CLI `enter` command).
- The existing `resolveMcpResource` function and `McpDaemonReader` type are stable and can be extended.

---

## Implementation Units

### U1. Daemon client additions: postJson, publishEvent, searchVault

**Goal:** Add the daemon client functions needed by the MCP tools.

**Requirements:** R6

**Dependencies:** None

**Files:**
- `packages/mcp/src/daemon-client.ts` — add `postJson` helper, `publishEvent` function (POST `/workspaces/:id/events`), `searchVault` function (GET `/workspaces/:id/vault/search`)
- `packages/mcp/test/resources.test.cjs` — add tests for `publishEvent` and `searchVault` endpoint construction

**Approach:** Add a `postJson` helper mirroring the existing `getJson` pattern but using `POST` with a JSON body. `publishEvent` takes `(workspaceId, body, options)` where body is `PublishEventRequest` plus optional `actorId`/`deviceId`/`repoRoot`. `searchVault` takes `(workspaceId, query, options, limit?)` and calls `GET /workspaces/:id/vault/search?query=...&limit=...`.

**Patterns to follow:** Existing `getJson` and `getWorkspaceStatus` patterns in `daemon-client.ts`.

**Test scenarios:**
- Happy path: `publishEvent('ws_123', { targetFile: 'decisions.md', payload: { text: 'Test' } }, { repoRoot: '/tmp/repo' })` calls `POST /workspaces/ws_123/events` with the correct JSON body.
- Happy path: `searchVault('ws_123', 'invoice', { repoRoot: '/tmp/repo' })` calls `GET /workspaces/ws_123/vault/search?query=invoice&repoRoot=...`.
- Edge case: `searchVault` with `limit` parameter includes it in the query string.

**Verification:** `pnpm --filter @coord/mcp build && pnpm --filter @coord/mcp test` passes.

### U2. Workspace resolution: explicit params and .coord/.active fallback

**Goal:** Create a workspace resolution function that determines which workspace an MCP request targets.

**Requirements:** R2

**Dependencies:** None

**Files:**
- `packages/mcp/src/resolution.ts` (new) — `resolveWorkspaceContext` function that resolves `(workspaceId?, sessionName?, repoRoot?)` to an `McpResourceContext` with a valid `workspaceId`
- `packages/mcp/test/resolution.test.cjs` (new) — tests for resolution paths

**Approach:** `resolveWorkspaceContext` checks: (1) explicit `workspaceId` or `sessionName` param — return immediately if present. (2) Read `.coord/.active` file at the repo root — if it contains a session name, use it. (3) If neither resolves, throw an error with a clear message. The function returns `McpResourceContext` (which includes `workspaceId` and daemon options). The repo root is determined from the `repoRoot` param or defaults to `process.cwd()` walked up to find `.git`.

**Patterns to follow:** `resolveWorkspaceId` in `resources.ts` (existing fallback logic). `getWorkspaceByIdentifier` in daemon (accepts both ID and session name).

**Test scenarios:**
- Happy path: explicit `workspaceId` param returns immediately with that ID.
- Happy path: explicit `sessionName` param returns with that name as the workspace identifier.
- Happy path: `.coord/.active` file containing `billing-refactor` resolves to that session name.
- Edge case: `.coord/.active` file is empty or whitespace — falls through to error.
- Error path: no params and no `.coord/.active` file — throws with a clear message.
- Edge case: `.coord/.active` with trailing newline — trimmed correctly.

**Verification:** `pnpm --filter @coord/mcp build && pnpm --filter @coord/mcp test` passes.

### U3. MCP server with resources registration

**Goal:** Create the MCP server entry point that registers all 5 resources and connects over stdio transport.

**Requirements:** R1, R3, R7

**Dependencies:** U1, U2

**Files:**
- `packages/mcp/src/server.ts` (new) — `McpServer` instance with `StdioServerTransport`, registers 5 resources, wires `resolveMcpResource` for the 3 unblocked resources, returns stubs for inbox/conflicts
- `packages/mcp/package.json` — add `@modelcontextprotocol/sdk` dependency, add `start` script
- `packages/mcp/test/server.test.cjs` (new) — tests for resource registration and resolution

**Approach:** Create `McpServer` with name `coord` and version from `package.json`. Register each resource using `server.registerResource`. For `coord://workspace`, `coord://participants`, and `coord://vault/context`, call `resolveMcpResource` with the resolved workspace context. For `coord://inbox`, return `{ messages: [] }`. For `coord://conflicts`, return `{ conflicts: [] }`. Connect with `StdioServerTransport`. The server reads `repoRoot` from `process.env.COORD_REPO_ROOT` or `process.cwd()`.

**Patterns to follow:** MCP SDK's `server.registerResource` pattern from the official docs. Existing `resolveMcpResource` function in `resources.ts`.

**Test scenarios:**
- Happy path: reading `coord://workspace` returns workspace status with relay status when daemon is available.
- Happy path: reading `coord://participants` returns participants array.
- Happy path: reading `coord://vault/context` returns vault context.
- Happy path: reading `coord://inbox` returns `{ messages: [] }` (stub).
- Happy path: reading `coord://conflicts` returns `{ conflicts: [] }` (stub).
- Error path: reading a resource without workspace context returns an error.

**Verification:** `pnpm --filter @coord/mcp build` succeeds. Server starts and responds to `resources/list` and `resources/read` MCP protocol messages.

### U4. MCP tools registration

**Goal:** Register all 6 tools on the MCP server. 4 call the daemon, 2 return not-implemented stubs.

**Requirements:** R4, R7

**Dependencies:** U1, U2, U3

**Files:**
- `packages/mcp/src/server.ts` — add tool registrations for all 6 tools
- `packages/mcp/src/tools.ts` — replace stub with `resolveMcpTool` function that dispatches tool calls to daemon client functions
- `packages/mcp/test/tools.test.cjs` (new) — tests for tool execution and stubs

**Approach:** Register tools using `server.registerTool` with input schemas from the core contracts (`TeamPublishToolInput`, `VaultSearchToolInput`, `VaultReadToolInput`, `TeamAskToolInput`, `TeamReplyToolInput`). For `team_publish`, call `publishEvent` on the daemon and return the created event. For `vault_search`, call `searchVault` and return results. For `vault_read`, call `readVaultFile` and return file content. For `workspace_status`, call `getWorkspaceStatus` and return status. For `team_ask` and `team_reply`, return `{ isError: true, content: [{ type: 'text', text: 'Inbox endpoints not yet implemented. Phase 3 Step 1 required.' }] }`.

**Patterns to follow:** MCP SDK's `server.registerTool` pattern. Existing `resolveMcpResource` dispatch pattern.

**Test scenarios:**
- Happy path: `team_publish` with valid `targetFile` and `payload` calls daemon and returns the created event.
- Happy path: `vault_search` with a query calls daemon and returns search results.
- Happy path: `vault_read` with a path calls daemon and returns file content.
- Happy path: `workspace_status` calls daemon and returns workspace status.
- Error path: `team_ask` returns `isError: true` with not-implemented message.
- Error path: `team_reply` returns `isError: true` with not-implemented message.
- Error path: `team_publish` without workspace context returns an error.

**Verification:** `pnpm --filter @coord/mcp build && pnpm --filter @coord/mcp test` passes. All 6 tools appear in `tools/list` MCP protocol response.

### U5. CLI entry point and package wiring

**Goal:** Add `coord mcp` CLI command that spawns the MCP server, and wire the package build.

**Requirements:** R5

**Dependencies:** U3, U4

**Files:**
- `packages/cli/src/commands/mcp.ts` (new) — CLI command that spawns `node packages/mcp/dist/server.js` with stdio inheritance
- `packages/cli/src/index.ts` — register the `mcp` command
- `packages/mcp/package.json` — ensure `build` produces `dist/server.js`

**Approach:** The CLI command is a thin wrapper. `coord mcp` runs `node (packages/mcp/dist/server.js)` with `stdio: 'inherit'` so stdin/stdout flow directly to the MCP client (Claude Code). The command accepts optional `--repo <path>` to set `COORD_REPO_ROOT` env var. The MCP package's `tsconfig.json` already includes `src/server.ts` in the build.

**Patterns to follow:** Existing CLI command patterns in `packages/cli/src/commands/`. The daemon's `main()` function pattern.

**Test scenarios:**
- Test expectation: none — CLI command is a thin process spawn, verified by manual integration with Claude Code.

**Verification:** `pnpm build` succeeds. `pnpm coord mcp` starts the MCP server and speaks the protocol over stdio.

### U6. Integration tests

**Goal:** Test the MCP server end-to-end with a mocked daemon.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- `packages/mcp/test/integration.test.cjs` (new) — integration tests that start the MCP server, send JSON-RPC messages, and verify responses

**Approach:** Spawn the MCP server as a child process, send JSON-RPC `initialize` → `resources/list` → `resources/read` → `tools/list` → `tools/call` messages over stdin, and verify the responses on stdout. Mock the daemon by setting `COORD_DAEMON_URL` to a test HTTP server that returns canned responses.

**Test scenarios:**
- Happy path: `initialize` handshake returns server info with `coord` name.
- Happy path: `resources/list` returns all 5 resource URIs.
- Happy path: `tools/list` returns all 6 tool names.
- Happy path: `tools/call` with `team_publish` and valid args returns the created event from the daemon.
- Error path: `tools/call` with `team_ask` returns an error response with not-implemented message.
- Edge case: `resources/read` without workspace context returns an error.

**Verification:** `pnpm --filter @coord/mcp test` passes including integration tests.

---

## Verification Contract

| What | Command | Applies to |
|------|---------|------------|
| MCP package tests | `pnpm --filter @coord/mcp test` | U1, U2, U3, U4, U6 |
| Full build | `pnpm build` | All units |
| CLI build | `pnpm --filter @coord/cli build` | U5 |
| Core contract tests | `pnpm --filter @coord/core test` | U1 (no changes expected) |

## Definition of Done

- All 6 implementation units are complete with their test scenarios passing.
- `pnpm build` succeeds with no TypeScript errors.
- `pnpm --filter @coord/mcp test` passes.
- The MCP server starts via `pnpm coord mcp` and speaks the MCP protocol over stdio.
- All 5 resources are registered and return data (3 real, 2 stubs).
- All 6 tools are registered and respond (4 real, 2 not-implemented stubs).
- Workspace resolution works with explicit params and `.coord/.active` fallback.
- No dead-end or experimental code left in the diff.
