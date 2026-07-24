const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtempSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const daemonClient = require('../dist/daemon-client.js');
const { runPublish } = require('../dist/commands/publish.js');

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeTrackWorktree() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-publish-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);
  git(['checkout', '-b', 'coord/auth-redesign/kushagra'], dir);
  return dir;
}

function stubDaemon({ listTracksImpl, publishEventImpl }) {
  const originalListTracks = daemonClient.listTracks;
  const originalPublishEvent = daemonClient.publishEvent;
  daemonClient.listTracks = listTracksImpl;
  daemonClient.publishEvent = publishEventImpl;
  return () => {
    daemonClient.listTracks = originalListTracks;
    daemonClient.publishEvent = originalPublishEvent;
  };
}

test('runPublish resolves the current track from the branch and appends the event', async () => {
  const dir = makeTrackWorktree();
  const originalCwd = process.cwd();
  let capturedArgs;
  const restore = stubDaemon({
    listTracksImpl: async () => ({ ok: true, data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }] } }),
    publishEventImpl: async (_options, workspaceId, body) => {
      capturedArgs = { workspaceId, body };
      return { ok: true, data: { event: { seq: 3 } } };
    }
  });

  try {
    process.chdir(dir);
    await runPublish(['decisions.md', 'Backend owns invoice state'], { repoRoot: dir, baseUrl: 'http://unused' });
    assert.deepEqual(capturedArgs, {
      workspaceId: 'ws_1',
      body: { targetFile: 'decisions.md', text: 'Backend owns invoice state' }
    });
  } finally {
    process.chdir(originalCwd);
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPublish rejects empty text before calling the daemon', async () => {
  const dir = makeTrackWorktree();
  let called = false;
  const restore = stubDaemon({
    listTracksImpl: async () => ({ ok: true, data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }] } }),
    publishEventImpl: async () => {
      called = true;
      return { ok: true, data: { event: { seq: 1 } } };
    }
  });

  try {
    await assert.rejects(() => runPublish(['decisions.md', '   '], { repoRoot: dir, baseUrl: 'http://unused' }), /must not be empty/);
    assert.equal(called, false, 'must not call the daemon with empty text');
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPublish passes through the daemon error for an invalid target file', async () => {
  const dir = makeTrackWorktree();
  const originalCwd = process.cwd();
  const restore = stubDaemon({
    listTracksImpl: async () => ({ ok: true, data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }] } }),
    publishEventImpl: async () => ({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Unsupported Phase 1 vault file: notes.md' } })
  });

  try {
    process.chdir(dir);
    await assert.rejects(
      () => runPublish(['notes.md', 'text'], { repoRoot: dir, baseUrl: 'http://unused' }),
      /Unsupported Phase 1 vault file/
    );
  } finally {
    process.chdir(originalCwd);
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPublish tells the user to `enter` a track worktree when the branch is not a participant branch', async () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tb-publish-notrack-')));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@local'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(['add', 'README.md'], dir);
  git(['commit', '-m', 'init'], dir);

  try {
    await assert.rejects(
      () => runPublish(['decisions.md', 'text'], { repoRoot: dir, baseUrl: 'http://unused' }),
      /Not inside a track worktree/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
