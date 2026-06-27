const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MCP_RESOURCE_NAMES,
  buildDaemonUrl,
  getVaultContext,
  getWorkspaceStatus,
  isMcpResourceName,
  readVaultFile,
  resolveMcpResource
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
      branch: 'teambridge/billing-refactor/ronish',
      agent: 'cursor',
      status: 'active',
      lastSeenAt: createdAt
    }
  ],
  lastSeq: 2
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
  }
};

test('resource registry matches core MCP resource contract', () => {
  assert.deepEqual(MCP_RESOURCE_NAMES, [
    'teambridge://workspace',
    'teambridge://participants',
    'teambridge://vault/context',
    'teambridge://inbox',
    'teambridge://conflicts'
  ]);
  assert.equal(isMcpResourceName('teambridge://workspace'), true);
  assert.equal(isMcpResourceName('teambridge://missing'), false);
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
  const workspace = await resolveMcpResource('teambridge://workspace', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(workspace, { ok: true, data: workspaceStatus });

  const participants = await resolveMcpResource('teambridge://participants', { workspaceId: 'ws_123' }, reader);
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
    }
  };

  const workspace = await resolveMcpResource('teambridge://workspace', { sessionName: 'billing-refactor' }, sessionReader);
  assert.deepEqual(workspace, { ok: true, data: workspaceStatus });
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
    }
  };

  const participants = await resolveMcpResource('teambridge://participants', { workspaceId: 'ws_missing' }, failingReader);
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
  const vault = await resolveMcpResource('teambridge://vault/context', { workspaceId: 'ws_123' }, reader);
  assert.equal(vault.ok, true);
  assert.deepEqual(vault.data.context.includedPaths, ['decisions.md']);

  const inbox = await resolveMcpResource('teambridge://inbox', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(inbox, { ok: true, data: { messages: [] } });

  const conflicts = await resolveMcpResource('teambridge://conflicts', { workspaceId: 'ws_123' }, reader);
  assert.deepEqual(conflicts, { ok: true, data: { conflicts: [] } });

  const missing = await resolveMcpResource('teambridge://missing', { workspaceId: 'ws_123' }, reader);
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'NOT_FOUND');
});

test('resources require workspace context', async () => {
  const result = await resolveMcpResource('teambridge://workspace', {}, reader);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_REQUEST');
});
