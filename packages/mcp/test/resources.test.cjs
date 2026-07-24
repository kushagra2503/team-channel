const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MCP_RESOURCE_NAMES,
  buildDaemonUrl,
  getRelayStatus,
  getVaultContext,
  getWorkspaceStatus,
  isMcpResourceName,
  publishEvent,
  readVaultFile,
  resolveMcpResource,
  searchVault
} = require('../dist');

const createdAt = '2026-06-22T00:00:00.000Z';

const workspaceStatus = {
  workspace: {
    id: 'ws_123',
    sessionName: 'billing-refactor',
    repoRemote: null,
    repoRootHash: 'repo_hash',
    baseRef: 'main',
    baseCommit: 'abc123',
    scope: [],
    createdBy: 'user_ronish',
    createdAt,
    status: 'active',
    relayMode: 'local'
  },
  participants: [
    {
      id: 'user_ronish',
      displayName: 'ronish',
      workspaceId: 'ws_123',
      branch: 'coord/billing-refactor/ronish',
      agent: 'cursor',
      status: 'active',
      lastSeenAt: createdAt
    }
  ],
  lastSeq: 2
};

const inboxMessage = {
  id: 'msg_001',
  workspaceId: 'ws_123',
  fromUserId: 'user_ronish',
  toUserId: 'user_nihal',
  status: 'pending',
  body: 'How should we structure the conflict API?',
  eventId: 'evt_ask_001',
  createdAt
};

const conflict = {
  id: 'conflict_001',
  workspaceId: 'ws_123',
  kind: 'vault',
  status: 'open',
  summary: 'Two publishes to decisions.md',
  eventIds: ['evt_001', 'evt_002'],
  affectedPaths: ['decisions.md'],
  createdAt
};

const reader = {
  async getWorkspaceStatus(workspaceId) {
    assert.equal(workspaceId, 'ws_123');
    return { ok: true, data: workspaceStatus };
  },
  async getVaultContext(workspaceId) {
    assert.equal(workspaceId, 'ws_123');
    return {
      ok: true,
      data: {
        context: {
          workspaceId,
          content: '# Decisions\n\n- Backend owns invoice state.',
          includedPaths: ['decisions.md'],
          truncated: false,
          maxBytes: 24000,
          lastSeq: 2
        }
      }
    };
  },
  async getRelayStatus() {
    return { ok: true, data: relayStatus };
  },
  async listInbox(workspaceId) {
    assert.equal(workspaceId, 'ws_123');
    return { ok: true, data: { messages: [inboxMessage] } };
  },
  async listConflicts(workspaceId) {
    assert.equal(workspaceId, 'ws_123');
    return { ok: true, data: { conflicts: [conflict] } };
  }
};

const relayStatus = {
  configured: true,
  loggedIn: true,
  pending: 0,
  sync: [
    {
      workspaceId: 'ws_123',
      lastRemoteSeq: 5,
      lastSyncedAt: '2026-07-06T12:00:00.000Z',
      relayStatus: 'online',
      lastError: null
    }
  ]
};

test('resource registry matches core MCP resource contract', () => {
  assert.deepEqual(MCP_RESOURCE_NAMES, [
    'coord://workspace',
    'coord://participants',
    'coord://vault/context',
    'coord://inbox',
    'coord://conflicts'
  ]);
  assert.equal(isMcpResourceName('coord://workspace'), true);
  assert.equal(isMcpResourceName('coord://missing'), false);
});

test('daemon URL builder includes repoRoot and encoded params', () => {
  assert.equal(
    buildDaemonUrl('/workspaces/ws_123/vault/context', {
      baseUrl: 'http://127.0.0.1:9473',
      repoRoot: '/tmp/team channel'
    }),
    'http://127.0.0.1:9473/workspaces/ws_123/vault/context?repoRoot=%2Ftmp%2Fteam+channel'
  );

  assert.equal(
    buildDaemonUrl('/workspaces/ws_123/vault/read', { repoRoot: '/tmp/repo' }, { path: 'decisions.md' }),
    'http://127.0.0.1:9473/workspaces/ws_123/vault/read?repoRoot=%2Ftmp%2Frepo&path=decisions.md'
  );
});

