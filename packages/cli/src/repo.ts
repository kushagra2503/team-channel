import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
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
 * worktree and resolve back to it.
 *
 * Detection must be `--git-dir` vs `--git-common-dir`, NOT `--git-common-dir`
 * vs `--show-toplevel`: a git SUBMODULE also has `--git-common-dir` pointing
 * outside its own toplevel (`<superproject>/.git/modules/<name>`), and
 * `git worktree list` run from inside a submodule reports that internal
 * `.git/modules/...` path — not the submodule's real working directory —
 * which would silently point the daemon at a bogus path under `.git/`. A
 * genuine linked worktree is the only case where `--git-dir` differs from
 * `--git-common-dir` (`.git/worktrees/<name>` vs `.git`); a submodule's
 * `--git-dir` equals its own `--git-common-dir`.
 */
export function resolveRepoRoot(cwd: string = process.cwd()): string {
  let toplevel: string;
  try {
    toplevel = git(['rev-parse', '--show-toplevel'], resolve(cwd));
  } catch {
    throw new Error('Not inside a git repository. Run teambridge from your project repo root.');
  }

  let gitDir: string;
  let commonDir: string;
  try {
    gitDir = git(['rev-parse', '--path-format=absolute', '--git-dir'], toplevel);
    commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], toplevel);
  } catch {
    return toplevel;
  }

  if (gitDir === commonDir) {
    // Main repo, or a submodule/bare checkout with no separate worktree admin dir.
    return toplevel;
  }

  // Linked worktree: `git worktree list` always lists the main worktree first,
  // regardless of which worktree it's invoked from.
  const worktrees = listWorktrees(new ExecGitRunner(), toplevel);
  return worktrees[0]?.path ?? toplevel;
}

export function daemonBaseUrl(): string {
  const port = process.env.TEAMBRIDGE_DAEMON_PORT ?? '9473';
  return process.env.TEAMBRIDGE_DAEMON_URL ?? `http://127.0.0.1:${port}`;
}
