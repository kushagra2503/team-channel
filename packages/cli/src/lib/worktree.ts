import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addWorktree,
  branchExists,
  commitExists,
  deleteBranch,
  ExecGitRunner,
  type GitRunner,
  isGitIgnored,
  listWorktrees,
  removeWorktree
} from './git';
import { branchForParticipant, worktreePathFor } from './naming';

export type ParticipantWorktreeParams = {
  repoRoot: string;
  sessionName: string; // raw, already validated
  displayName: string;
  baseCommit: string;
};

export type ParticipantWorktreeResult = {
  path: string;
  branch: string;
  /** True only when this invocation created the git worktree (drives scoped rollback). */
  created: boolean;
  /** True when an identical worktree was already registered and we reused it. */
  reused: boolean;
};

/**
 * Worktrees live under `.teambridge/`, which must be gitignored or the linked
 * worktree shows as an untracked dir in the superproject. The repo's root
 * .gitignore normally covers `.teambridge/`; if it doesn't, drop a self-contained
 * `.teambridge/.gitignore` (`*`) rather than editing the user's root ignore.
 */
function ensureTeambridgeIgnored(git: GitRunner, repoRoot: string): void {
  if (isGitIgnored(git, repoRoot, '.teambridge/worktrees')) {
    return;
  }
  const dir = join(repoRoot, '.teambridge');
  mkdirSync(dir, { recursive: true });
  const ignoreFile = join(dir, '.gitignore');
  if (!existsSync(ignoreFile)) {
    writeFileSync(ignoreFile, '*\n');
  }
}

/**
 * Create (or reuse) an isolated git worktree for a joiner, cut from the track's
 * immutable base commit on branch `teambridge/<session>/<safeName>`. Read-only
 * preflight first; never clobbers an existing path it doesn't recognize.
 */
export function prepareParticipantWorktree(
  params: ParticipantWorktreeParams,
  git: GitRunner = new ExecGitRunner()
): ParticipantWorktreeResult {
  const { repoRoot, sessionName, displayName, baseCommit } = params;
  const branch = branchForParticipant(sessionName, displayName);
  const path = worktreePathFor(repoRoot, sessionName, displayName);

  ensureTeambridgeIgnored(git, repoRoot);

  // Idempotency / collision preflight (read-only).
  const registered = listWorktrees(git, repoRoot);
  const atPath = registered.find((entry) => entry.path === path);
  if (atPath) {
    if (atPath.branch && atPath.branch !== branch) {
      throw new Error(`Worktree path is already checked out for a different branch (${atPath.branch}):\n  ${path}`);
    }
    return { path, branch, created: false, reused: true };
  }
  const branchElsewhere = registered.find((entry) => entry.branch === branch);
  if (branchElsewhere) {
    throw new Error(`Branch ${branch} is already checked out at:\n  ${branchElsewhere.path}`);
  }

  if (!commitExists(git, repoRoot, baseCommit)) {
    throw new Error(`Base commit ${baseCommit} is not present locally. Fetch it first:\n  git fetch origin ${baseCommit}`);
  }

  if (existsSync(path)) {
    throw new Error(`Path already exists and is not a registered worktree:\n  ${path}\nRemove it manually and retry.`);
  }

  // Reuse the branch if it already exists (the user's prior work on this track);
  // otherwise create it at the base commit.
  const reuseBranch = branchExists(git, repoRoot, branch);
  addWorktree(git, repoRoot, { path, branch, baseCommit, createBranch: !reuseBranch });

  if (existsSync(join(repoRoot, '.gitmodules'))) {
    git.run(['-C', path, 'submodule', 'update', '--init', '--recursive'], repoRoot);
  }

  return { path, branch, created: true, reused: false };
}

/** Undo a worktree + branch that THIS invocation created (never on duplicate-name). */
export function rollbackParticipantWorktree(
  params: { repoRoot: string; path: string; branch: string },
  git: GitRunner = new ExecGitRunner()
): void {
  removeWorktree(git, params.repoRoot, params.path, true);
  deleteBranch(git, params.repoRoot, params.branch, true);
}
