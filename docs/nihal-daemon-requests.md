# Daemon Change Requests (from Kushagra / CLI)

This is a handoff from the CLI side. While designing `packages/cli`'s git-worktree subsystem I
grounded everything in the current daemon (`packages/daemon/src/index.ts`) and found seven
additive changes that would make the CLI cleaner and safer.

**None of these block CLI v1.** The CLI ships against the daemon exactly as it is today:
- The **creator** works in `repoRoot` — which matches the hardcoded `worktrees.path = repoRoot`
  row that `startWorkspace` already writes.
- **Joiners** get isolated git worktrees, and the CLI passes `worktreePath` to `join`, which the
  daemon already accepts and records faithfully.
- `enter`/`leave` use CLI-local pointer files + deterministic path reconstruction; the CLI never
  reads or writes `state.sqlite`.

So treat these as *unlocks for the next milestone*, not blockers. They are ranked by value to the
CLI. **If you only do one, do #1.** **#6 is tiny and prevents our single worst silent bug.**

All line numbers reference `packages/daemon/src/index.ts` as it stands today.

## Summary

| # | Ask | Blocks CLI v1? | Unlocks | Priority |
|---|-----|---------------|---------|----------|
| 1 | `worktreePath` (+ optional `branch`) on `POST /workspaces/start` | No | Daemon-owned **creator isolation** (the product goal) | HIGH |
| 2 | Expose `worktrees` rows (in `/status` or a new `GET .../worktree`) | No | `enter`/`status` read the path from an API instead of reconstructing it | HIGH |
| 3 | `DELETE /workspaces/:id/worktree` | No | `leave`/`clean` clears the row instead of leaving it stale | MEDIUM |
| 4 | `/status` resolves by session name (not id-only) | No | Drops a `GET /workspaces` round-trip before `status` | MEDIUM |
| 5 | Transaction-wrap + idempotent `join` inserts | No | True idempotent re-join (no orphan participant, no opaque 500) | MEDIUM |
| 6 | Shared `safeDisplayName` / `sanitizeSessionName` in `@teambridge/core` | No | Kills branch-string drift under `UNIQUE(branch)` | HIGH (low effort) |
| 7 | Compute `current_commit` from the worktree, not repoRoot HEAD | No | Accurate per-worktree commit | LOW |

---

## #1 — Accept `worktreePath` (and optional `branch`) on `start` · HIGH

**Why.** Today `start` hardcodes the creator's `worktrees.path = repoRoot` (index.ts:453) and
`persistedBranch = currentBranch` unless HEAD is detached (index.ts:414). That is the *only*
asymmetry versus `join`, which already accepts `worktreePath` (index.ts:50). Accepting it on
`start` lets the CLI create an isolated creator worktree and have the daemon record a truthful
row — with no CLI-side DB writes.

**Change.**
- index.ts:44 — extend `StartRequestBodySchema` with `worktreePath: z.string().min(1).optional()`
  (mirror `JoinRequestBodySchema` at :48–51).
- In `startWorkspace`: when `worktreePath` is present, set the `worktrees` insert
  `path = resolve(body.worktreePath)` (replace `sqlValue(repoRoot)` at :453) and
  `persistedBranch = teambridge/<session>/<safeName>` (override the `currentBranch` logic at :414).
  When absent → behavior byte-identical to today.

**Acceptance.** `POST /workspaces/start` with `worktreePath` persists a `worktrees` row at that
path on the teambridge branch; without it, unchanged.
**CLI use.** Flip the creator to the same git-first sequence as a joiner — the product's
"separate hands" isolation for everyone, with the daemon owning the DB.

## #2 — Expose `worktrees` rows · HIGH

**Why.** `/status` returns workspace + participants + `lastSeq` (index.ts:817–821) but **not** the
`worktrees` table, and there is no other read path — so the CLI reconstructs the worktree path
deterministically. `WorktreeInfo` already exists in `core/src/contracts/git.ts`.

**Change.** Add `worktrees: WorktreeInfo[]` to the `/status` response, **or** add
`GET /workspaces/:id/worktree?userId=...&repoRoot=...`.

**Acceptance.** CLI can fetch the authoritative path / branch / baseCommit per participant.
**CLI use.** `enter` and `status` become endpoint-driven; removes any reason to touch `state.sqlite`.

## #3 — `DELETE /workspaces/:id/worktree` · MEDIUM

**Why.** There is no removal endpoint, so `leave`/`clean` does the git removal but must leave the
daemon row **stale** — which then blocks re-join via `UNIQUE(path)` / `UNIQUE(branch)`.

**Change.** `DELETE /workspaces/:id/worktree` with `{ repoRoot, userId }` → delete the matching
`worktrees` row.

**Acceptance.** After removal, the path/branch are free to re-register.
**CLI use.** `leave` clears the row; re-join works cleanly.

## #4 — `/status` resolves by session name · MEDIUM

**Why.** The status route matches `where id = <workspaceId>` only (index.ts:804), while
events/vault accept id **or** session name via `getWorkspaceByIdentifier` (index.ts:503–511).
The CLI must do a `GET /workspaces` lookup just to map name → id before calling status.

**Change.** Route `/workspaces/:id/status` through `getWorkspaceByIdentifier`.

**Acceptance.** `GET /workspaces/<sessionName>/status` works.
**CLI use.** One fewer round-trip for `status` / `ws show`.

## #5 — Transaction-wrap + idempotent `join` · MEDIUM

**Why.** Join's participant insert (index.ts:575) is a plain `INSERT` **not** in a transaction
with the worktree insert (index.ts:592). A `worktrees` UNIQUE failure can leave an **orphan
participant**; a duplicate-name re-join surfaces as an opaque HTTP 500 (`UNIQUE constraint failed`).

**Change.** Wrap both inserts in one `begin; … commit;`; make participants `insert or replace`
keyed on `(workspace_id, display_name)` — or return a typed `CONFLICT` / idempotent OK instead of
a raw 500.

**Acceptance.** Re-join is idempotent and returns a clean result; no orphan rows.
**CLI use.** Lets the CLI drop its "translate 500 → already joined" workaround.

## #6 — Shared sanitizer in `@teambridge/core` · HIGH (low effort)

**Why.** The branch string `teambridge/<rawSession>/<safeName>` must be **byte-identical** on both
sides, or `UNIQUE(branch)` reconciliation breaks. Today `safeDisplayName` lives only in the daemon
(index.ts:169–175) and the CLI has to hand-replicate it — a drift risk that turns into a silent
join failure. This is the single highest-risk invariant between our two packages.

**Change.** Lift `safeDisplayName` into `@teambridge/core` and add `assertValidSessionName` /
`sanitizeSessionName`; the daemon imports from there. Also worth deciding: should the daemon
**validate** `sessionName` against `^[A-Za-z0-9._-]+$` server-side? It currently stores the name
raw into a git ref (index.ts:371, 378), so a name with spaces / `..` / leading `-` persists an
unusable branch string that `git worktree add -b` will later reject.

**Acceptance.** One implementation imported by daemon + CLI.
**CLI use.** Import instead of duplicate — eliminates the drift.

## #7 — Correct `current_commit` · LOW

**Why.** `current_commit` is computed from repoRoot `HEAD` (index.ts:380, 589) even for a joiner
whose worktree is elsewhere → stale once commits diverge.

**Change.** When `worktreePath` is known, compute `git -C <worktreePath> rev-parse HEAD`.

**Acceptance.** `current_commit` reflects the actual worktree. (Cosmetic until `/status` exposes
worktrees — pairs with #2.)
