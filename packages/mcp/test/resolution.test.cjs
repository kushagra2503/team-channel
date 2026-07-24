const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { resolveWorkspaceContext } = require('../dist');

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-res-'));
  // Pretend this is a repo root by creating a .git marker so findRepoRoot
  // would also work, though tests pass repoRoot explicitly.
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test('explicit workspaceId returns immediately with that ID', async () => {
  const result = await resolveWorkspaceContext({ workspaceId: 'ws_123' });
  assert.equal(result.workspaceId, 'ws_123');
  assert.equal(result.sessionName, undefined);
});

test('explicit sessionName returns with that session name', async () => {
  const result = await resolveWorkspaceContext({ sessionName: 'billing-refactor' });
  assert.equal(result.sessionName, 'billing-refactor');
  assert.equal(result.workspaceId, undefined);
});

test('launcher-provided environment resolves the active workspace', async () => {
  const previousWorkspaceId = process.env.COORD_WORKSPACE_ID;
  const previousSessionName = process.env.COORD_SESSION_NAME;
  process.env.COORD_WORKSPACE_ID = 'ws_from_launcher';
  process.env.COORD_SESSION_NAME = 'launcher-track';
  try {
    const result = await resolveWorkspaceContext({});
    assert.equal(result.workspaceId, 'ws_from_launcher');
    assert.equal(result.sessionName, 'launcher-track');
  } finally {
    if (previousWorkspaceId === undefined) delete process.env.COORD_WORKSPACE_ID;
    else process.env.COORD_WORKSPACE_ID = previousWorkspaceId;
    if (previousSessionName === undefined) delete process.env.COORD_SESSION_NAME;
    else process.env.COORD_SESSION_NAME = previousSessionName;
  }
});

test('.coord/.active containing "billing-refactor\\n" resolves to that session name', async () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, '.coord'), { recursive: true });
    writeFileSync(join(dir, '.coord', '.active'), 'billing-refactor\n');
    const result = await resolveWorkspaceContext({ repoRoot: dir });
    assert.equal(result.sessionName, 'billing-refactor');
    assert.equal(result.workspaceId, undefined);
    assert.equal(result.repoRoot, dir);
  } finally {
    cleanup(dir);
  }
});

test('.coord/.active that is empty/whitespace falls through to error', async () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, '.coord'), { recursive: true });
    writeFileSync(join(dir, '.coord', '.active'), '   \n\t\n');
    await assert.rejects(
      () => resolveWorkspaceContext({ repoRoot: dir }),
      /Unable to resolve workspace/
    );
  } finally {
    cleanup(dir);
  }
});

test('no params and no .coord/.active file throws an error', async () => {
  const dir = makeTempRepo();
  try {
    await assert.rejects(
      () => resolveWorkspaceContext({ repoRoot: dir }),
      /Unable to resolve workspace/
    );
  } finally {
    cleanup(dir);
  }
});

test('.coord/.active with trailing newline is trimmed correctly', async () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, '.coord'), { recursive: true });
    writeFileSync(join(dir, '.coord', '.active'), 'feature-x\n\n');
    const result = await resolveWorkspaceContext({ repoRoot: dir });
    assert.equal(result.sessionName, 'feature-x');
  } finally {
    cleanup(dir);
  }
});
