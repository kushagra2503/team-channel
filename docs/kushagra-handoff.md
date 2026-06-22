# Kushagra Handoff

This is a simple handoff for the CLI work. Nihal has implemented the Phase 1 local backend pieces that the CLI can now call through the local daemon.

## What Exists Now

The repo is a pnpm workspace:

```text
packages/core   shared contracts, types, and zod schemas
packages/vault  vault helpers, materializer, context, and rebuild logic
packages/daemon local backend HTTP server
```

`core` is not the CLI. It is the shared contract layer. CLI should import public shapes from `@teambridge/core`, not from daemon internals.

`vault` is not the CLI. It owns reusable vault behavior that the daemon uses.

`daemon` is the local backend server. CLI commands should call the daemon HTTP endpoints.

## How To Run Backend

From the Teambridge repo:

```bash
pnpm install
pnpm build
pnpm daemon -- --port 9473
```

The daemon listens at:

```text
http://127.0.0.1:9473
```

Right now we test with `curl`. Later the CLI hides those HTTP calls.

## Repo Config

Nihal implemented repo-local config discovery.

The backend endpoint:

```text
POST /config/init
```

creates:

```text
repo/.teambridge/config.json
```

Default config:

```json
{
  "schemaVersion": 1,
  "defaultRelayMode": "local",
  "daemonPort": 9473,
  "mcpPort": 9474,
  "autoInject": true,
  "vaultInjectionMode": "compact",
  "vault": {
    "contextMaxBytes": 24000
  }
}
```

CLI mapping later:

```bash
teambridge init
```

should call:

```text
POST /config/init
```

and send the current git repo root as `repoRoot`.

## Important CLI Rule

The daemon should run generally. Users should not normally start it with a repo path.

Good final UX:

```bash
teambridge daemon
cd /some/repo
teambridge init
teambridge start billing-refactor main
```

The CLI should resolve the current working directory to the git repo root and send that as `repoRoot` in daemon requests.

For now, curl examples include `repoRoot` manually because CLI does not exist yet.

## Implemented Daemon Endpoints

Health:

```text
GET /health
```

Config:

```text
POST /config/init
GET /config?repoRoot=/path/to/repo
```

Workspaces:

```text
POST /workspaces/start
POST /workspaces/join
GET /workspaces?repoRoot=/path/to/repo
GET /workspaces/:workspaceId/status?repoRoot=/path/to/repo
```

Events:

```text
POST /workspaces/:workspaceId/events
GET /workspaces/:workspaceId/events?repoRoot=/path/to/repo
```

Vault:

```text
GET /workspaces/:workspaceId/vault/read?repoRoot=/path/to/repo&path=decisions.md
GET /workspaces/:workspaceId/vault/context?repoRoot=/path/to/repo
POST /workspaces/:workspaceId/vault/rebuild
```

## CLI Command Mapping

### `teambridge init`

Call:

```text
POST /config/init
```

Body:

```json
{
  "repoRoot": "/current/git/repo/root"
}
```

### `teambridge start billing-refactor main`

Call:

```text
POST /workspaces/start
```

Body:

```json
{
  "repoRoot": "/current/git/repo/root",
  "sessionName": "billing-refactor",
  "baseRef": "main",
  "displayName": "nihal"
}
```

The daemon creates:

```text
.teambridge/state.sqlite
.teambridge/workspaces/billing-refactor/manifest.json
.teambridge/workspaces/billing-refactor/events.jsonl
.teambridge/workspaces/billing-refactor/vault/
```

It also stores:

```text
workspace row
creator participant row
worktree row
local_sequences row with last_seq = 0
```

### `teambridge join billing-refactor --as kushagra`

Call:

```text
POST /workspaces/join
```

Body:

```json
{
  "repoRoot": "/current/git/repo/root",
  "sessionName": "billing-refactor",
  "displayName": "kushagra"
}
```

The daemon loads the existing workspace, keeps the recorded `baseCommit`, creates a participant, and updates the manifest.

Actual git worktree creation is still CLI-side work.

### `teambridge publish decisions.md "Backend is source of truth."`

Call:

```text
POST /workspaces/:workspaceId/events
```

Body:

```json
{
  "repoRoot": "/current/git/repo/root",
  "targetFile": "decisions.md",
  "payload": {
    "text": "Backend is source of truth."
  }
}
```

The daemon:

```text
increments local seq
appends one event line to events.jsonl
materializes the text into vault/decisions.md
updates local_sequences.last_seq
```

Example event:

```json
{
  "type": "publish",
  "seq": 1,
  "targetFile": "decisions.md",
  "payload": {
    "text": "Backend is source of truth."
  }
}
```

## Phase 1 Vault Files

Only these flat vault files are supported for now:

```text
README.md
decisions.md
observations.md
blockers.md
test-results.md
attempts.md
```

Publish targets should normally be one of:

```text
decisions.md
observations.md
blockers.md
test-results.md
attempts.md
```

`README.md` exists as vault intro text, but it is not a publish target.

## Runtime Validation

Nihal added `zod` schemas in `@teambridge/core`.

The daemon now validates request bodies and returns:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request body failed validation"
  }
}
```

for bad inputs.

## Tests

Contract tests exist in:

```text
packages/core/test/contracts.test.cjs
```

Run:

```bash
pnpm build
pnpm test
```

The tests cover:

```text
WorkspaceManifest
Participant
PublishEvent
VaultContext
ApiResult
TeambridgeConfig
```

## What Kushagra Should Build Next

Build `packages/cli`.

The CLI should:

```text
resolve current git repo root
call daemon endpoints
hide curl/HTTP from users
create git worktrees/branches where needed
print friendly output
```

Main commands to wire first:

```bash
teambridge init
teambridge start <session_name> [base_ref]
teambridge join <session_name> --as <display_name>
teambridge publish <target_file> <text>
teambridge vault read <path>
teambridge vault context
teambridge vault rebuild <session_name>
teambridge status
```

The backend pieces for these are now mostly ready. The biggest remaining CLI-side responsibility is making the user experience clean and creating/managing actual git worktrees.
