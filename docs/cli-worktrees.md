# CLI Worktrees (`track join`)

How the `@teambridge/cli` creates and manages git worktrees. Owner: Kushagra.

## Model

- **The CLI owns git; the daemon owns state.** The daemon records worktree rows but never runs git — `git worktree add`/`remove` is 100% CLI-side.
- **Creator works in `repoRoot`** (matches the daemon's hardcoded `worktrees.path = repoRoot` on `start`).
- **Joiners get an isolated worktree** cut from the track's frozen `base_commit`:

```
<repoRoot>/.teambridge/worktrees/<sessionSlug>/<safeName>/
```

- **Branch:** `teambridge/<sessionName>/<safeName>` — byte-for-byte the daemon's `branchForParticipant` (index.ts:778). The session name is used **raw** (validated `^[A-Za-z0-9._-]+$`); the path segment is sanitized. `<safeName>` mirrors the daemon's `safeDisplayName`.

## `teambridge track join [NAME] [--as DISPLAY_NAME]`

Flow (git-first, then daemon, so the daemon never records a row for a worktree that failed to materialize):

1. Resolve `repoRoot` (`git rev-parse --show-toplevel`) and the local user profile (run `teambridge init` first).
2. Resolve the track authoritatively via `GET /tracks` → its `id` + frozen `baseCommit`. (Refuses if missing or archived.)
3. Preflight (read-only): ensure `.teambridge/worktrees` is gitignored; check for an existing registered worktree (idempotent), branch checked out elsewhere, base commit present locally.
4. `git worktree add -b teambridge/<session>/<safeName> <path> <baseCommit>` (reuses the branch if it already exists).
5. `POST /workspaces/join` with `{ repoRoot, sessionName, displayName, agent, worktreePath }`.
6. Write a local pointer `.teambridge/workspaces/<session>/.worktree.<safeName>.json` (so a future `enter` resolves the path without reading SQLite).

**Enter the worktree:** `cd "$(... printed path)" && claude` (printed by the command).

### Edge cases handled

| Case | Behavior |
|---|---|
| Re-join as the same name | Daemon `UNIQUE(participants)` 500 → translated to "already a participant"; **no rollback** (your prior work is kept). Exit 0. |
| Worktree already registered at the path | Idempotent — reused, no re-add. |
| Branch checked out elsewhere | Aborts with the conflicting path. |
| Base commit missing locally | Aborts with `git fetch origin <sha>` hint. |
| Invalid session name | Rejected before any daemon call. |
| `.teambridge/` not gitignored | Writes a self-contained `.teambridge/.gitignore` (`*`) rather than editing the repo's root ignore. |
| Daemon down / non-JSON | `daemon-client.request()` returns a clear `ApiFail` instead of throwing. |

## Code

```
packages/cli/src/lib/naming.ts     # safeDisplayName, branchForParticipant, worktreePathFor, assertValidSessionName
packages/cli/src/lib/git.ts        # GitRunner seam + git helpers (only place that shells to git)
packages/cli/src/lib/worktree.ts   # prepareParticipantWorktree / rollbackParticipantWorktree (shared by start + join)
packages/cli/src/lib/pointers.ts   # .worktree.<name>.json read/write
packages/cli/src/commands/track.ts # runTrackJoin
packages/cli/src/commands/start.ts # runStart (creator worktree, symmetric with join)
```

Tests: `packages/cli/test/worktree.test.cjs` (naming parity + worktree orchestration with a fake `GitRunner`).

## Known limitations (pending daemon asks — see `nihal-daemon-requests.md`)

- **Creator isolation** waits on daemon ask #1 (`worktreePath` on `start`). Until then the creator stays in `repoRoot`.
- **`enter`/`status`** reconstruct the worktree path from the local pointer / deterministically, because the daemon doesn't expose worktree rows yet (ask #2).
- **`leave`/`clean`** will leave a stale daemon worktrees row until ask #3 (`DELETE …/worktree`) lands.
- **`safeDisplayName`** is replicated in the CLI; ask #6 lifts it into `@teambridge/core` to remove the drift risk.
