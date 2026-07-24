const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, realpathSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveRepoRoot } = require('../dist/repo.js');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeRepo() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-repo-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  execFileSync('sh', ['-c', 'echo hi > README.md'], { cwd: dir });
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);
  return dir;
}

test('resolveRepoRoot returns the repo root unchanged when run from the main worktree', () => {
  const repo = makeRepo();
  try {
    assert.equal(resolveRepoRoot(repo), repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveRepoRoot resolves to the main repo root when run from inside a linked worktree', () => {
  const repo = makeRepo();
  const worktreePath = path.join(repo, '.coord', 'worktrees', 'auth', 'kushagra');
  try {
    git(['worktree', 'add', '-b', 'coord/auth/kushagra', worktreePath, 'HEAD'], repo);
    assert.equal(resolveRepoRoot(worktreePath), repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveRepoRoot resolves to the main repo root from a subdirectory nested inside a linked worktree', () => {
  const repo = makeRepo();
  const worktreePath = path.join(repo, '.coord', 'worktrees', 'auth', 'kushagra');
  try {
    git(['worktree', 'add', '-b', 'coord/auth/kushagra', worktreePath, 'HEAD'], repo);
    const nested = path.join(worktreePath);
    assert.equal(resolveRepoRoot(nested), repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveRepoRoot returns the submodule\'s own toplevel, not its internal .git/modules path', () => {
  const mainRepo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-repo-main-')));
  const subRepo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-repo-sub-')));
  try {
    git(['init', '-b', 'main'], subRepo);
    git(['config', 'user.email', 'test@local'], subRepo);
    git(['config', 'user.name', 'Test'], subRepo);
    execFileSync('sh', ['-c', 'echo sub > f.txt'], { cwd: subRepo });
    git(['add', 'f.txt'], subRepo);
    git(['commit', '-m', 'sub init'], subRepo);

    git(['init', '-b', 'main'], mainRepo);
    git(['config', 'user.email', 'test@local'], mainRepo);
    git(['config', 'user.name', 'Test'], mainRepo);
    execFileSync('sh', ['-c', 'echo main > m.txt'], { cwd: mainRepo });
    git(['add', 'm.txt'], mainRepo);
    git(['commit', '-m', 'main init'], mainRepo);
    execFileSync(
      'git',
      ['-c', 'protocol.file.allow=always', 'submodule', 'add', subRepo, 'vendor/lib'],
      { cwd: mainRepo, stdio: 'ignore' }
    );
    git(['commit', '-m', 'add submodule'], mainRepo);

    const submodulePath = path.join(mainRepo, 'vendor', 'lib');
    assert.equal(resolveRepoRoot(submodulePath), submodulePath);
  } finally {
    rmSync(mainRepo, { recursive: true, force: true });
    rmSync(subRepo, { recursive: true, force: true });
  }
});

test('resolveRepoRoot throws a clear error outside any git repository', () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-notrepo-')));
  try {
    assert.throws(() => resolveRepoRoot(dir), /Not inside a git repository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
