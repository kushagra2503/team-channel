import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { ExecGitRunner, listWorktrees } from './lib/git';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * `git rev-parse --show-toplevel` returns a LINKED worktree's own path when run
 * from inside one (e.g. a Teambridge participant worktree under
 * `.teambridge/worktrees/<session>/<name>`), not the main repo root where
 * `.teambridge/state.sqlite` and the vault actually live. Commands meant to run
 * post-`enter` (`publish`, `vault *`) need the main root, so detect a linked
 * worktree via `--git-common-dir` and resolve back to it.
 */
export function resolveRepoRoot(cwd: string = process.cwd()): string {
  let toplevel: string;
  try {
    toplevel = git(['rev-parse', '--show-toplevel'], resolve(cwd));
  } catch {
    throw new Error('Not inside a git repository. Run teambridge from your project repo root.');
  }

  let commonDir: string;
  try {
    commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], toplevel);
  } catch {
    return toplevel;
  }

  if (dirname(commonDir) === toplevel) {
    // Common dir's .git lives directly under this toplevel — not a linked worktree.
    return toplevel;
  }

  // Linked worktree: `git worktree list` always lists the main worktree first,
  // regardless of which worktree it's invoked from.
  const worktrees = listWorktrees(new ExecGitRunner(), toplevel);
  return worktrees[0]?.path ?? dirname(commonDir);
}

export function daemonBaseUrl(): string {
  const port = process.env.TEAMBRIDGE_DAEMON_PORT ?? '9473';
  return process.env.TEAMBRIDGE_DAEMON_URL ?? `http://127.0.0.1:${port}`;
}
