const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const daemonClient = require('../dist/daemon-client.js');
const { runStart } = require('../dist/commands/start.js');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeRepo() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-start-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);
  return dir;
}

function stubDaemon({ displayName, baseCommit, startTrackImpl }) {
  const originalGetUserProfile = daemonClient.getUserProfile;
  const originalStartTrack = daemonClient.startTrack;
  daemonClient.getUserProfile = async () => ({
    ok: true,
    data: { profile: { displayName, defaultProjectId: 'proj_1' } }
  });
  daemonClient.startTrack =
    startTrackImpl ??
    (async (_options, body) => ({
      ok: true,
      data: {
        manifest: { id: 'ws_1', sessionName: body.sessionName, baseCommit, participants: [] },
        worktree: {}
      }
    }));
  return () => {
    daemonClient.getUserProfile = originalGetUserProfile;
    daemonClient.startTrack = originalStartTrack;
  };
}

test('runStart registers the track and creates a real worktree + pointer for the starter', async () => {
  const repo = makeRepo();
  const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const restore = stubDaemon({ displayName: 'Kushagra', baseCommit });

  try {
    await runStart(['auth-redesign'], { repoRoot: repo, baseUrl: 'http://unused' });

    const worktreePath = path.join(repo, '.teambridge', 'worktrees', 'auth-redesign', 'kushagra');
    assert.ok(existsSync(worktreePath), 'expected a real worktree directory to be created');

    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: worktreePath, encoding: 'utf8' }).trim();
    assert.equal(branch, 'teambridge/auth-redesign/kushagra');

    const pointerPath = path.join(repo, '.teambridge', 'workspaces', 'auth-redesign', '.worktree.kushagra.json');
    assert.ok(existsSync(pointerPath), 'expected a worktree pointer to be written');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
    assert.equal(pointer.role, 'creator');
    assert.equal(pointer.path, worktreePath);
  } finally {
    restore();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('runStart surfaces a clear error and leaves the daemon track registered when the worktree step fails', async () => {
  const repo = makeRepo();
  const restore = stubDaemon({ displayName: 'Kushagra', baseCommit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });

  try {
    await assert.rejects(
      () => runStart(['auth-redesign'], { repoRoot: repo, baseUrl: 'http://unused' }),
      /was started \(workspace id: ws_1\), but creating your worktree failed/
    );
    const worktreePath = path.join(repo, '.teambridge', 'worktrees', 'auth-redesign', 'kushagra');
    assert.ok(!existsSync(worktreePath), 'must not leave a partial worktree behind');
  } finally {
    restore();
    rmSync(repo, { recursive: true, force: true });
  }
});
