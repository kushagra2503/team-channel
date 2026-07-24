import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeDisplayName } from './naming';

/**
 * Local "last context I saw" marker, written next to the track's vault under
 * `.coord/workspaces/<sessionName>/`. `coord context` uses it to show
 * only what changed since a participant last pulled context — the delta the
 * Claude Code SessionStart hook injects. It is a local read cursor, not shared
 * state, so it is intentionally kept out of `events.jsonl` and the relay.
 */
export type ContextPointer = {
  workspaceId: string;
  sessionName: string;
  displayName: string;
  lastSeenSeq: number;
  updatedAt: string;
};

function pointerDir(repoRoot: string, sessionName: string): string {
  return join(repoRoot, '.coord', 'workspaces', sessionName);
}

function pointerPath(repoRoot: string, sessionName: string, displayName: string): string {
  return join(pointerDir(repoRoot, sessionName), `.context.${safeDisplayName(displayName)}.json`);
}

export function readContextPointer(
  repoRoot: string,
  sessionName: string,
  displayName: string
): ContextPointer | null {
  const path = pointerPath(repoRoot, sessionName, displayName);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ContextPointer;
  } catch {
    return null;
  }
}

export function writeContextPointer(repoRoot: string, pointer: ContextPointer): string {
  const dir = pointerDir(repoRoot, pointer.sessionName);
  mkdirSync(dir, { recursive: true });
  const path = pointerPath(repoRoot, pointer.sessionName, pointer.displayName);
  writeFileSync(path, `${JSON.stringify(pointer, null, 2)}\n`);
  return path;
}
