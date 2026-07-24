# CLI Worktrees (`work` / `start` / `join`)

How the `@coord/cli` creates and manages git worktrees. Owner: Kushagra.

## Model

- **The CLI owns git; the daemon owns state.** The daemon records worktree rows but never runs git — `git worktree add`/`remove` is 100% CLI-side.
- **Starter and joiners get isolated worktrees** cut from the session's frozen `base_commit`:

```
<repoRoot>/.coord/worktrees/<sessionSlug>/<safeName>/
```

- **Branch:** `coord/<sessionName>/<safeName>` — byte-for-byte the daemon's `branchForParticipant` (index.ts:778). The session name is used **raw** (validated `^[A-Za-z0-9._-]+$`); the path segment is sanitized. `<safeName>` mirrors the daemon's `safeDisplayName`.

## Recommended flow: `coord work [TRACK]`

`coord work` is the user-facing entry point over the lower-level `start`,
`join`, and `enter` operations:

1. Start the local daemon if it is not already healthy.
2. Run interactive initialization when the repository has no profile.
3. Resolve the requested track from the argument, current Coord branch, only
   available track, or an interactive picker.
4. Create a new track or join an existing local/relay track, repairing a
   missing local worktree pointer when needed.
5. Mark the track active for MCP resolution.
6. Launch the configured agent inside the participant worktree.

Claude Code is launched with a generated project MCP config and its Coord
context hook installed. Codex is launched with temporary `-c
mcp_servers.coord.*` overrides, so the user's global Codex config is not
modified. Use `--no-launch` to prepare the worktree only, or `--claude`,
`--codex`, `--cursor`, `--ghost`, and `--shell` for a one-run override.
These launch arguments follow the official
[Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
and [Codex CLI reference](https://developers.openai.com/codex/cli/reference/).

## `coord join [NAME] [--as DISPLAY_NAME]`

Flow (git-first, then daemon, so the daemon never records a row for a worktree that failed to materialize):

1. Resolve `repoRoot` (`git rev-parse --show-toplevel`) and the local user profile (run `coord init` first).
2. Resolve the track authoritatively via `GET /tracks` → its `id` + frozen `baseCommit`. (Refuses if missing or archived.)
3. Preflight (read-only): ensure `.coord/worktrees` is gitignored; check for an existing registered worktree (idempotent), branch checked out elsewhere, base commit present locally.
4. `git worktree add -b coord/<session>/<safeName> <path> <baseCommit>` (reuses the branch if it already exists).
5. `POST /workspaces/join` with `{ repoRoot, sessionName, displayName, agent, worktreePath }`.
6. Write a local pointer `.coord/workspaces/<session>/.worktree.<safeName>.json` (so a future `enter` resolves the path without reading SQLite).

**Continue in the worktree:** `coord work <session>` (printed by the command).

### Edge cases handled

| Case | Behavior |
|---|---|
| Re-join as the same name | Daemon `UNIQUE(participants)` 500 → translated to "already a participant"; **no rollback** (your prior work is kept). Exit 0. |
| Worktree already registered at the path | Idempotent — reused, no re-add. |
| Branch checked out elsewhere | Aborts with the conflicting path. |
| Base commit missing locally | Aborts with `git fetch origin <sha>` hint. |
| Invalid session name | Rejected before any daemon call. |
| `.coord/` not gitignored | Writes a self-contained `.coord/.gitignore` (`*`) rather than editing the repo's root ignore. |
| Daemon down / non-JSON | `daemon-client.request()` returns a clear `ApiFail` instead of throwing. |

## Code

```
packages/cli/src/lib/naming.ts     # safeDisplayName, branchForParticipant, worktreePathFor, assertValidSessionName
packages/cli/src/lib/git.ts        # GitRunner seam + git helpers (only place that shells to git)
packages/cli/src/lib/worktree.ts   # prepareParticipantWorktree / rollbackParticipantWorktree (shared by start + join)
packages/cli/src/lib/pointers.ts   # .worktree.<name>.json read/write
packages/cli/src/commands/start.ts # runStart
packages/cli/src/commands/track.ts # shared join/registration helpers
packages/cli/src/commands/work.ts  # high-level worktree + agent launcher
packages/cli/src/lib/agent.ts      # agent aliases, detection, commands
```

Tests: `packages/cli/test/worktree.test.cjs` (naming parity + worktree
orchestration with a fake `GitRunner`) and `packages/cli/test/work.test.cjs`
(Claude Code, Codex, Cursor, and shell launch plans).

## Known limitations (pending daemon asks — see `nihal-daemon-requests.md`)

- **`enter`/`status`** reconstruct the worktree path from the local pointer / deterministically, because the daemon doesn't expose worktree rows yet (ask #2).
- **`leave`/`clean`** will leave a stale daemon worktrees row until ask #3 (`DELETE …/worktree`) lands.
- **`safeDisplayName`** is replicated in the CLI; ask #6 lifts it into `@coord/core` to remove the drift risk.
