const test = require('node:test');
const assert = require('node:assert/strict');

const daemonClient = require('../dist/daemon-client.js');
const { runStatus } = require('../dist/commands/status.js');

const OPTIONS = { repoRoot: '/repo', baseUrl: 'http://unused' };

function stubStatus({ profile, projects, tracks }) {
  const originalGetUserProfile = daemonClient.getUserProfile;
  const originalListProjects = daemonClient.listProjects;
  const originalListTracks = daemonClient.listTracks;

  daemonClient.getUserProfile = async () => profile;
  daemonClient.listProjects = async () => projects;
  daemonClient.listTracks = async () => tracks;

  return () => {
    daemonClient.getUserProfile = originalGetUserProfile;
    daemonClient.listProjects = originalListProjects;
    daemonClient.listTracks = originalListTracks;
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

test('status prints profile, projects, and tracks when daemon calls succeed', async () => {
  const restore = stubStatus({
    profile: { ok: true, data: { profile: { displayName: 'Nihal', defaultProjectId: 'proj_1' } } },
    projects: { ok: true, data: { projects: [{ id: 'proj_1', name: 'Beacon' }] } },
    tracks: { ok: true, data: { tracks: [{ id: 'ws_1', sessionName: 'auth-redesign', projectId: 'proj_1' }] } }
  });
  const capture = captureStdout();

  try {
    await runStatus([], OPTIONS);
    assert.match(capture.output, /You: Nihal/);
    assert.match(capture.output, /Projects: 1/);
    assert.match(capture.output, /auth-redesign → proj_1/);
  } finally {
    capture.restore();
    restore();
  }
});

test('status fails when daemon is unreachable', async () => {
  const restore = stubStatus({
    profile: { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Cannot reach the coord daemon' } },
    projects: { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Cannot reach the coord daemon' } },
    tracks: { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Cannot reach the coord daemon' } }
  });

  try {
    await assert.rejects(() => runStatus([], OPTIONS), /Cannot reach the coord daemon/);
  } finally {
    restore();
  }
});
