const test = require('node:test');
const assert = require('node:assert/strict');

const daemonClient = require('../dist/daemon-client.js');
const { runWs } = require('../dist/commands/ws.js');

const OPTIONS = { repoRoot: '/repo', baseUrl: 'http://unused' };

function stubDaemon({ tracks, status }) {
  const originalListTracks = daemonClient.listTracks;
  const originalGetWorkspaceStatus = daemonClient.getWorkspaceStatus;
  daemonClient.listTracks = async () => ({ ok: true, data: { tracks } });
  daemonClient.getWorkspaceStatus = async () => status;
  return () => {
    daemonClient.listTracks = originalListTracks;
    daemonClient.getWorkspaceStatus = originalGetWorkspaceStatus;
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

const TWO_PARTICIPANTS = {
  ok: true,
  data: {
    workspace: { id: 'ws_1', sessionName: 'auth-redesign', status: 'active', baseCommit: 'abc123' },
    participants: [
      { displayName: 'Kushagra', status: 'active', agent: 'claude-code', branch: 'coord/auth-redesign/kushagra' },
      { displayName: 'Ronish', status: 'idle', agent: 'cursor', branch: 'coord/auth-redesign/ronish' }
    ],
    lastSeq: 5
  }
};

test('ws show prints a workspace summary', async () => {
  const restore = stubDaemon({ tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }], status: TWO_PARTICIPANTS });
  const capture = captureStdout();
  try {
    await runWs(['show', 'auth-redesign'], OPTIONS);
    assert.match(capture.output, /Session:\s+auth-redesign/);
    assert.match(capture.output, /Participants:\s+2/);
    assert.match(capture.output, /Last seq:\s+5/);
  } finally {
    capture.restore();
    restore();
  }
});

test('ws who lists each participant with status and agent', async () => {
  const restore = stubDaemon({ tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }], status: TWO_PARTICIPANTS });
  const capture = captureStdout();
  try {
    await runWs(['who', 'auth-redesign'], OPTIONS);
    assert.equal(capture.output, 'Kushagra\tactive\tclaude-code\nRonish\tidle\tcursor\n');
  } finally {
    capture.restore();
    restore();
  }
});

test('ws branches lists each participant branch', async () => {
  const restore = stubDaemon({ tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }], status: TWO_PARTICIPANTS });
  const capture = captureStdout();
  try {
    await runWs(['branches', 'auth-redesign'], OPTIONS);
    assert.equal(
      capture.output,
      'coord/auth-redesign/kushagra\tKushagra\ncoord/auth-redesign/ronish\tRonish\n'
    );
  } finally {
    capture.restore();
    restore();
  }
});

test('ws show|who|branches pass through a daemon status-fetch error', async () => {
  const restore = stubDaemon({
    tracks: [{ id: 'ws_1', sessionName: 'auth-redesign' }],
    status: { ok: false, error: { code: 'INTERNAL_ERROR', message: 'daemon unavailable' } }
  });
  try {
    await assert.rejects(() => runWs(['show', 'auth-redesign'], OPTIONS), /daemon unavailable/);
    await assert.rejects(() => runWs(['who', 'auth-redesign'], OPTIONS), /daemon unavailable/);
    await assert.rejects(() => runWs(['branches', 'auth-redesign'], OPTIONS), /daemon unavailable/);
  } finally {
    restore();
  }
});

test('ws show|who|branches throw a clear error for an unknown session name', async () => {
  const restore = stubDaemon({ tracks: [], status: TWO_PARTICIPANTS });
  try {
    await assert.rejects(() => runWs(['show', 'ghost'], OPTIONS), /not found. Start it first/);
    await assert.rejects(() => runWs(['who', 'ghost'], OPTIONS), /not found. Start it first/);
    await assert.rejects(() => runWs(['branches', 'ghost'], OPTIONS), /not found. Start it first/);
  } finally {
    restore();
  }
});
