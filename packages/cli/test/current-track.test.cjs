const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const daemonClient = require('../dist/daemon-client.js');
const { currentSessionNameFromBranch, resolveCurrentTrack } = require('../dist/lib/current-track.js');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeRepoOnBranch(branch) {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-current-track-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  require('node:fs').writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);
  if (branch) {
    git(['checkout', '-b', branch], dir);
  }
  return dir;
}

test('currentSessionNameFromBranch parses the session out of a participant branch', () => {
  const dir = makeRepoOnBranch('teambridge/auth-redesign/kushagra');
  try {
    assert.equal(currentSessionNameFromBranch(dir), 'auth-redesign');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('currentSessionNameFromBranch returns null on a non-teambridge branch', () => {
  const dir = makeRepoOnBranch(null);
  try {
    assert.equal(currentSessionNameFromBranch(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('currentSessionNameFromBranch returns null outside any git repository', () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-notrepo-')));
  try {
    assert.equal(currentSessionNameFromBranch(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveCurrentTrack throws when not inside a track worktree', async () => {
  const dir = makeRepoOnBranch(null);
  try {
    await assert.rejects(() => resolveCurrentTrack({ repoRoot: dir, baseUrl: 'http://unused' }, dir), /Not inside a track worktree/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveCurrentTrack resolves the workspace matching the branch session name', async () => {
  const dir = makeRepoOnBranch('teambridge/auth-redesign/kushagra');
  const original = daemonClient.listTracks;
  daemonClient.listTracks = async () => ({
    ok: true,
    data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }, { id: 'ws_2', sessionName: 'other' }] }
  });
  try {
    const track = await resolveCurrentTrack({ repoRoot: dir, baseUrl: 'http://unused' }, dir);
    assert.equal(track.id, 'ws_1');
  } finally {
    daemonClient.listTracks = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveCurrentTrack throws when the daemon does not know the branch-derived session', async () => {
  const dir = makeRepoOnBranch('teambridge/ghost-session/kushagra');
  const original = daemonClient.listTracks;
  daemonClient.listTracks = async () => ({ ok: true, data: { tracks: [] } });
  try {
    await assert.rejects(
      () => resolveCurrentTrack({ repoRoot: dir, baseUrl: 'http://unused' }, dir),
      /was not found by the daemon/
    );
  } finally {
    daemonClient.listTracks = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
