import { execFileSync } from 'node:child_process';

export type GitResult = { stdout: string; stderr: string; status: number };

/** Seam so commands can shell to git in prod and inject a fake in tests. */
export interface GitRunner {
  run(args: string[], cwd: string): GitResult;
}

type ExecError = { status?: number; stdout?: Buffer | string; stderr?: Buffer | string; message?: string };

export class ExecGitRunner implements GitRunner {
  run(args: string[], cwd: string): GitResult {
    try {
      const stdout = execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return { stdout: stdout.toString().trim(), stderr: '', status: 0 };
    } catch (error) {
      const err = error as ExecError;
      return {
        stdout: err.stdout ? err.stdout.toString().trim() : '',
        stderr: err.stderr ? err.stderr.toString().trim() : err.message ?? 'git command failed',
        status: typeof err.status === 'number' ? err.status : 1
      };
    }
  }
}

export function isGitIgnored(git: GitRunner, repoRoot: string, relPath: string): boolean {
  return git.run(['check-ignore', '-q', relPath], repoRoot).status === 0;
}

export function commitExists(git: GitRunner, repoRoot: string, commit: string): boolean {
  return git.run(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], repoRoot).status === 0;
}

export function branchExists(git: GitRunner, repoRoot: string, branch: string): boolean {
  return git.run(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).status === 0;
}

export type WorktreeEntry = { path: string; branch?: string; head?: string };

export function listWorktrees(git: GitRunner, repoRoot: string): WorktreeEntry[] {
  const res = git.run(['worktree', 'list', '--porcelain'], repoRoot);
  if (res.status !== 0) {
    return [];
  }
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice('worktree '.length).trim() };
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line === '' && current) {
      entries.push(current);
      current = null;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

export function addWorktree(
  git: GitRunner,
  repoRoot: string,
  opts: { path: string; branch: string; baseCommit: string; createBranch: boolean }
): void {
  const args = opts.createBranch
    ? ['worktree', 'add', '-b', opts.branch, opts.path, opts.baseCommit]
    : ['worktree', 'add', opts.path, opts.branch];
  const res = git.run(args, repoRoot);
  if (res.status !== 0) {
    throw new Error(`git worktree add failed: ${res.stderr || 'unknown error'}`);
  }
}

/** Best-effort: used for scoped rollback of a worktree we created this run. */
export function removeWorktree(git: GitRunner, repoRoot: string, path: string, force = false): void {
  git.run(['worktree', 'remove', ...(force ? ['--force'] : []), path], repoRoot);
}

/** Best-effort: used for scoped rollback of a branch we created this run. */
export function deleteBranch(git: GitRunner, repoRoot: string, branch: string, force = false): void {
  git.run(['branch', force ? '-D' : '-d', branch], repoRoot);
}
