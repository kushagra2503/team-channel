const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtempSync, mkdirSync, realpathSync, rmSync } = require('node:fs');

const daemonClient = require('../dist/daemon-client.js');
const { writeWorktreePointer } = require('../dist/lib/pointers.js');
const { runEnter } = require('../dist/commands/enter.js');

function stubProfile(displayName) {
  const original = daemonClient.getUserProfile;
  daemonClient.getUserProfile = async () => ({ ok: true, data: { profile: { displayName } } });
  return () => {
    daemonClient.getUserProfile = original;
  };
}

function captureStdout() {
  const original = process.stdout.write.bind(process.stdout);
  let output = '';
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  return {
    restore: () => {
      process.stdout.write = original;
    },
    get output() {
      return output;
    }
  };
}

test('runEnter prints only the resolved worktree path to stdout', async () => {
  const repoRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-enter-')));
  const worktreePath = path.join(repoRoot, '.teambridge', 'worktrees', 'auth', 'kushagra');
  mkdirSync(worktreePath, { recursive: true });
  writeWorktreePointer(repoRoot, {
    workspaceId: 'ws_1',
    sessionName: 'auth',
    displayName: 'Kushagra',
    path: worktreePath,
    branch: 'teambridge/auth/kushagra',
    baseCommit: 'abc123',
    role: 'joiner'
  });
  const restoreProfile = stubProfile('Kushagra');
  const capture = captureStdout();

  try {
    await runEnter(['auth'], { repoRoot, baseUrl: 'http://unused' });
    assert.equal(capture.output, `${worktreePath}\n`);
  } finally {
    capture.restore();
    restoreProfile();
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('runEnter throws a clear error when no pointer was ever recorded', async () => {
  const repoRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-enter-missing-')));
  const restoreProfile = stubProfile('Kushagra');

  try {
    await assert.rejects(
      () => runEnter(['auth'], { repoRoot, baseUrl: 'http://unused' }),
      /No worktree found for "auth"/
    );
  } finally {
    restoreProfile();
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('runEnter throws a clear error when the recorded worktree no longer exists on disk', async () => {
  const repoRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-enter-stale-')));
  const worktreePath = path.join(repoRoot, '.teambridge', 'worktrees', 'auth', 'kushagra');
  writeWorktreePointer(repoRoot, {
    workspaceId: 'ws_1',
    sessionName: 'auth',
    displayName: 'Kushagra',
    path: worktreePath,
    branch: 'teambridge/auth/kushagra',
    baseCommit: 'abc123',
    role: 'joiner'
  });
  const restoreProfile = stubProfile('Kushagra');

  try {
    await assert.rejects(
      () => runEnter(['auth'], { repoRoot, baseUrl: 'http://unused' }),
      /no longer exists on disk/
    );
  } finally {
    restoreProfile();
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
