import { execFileSync } from 'node:child_process';
import type { ClientOptions } from '../daemon-client';
import { registerWorktree } from '../daemon-client';
import { prepareParticipantWorktree, rollbackParticipantWorktree } from '../lib/worktree';
import { writeWorktreePointer } from '../lib/pointers';
import { registerTrackStart } from './track';

export async function runStart(argv: string[], options: ClientOptions): Promise<void> {
  const { profile, projectId, started } = await registerTrackStart(argv, options);
  const { manifest } = started.data;
  const displayName = profile.displayName;

  let worktree;
  try {
    worktree = prepareParticipantWorktree({
      repoRoot: options.repoRoot,
      sessionName: manifest.sessionName,
      displayName,
      baseCommit: manifest.baseCommit
    });
  } catch (error) {
    // The daemon-registered track is not scoped to a single worktree, so it is
    // NOT rolled back here — only the local worktree/branch step failed, and
    // prepareParticipantWorktree throws before creating anything in that case.
    throw new Error(
      `Session "${manifest.sessionName}" was started (workspace id: ${manifest.id}), but creating your worktree failed:\n  ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    const registered = await registerWorktree(options, manifest.id, {
      userId: manifest.createdBy,
      path: worktree.path,
      branch: worktree.branch,
      baseCommit: manifest.baseCommit,
      currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree.path, encoding: 'utf8' }).trim(),
      dirty: false
    });
    if (!registered.ok) {
      throw new Error(registered.error.message);
    }

    writeWorktreePointer(options.repoRoot, {
      workspaceId: manifest.id,
      sessionName: manifest.sessionName,
      displayName,
      path: worktree.path,
      branch: worktree.branch,
      baseCommit: manifest.baseCommit,
      role: 'creator'
    });
  } catch (error) {
    // Worktree/branch WAS created this run — roll it back so a failed `start`
    // never leaves an orphaned worktree with no pointer to find it by.
    if (worktree.created) {
      rollbackParticipantWorktree({ repoRoot: options.repoRoot, path: worktree.path, branch: worktree.branch });
    }
    throw new Error(
      `Session "${manifest.sessionName}" was started (workspace id: ${manifest.id}), but recording your worktree failed:\n  ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const verb = worktree.reused ? 'Re-attached to' : 'Started';
  console.log(`${verb} session "${manifest.sessionName}" on project ${projectId} as ${displayName}.`);
  console.log(`Workspace id: ${manifest.id}`);
  console.log(`Branch:   ${worktree.branch}`);
  console.log(`Worktree: ${worktree.path}`);
  console.log(`Continue with: coord work ${manifest.sessionName}`);
}