test('workspace and participant resources resolve through workspace status', async () => {
  const workspace = await resolveMcpResource('coord://workspace', { workspaceId: 'ws_123' }, reader);
  assert.equal(workspace.ok, true);
  assert.deepEqual(workspace.data.workspace, workspaceStatus.workspace);
  assert.deepEqual(workspace.data.participants, workspaceStatus.participants);
  assert.equal(workspace.data.lastSeq, workspaceStatus.lastSeq);
  assert.deepEqual(workspace.data.relayStatus, relayStatus);

  const participants = await resolveMcpResource('coord://participants', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(participants, { ok: true, data: { participants: workspaceStatus.participants } });
});

test('resources can use sessionName as the daemon workspace identifier', async () => {
  const sessionReader = {
    async getWorkspaceStatus(workspaceId) {
      assert.equal(workspaceId, 'billing-refactor');
      return { ok: true, data: workspaceStatus };
    },
    async getVaultContext() {
      throw new Error('not used');
    },
    async getRelayStatus() {
      return { ok: false, error: { code: 'RELAY_NOT_CONFIGURED', message: 'Relay not configured' } };
    },
    async listInbox() {
      throw new Error('not used');
    },
    async listConflicts() {
      throw new Error('not used');
    }
  };

  const workspace = await resolveMcpResource('coord://workspace', { sessionName: 'billing-refactor' }, sessionReader);
  assert.equal(workspace.ok, true);
  assert.deepEqual(workspace.data.workspace, workspaceStatus.workspace);
  assert.equal(workspace.data.relayStatus, undefined);
});

test('participants resource propagates workspace status failures', async () => {
  const fail = {
    ok: false,
    error: {
      code: 'WORKSPACE_NOT_FOUND',
      message: 'Workspace was not found'
    }
  };
  const failingReader = {
    async getWorkspaceStatus() {
      return fail;
    },
    async getVaultContext() {
      throw new Error('not used');
    },
    async getRelayStatus() {
      throw new Error('not used');
    },
    async listInbox() {
      throw new Error('not used');
    },
    async listConflicts() {
      throw new Error('not used');
    }
  };

  const participants = await resolveMcpResource('coord://participants', { workspaceId: 'ws_missing' }, failingReader);
  assert.deepEqual(participants, fail);
});

test('daemon fetch wrappers construct endpoints and preserve ApiResult envelopes', async () => {
  const seen = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ ok: true, data: { value: seen.length } }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    await getWorkspaceStatus('ws/123', { repoRoot: '/tmp/repo' });
    await readVaultFile('ws_123', 'decisions.md', { repoRoot: '/tmp/repo' });
    await getVaultContext('ws_123', { repoRoot: '/tmp/repo' }, 1200);
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(seen, [
    'http://127.0.0.1:9473/workspaces/ws%2F123/status?repoRoot=%2Ftmp%2Frepo',
    'http://127.0.0.1:9473/workspaces/ws_123/vault/read?repoRoot=%2Ftmp%2Frepo&path=decisions.md',
    'http://127.0.0.1:9473/workspaces/ws_123/vault/context?repoRoot=%2Ftmp%2Frepo&maxBytes=1200'
  ]);
});

test('vault, inbox, conflict, and unknown resources have stable behavior', async () => {
  const vault = await resolveMcpResource('coord://vault/context', { workspaceId: 'ws_123' }, reader);
  assert.equal(vault.ok, true);
  assert.deepEqual(vault.data.context.includedPaths, ['decisions.md']);

  const inbox = await resolveMcpResource('coord://inbox', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(inbox, { ok: true, data: { messages: [inboxMessage] } });

  const conflicts = await resolveMcpResource('coord://conflicts', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(conflicts, { ok: true, data: { conflicts: [conflict] } });

  const missing = await resolveMcpResource('coord://missing', { workspaceId: 'ws_123' }, reader);
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'NOT_FOUND');
});

test('resources require workspace context', async () => {
  const result = await resolveMcpResource('coord://workspace', {}, reader);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('workspace resource includes relay status when relay is configured', async () => {
  const result = await resolveMcpResource('coord://workspace', { workspaceId: 'ws_123' }, reader);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.relayStatus, relayStatus);
});

test('workspace resource degrades gracefully when relay is not configured', async () => {
  const noRelayReader = {
    async getWorkspaceStatus() {
      return { ok: true, data: workspaceStatus };
    },
    async getVaultContext() {
      throw new Error('not used');
    },
    async getRelayStatus() {
      return { ok: false, error: { code: 'RELAY_NOT_CONFIGURED', message: 'Relay not configured' } };
    },
    async listInbox() {
      throw new Error('not used');
    },
    async listConflicts() {
      throw new Error('not used');
    }
  };

  const result = await resolveMcpResource('coord://workspace', { workspaceId: 'ws_123' }, noRelayReader);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.workspace, workspaceStatus.workspace);
  assert.equal(result.data.relayStatus, undefined);
});

test('workspace resource returns error when workspace status fails, without fetching relay', async () => {
  let relayCalled = false;
  const errorReader = {
    async getWorkspaceStatus() {
      return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', message: 'Not found' } };
    },
    async getVaultContext() {
      throw new Error('not used');
    },
    async getRelayStatus() {
      relayCalled = true;
      return { ok: true, data: relayStatus };
    },
    async listInbox() {
      throw new Error('not used');
    },
    async listConflicts() {
      throw new Error('not used');
    }
  };

  const result = await resolveMcpResource('coord://workspace', { workspaceId: 'ws_missing' }, errorReader);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'WORKSPACE_NOT_FOUND');
  assert.equal(relayCalled, false);
});

