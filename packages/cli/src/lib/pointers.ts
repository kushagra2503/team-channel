import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeDisplayName } from './naming';

/**
 * Local record of where a participant's worktree lives, written next to the
 * track's vault under `.teambridge/workspaces/<sessionName>/`. Lets `enter`
 * resolve the path without reading the daemon's SQLite (the daemon does not
 * expose worktree rows yet — ask #2).
 */
export type WorktreePointer = {
  workspaceId: string;
  sessionName: string;
  displayName: string;
  path: string;
  branch: string;
  baseCommit: string;
  role: 'creator' | 'joiner';
};

function pointerDir(repoRoot: string, sessionName: string): string {
  return join(repoRoot, '.teambridge', 'workspaces', sessionName);
}

function pointerPath(repoRoot: string, sessionName: string, displayName: string): string {
  return join(pointerDir(repoRoot, sessionName), `.worktree.${safeDisplayName(displayName)}.json`);
}

export function writeWorktreePointer(repoRoot: string, pointer: WorktreePointer): string {
  const dir = pointerDir(repoRoot, pointer.sessionName);
  mkdirSync(dir, { recursive: true });
  const path = pointerPath(repoRoot, pointer.sessionName, pointer.displayName);
  writeFileSync(path, `${JSON.stringify(pointer, null, 2)}\n`);
  return path;
}

export function readWorktreePointer(
  repoRoot: string,
  sessionName: string,
  displayName: string
): WorktreePointer | null {
  const path = pointerPath(repoRoot, sessionName, displayName);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorktreePointer;
  } catch {
    return null;
  }
}
