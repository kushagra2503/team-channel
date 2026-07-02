const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ApiResultSchema,
  apiFail,
  apiOk,
  ParticipantSchema,
  PublishEventRequestSchema,
  PublishEventSchema,
  StartWorkspaceResponseSchema,
  TeambridgeConfigSchema,
  VaultContextSchema,
  WorkspaceManifestSchema,
  WorkspaceStatusResponseSchema
} = require('../dist');
const contracts = require('@teambridge/core/contracts');

const createdAt = '2026-06-22T00:00:00.000Z';

const participant = {
  id: 'user_nihal',
  displayName: 'nihal',
  workspaceId: 'ws_123',
  branch: 'teambridge/billing-refactor/nihal',
  agent: 'claude-code',
  status: 'active',
  lastSeenAt: createdAt
};

const manifest = {
  id: 'ws_123',
  sessionName: 'billing-refactor',
  repoRemote: null,
  repoRootHash: 'repo_hash',
  baseRef: 'main',
  baseCommit: 'abc123',
  scope: [],
  createdBy: 'user_nihal',
  createdAt,
  status: 'active',
  relayMode: 'local',
  projectId: null,
  schemaVersion: 1,
  participants: [participant]
};

test('WorkspaceManifestSchema accepts the Phase 1 manifest shape', () => {
  assert.deepEqual(WorkspaceManifestSchema.parse(manifest), manifest);
});

test('ParticipantSchema keeps participant fields stable', () => {
  assert.deepEqual(ParticipantSchema.parse(participant), participant);
  assert.throws(() => ParticipantSchema.parse({ ...participant, status: 'busy' }));
});

test('WorkspaceStatusResponseSchema includes participants and worktrees', () => {
  const status = {
    workspace: { ...manifest, participants: undefined, schemaVersion: undefined },
    participants: [participant],
    worktrees: [
      {
        workspaceId: 'ws_123',
        userId: 'user_nihal',
        path: '/tmp/repo/.teambridge/worktrees/billing-refactor/nihal',
        branch: 'teambridge/billing-refactor/nihal',
        baseCommit: 'abc123',
        currentCommit: 'abc123',
        dirty: false
      }
    ],
    lastSeq: 2
  };
  delete status.workspace.participants;
  delete status.workspace.schemaVersion;

  assert.deepEqual(WorkspaceStatusResponseSchema.parse(status), status);
  assert.throws(() => WorkspaceStatusResponseSchema.parse({ ...status, worktrees: undefined }));
});

test('PublishEventSchema accepts only publish events with target files', () => {
  const event = {
    id: 'evt_001',
    workspaceId: 'ws_123',
    seq: 1,
    type: 'publish',
    actorId: 'user_nihal',
    deviceId: 'device_local',
    targetFile: 'decisions.md',
    payload: {
      text: 'Backend is source of truth.'
    },
    createdAt
  };

  assert.deepEqual(PublishEventSchema.parse(event), event);
  assert.throws(() => PublishEventSchema.parse({ ...event, type: 'decision' }));
  assert.throws(() => PublishEventRequestSchema.parse({ payload: { text: 'missing target' } }));
});

test('VaultContextSchema captures Phase 1 truncation metadata', () => {
  const context = {
    workspaceId: 'ws_123',
    content: '# Decisions\n- Backend is source of truth.',
    includedPaths: ['decisions.md'],
    truncated: false,
    maxBytes: 24000,
    lastSeq: 1
  };

  assert.deepEqual(VaultContextSchema.parse(context), context);
});

test('ApiResultSchema validates ok and fail envelopes', () => {
  const responseSchema = ApiResultSchema(StartWorkspaceResponseSchema);
  const ok = {
    ok: true,
    data: {
      manifest,
      worktree: {
        workspaceId: 'ws_123',
        userId: 'user_nihal',
        path: '/tmp/repo',
        branch: 'main',
        baseCommit: 'abc123',
        currentCommit: 'abc123',
        dirty: false
      }
    }
  };
  const fail = {
    ok: false,
    error: {
      code: 'INVALID_REQUEST',
      message: 'Request body failed validation'
    }
  };

  assert.deepEqual(responseSchema.parse(ok), ok);
  assert.deepEqual(responseSchema.parse(fail), fail);
  assert.throws(() => responseSchema.parse({ ok: true, data: { manifest } }));
});

test('apiOk and apiFail preserve ApiResult envelope shape', () => {
  assert.deepEqual(apiOk({ value: 1 }), {
    ok: true,
    data: { value: 1 }
  });
  assert.deepEqual(apiFail('INVALID_REQUEST', 'Bad request', { field: 'sessionName' }), {
    ok: false,
    error: {
      code: 'INVALID_REQUEST',
      message: 'Bad request',
      details: { field: 'sessionName' }
    }
  });
});

test('core package keeps contracts subpath export available', () => {
  assert.equal(contracts.MCP_RESOURCE_NAMES.includes('teambridge://workspace'), true);
  assert.equal(typeof contracts.WorkspaceManifestSchema.parse, 'function');
});

test('TeambridgeConfigSchema keeps repo config defaults stable', () => {
  const config = {
    schemaVersion: 1,
    defaultRelayMode: 'local',
    daemonPort: 9473,
    mcpPort: 9474,
    autoInject: true,
    vaultInjectionMode: 'compact',
    vault: {
      contextMaxBytes: 24000
    }
  };

  assert.deepEqual(TeambridgeConfigSchema.parse(config), config);
  assert.throws(() => TeambridgeConfigSchema.parse({ ...config, defaultRelayMode: 'supabase' }));
});