test('getRelayStatus calls GET /relay/status and returns ApiResult', async () => {
  const seen = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ ok: true, data: relayStatus }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await getRelayStatus({ repoRoot: '/tmp/repo' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, relayStatus);
    assert.deepEqual(seen, ['http://127.0.0.1:9473/relay/status?repoRoot=%2Ftmp%2Frepo']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishEvent calls POST /workspaces/:id/events with correct JSON body', async () => {
  const seen = [];
  const seenBodies = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    seen.push(String(url));
    seenBodies.push(init && init.body ? JSON.parse(init.body) : null);
    return new Response(JSON.stringify({ ok: true, data: { event: { seq: 3 } } }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await publishEvent(
      'ws_123',
      { targetFile: 'decisions.md', payload: { text: 'Updated decision' }, actorId: 'user_ronish' },
      { repoRoot: '/tmp/repo' }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, { event: { seq: 3 } });
    assert.deepEqual(seen, ['http://127.0.0.1:9473/workspaces/ws_123/events?repoRoot=%2Ftmp%2Frepo']);
    assert.deepEqual(seenBodies, [
      {
        targetFile: 'decisions.md',
        payload: { text: 'Updated decision' },
        actorId: 'user_ronish',
        repoRoot: '/tmp/repo'
      }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('searchVault calls GET /workspaces/:id/vault/search?q=...&repoRoot=...', async () => {
  const seen = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ ok: true, data: { results: [] } }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await searchVault('ws_123', 'invoice', { repoRoot: '/tmp/repo' });
    assert.equal(result.ok, true);
    assert.deepEqual(seen, [
      'http://127.0.0.1:9473/workspaces/ws_123/vault/search?repoRoot=%2Ftmp%2Frepo&q=invoice'
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('searchVault with limit includes it in the query string', async () => {
  const seen = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ ok: true, data: { results: [] } }), {
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await searchVault('ws_123', 'invoice', { repoRoot: '/tmp/repo' }, 25);
    assert.equal(result.ok, true);
    assert.deepEqual(seen, [
      'http://127.0.0.1:9473/workspaces/ws_123/vault/search?repoRoot=%2Ftmp%2Frepo&q=invoice&limit=25'
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

const {
  getInbox,
  askInbox,
  replyInbox,
  getConflicts,
  resolveConflict,
  getContextPointer,
  setContextPointer
} = require('../dist');

test('inbox and conflict fetch wrappers construct endpoints and bodies', async () => {
  const seen = [];
  const seenBodies = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    seen.push(String(url));
    seenBodies.push(init && init.body ? JSON.parse(init.body) : null);
    return new Response(
      JSON.stringify({ ok: true, data: { value: seen.length } }),
      { headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    await getInbox('ws_123', { repoRoot: '/tmp/repo' });
    await askInbox('ws_123', { to: 'nihal', text: 'hello' }, { repoRoot: '/tmp/repo' });
    await replyInbox('ws_123', 'msg_1', { text: 'reply' }, { repoRoot: '/tmp/repo' });
    await getConflicts('ws_123', { repoRoot: '/tmp/repo' });
    await resolveConflict('ws_123', 'conflict_1', { resolutionText: 'fixed' }, { repoRoot: '/tmp/repo' });
    await getContextPointer('ws_123', { repoRoot: '/tmp/repo' });
    await setContextPointer('ws_123', { lastSeenSeq: 7 }, { repoRoot: '/tmp/repo' });

    assert.deepEqual(seen, [
      'http://127.0.0.1:9473/workspaces/ws_123/inbox?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/inbox/ask?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/inbox/msg_1/reply?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/conflicts?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/conflicts/conflict_1/resolve?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/context-pointer?repoRoot=%2Ftmp%2Frepo',
      'http://127.0.0.1:9473/workspaces/ws_123/context-pointer?repoRoot=%2Ftmp%2Frepo'
    ]);

    assert.deepEqual(seenBodies, [
      null,
      { to: 'nihal', text: 'hello', repoRoot: '/tmp/repo' },
      { text: 'reply', repoRoot: '/tmp/repo' },
      null,
      { resolutionText: 'fixed', repoRoot: '/tmp/repo' },
      null,
      { lastSeenSeq: 7, repoRoot: '/tmp/repo' }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
