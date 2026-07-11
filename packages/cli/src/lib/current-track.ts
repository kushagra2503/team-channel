import { execFileSync } from 'node:child_process';
import type { Workspace } from '@teambridge/core';
import type { ClientOptions } from '../daemon-client';
import { listTracks } from '../daemon-client';

const PARTICIPANT_BRANCH_PATTERN = /^teambridge\/([^/]+)\/[^/]+$/;

/**
 * `publish` and `vault *` have no `<session_name>` argument — they operate on
 * "the current track", inferred from the branch `start`/`join` already
 * created (`teambridge/<session>/<safeName>`, see lib/naming.ts). Reads HEAD
 * from `cwd` (the literal invocation directory, which is the participant's
 * worktree — do not pass the U1-normalized repoRoot here).
 */
export function currentSessionNameFromBranch(cwd: string = process.cwd()): string | null {
  let branch: string;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
  const match = branch.match(PARTICIPANT_BRANCH_PATTERN);
  return match ? match[1] : null;
}

export function currentParticipantSlugFromBranch(cwd: string = process.cwd()): string | null {
  let branch: string;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
  const match = branch.match(PARTICIPANT_BRANCH_PATTERN);
  return match ? branch.slice(`teambridge/${match[1]}/`.length) : null;
}

export async function resolveCurrentTrack(options: ClientOptions, cwd: string = process.cwd()): Promise<Workspace> {
  const sessionName = currentSessionNameFromBranch(cwd);
  if (!sessionName) {
    throw new Error(
      'Not inside a track worktree. Run `teambridge enter <session_name>` and `cd` into the result first.'
    );
  }

  const tracks = await listTracks(options);
  if (!tracks.ok) {
    throw new Error(tracks.error.message);
  }
  const track = tracks.data.tracks.find((candidate) => candidate.sessionName === sessionName);
  if (!track) {
    throw new Error(`Session "${sessionName}" (from the current branch) was not found by the daemon.`);
  }
  return track;
}
