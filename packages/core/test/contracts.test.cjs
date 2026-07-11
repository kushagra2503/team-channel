const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ApiResultSchema,
  apiFail,
  apiOk,
  ParticipantSchema,
  PublishEventRequestSchema,
  PublishEventSchema,
  RelayStatusResponseSchema,
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
  assert.throws(() => TeambridgeConfigSchema.parse({ ...config, defaultRelayMode: 'remote' }));
});

test('RelayMode accepts both local and supabase', () => {
  const localManifest = { ...manifest, relayMode: 'local' };
  const supabaseManifest = { ...manifest, relayMode: 'supabase' };

  assert.deepEqual(WorkspaceManifestSchema.parse(localManifest), localManifest);
  assert.deepEqual(WorkspaceManifestSchema.parse(supabaseManifest), supabaseManifest);
  assert.throws(() => WorkspaceManifestSchema.parse({ ...manifest, relayMode: 'remote' }));
});

test('RelayStatusResponseSchema validates relay status with sync entries', () => {
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

  assert.deepEqual(RelayStatusResponseSchema.parse(relayStatus), relayStatus);
});

test('RelayStatusResponseSchema validates empty sync array', () => {
  const relayStatus = {
    configured: false,
    loggedIn: false,
    pending: 0,
    sync: []
  };

  assert.deepEqual(RelayStatusResponseSchema.parse(relayStatus), relayStatus);
});

test('RelayStatusResponseSchema rejects missing configured or pending', () => {
  assert.throws(() => RelayStatusResponseSchema.parse({ loggedIn: true, pending: 0, sync: [] }));
  assert.throws(() => RelayStatusResponseSchema.parse({ configured: true, loggedIn: true, sync: [] }));
});

const {
  InboxMessageSchema,
  InboxResponseSchema,
  AskRequestSchema,
  ReplyRequestSchema,
  ConflictSchema,
  ConflictsResponseSchema,
  ResolveConflictRequestSchema,
  TeamAskEventSchema,
  TeamReplyEventSchema,
  ConflictDetectedEventSchema,
  ConflictResolvedEventSchema
} = require('../dist');

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

test('InboxMessageSchema accepts a complete ask message', () => {
  assert.deepEqual(InboxMessageSchema.parse(inboxMessage), inboxMessage);
});

test('InboxResponseSchema validates a list of messages', () => {
  assert.deepEqual(InboxResponseSchema.parse({ messages: [inboxMessage] }), { messages: [inboxMessage] });
});

test('AskRequestSchema rejects empty to or text', () => {
  assert.deepEqual(AskRequestSchema.parse({ to: 'nihal', text: 'hello' }), { to: 'nihal', text: 'hello' });
  assert.throws(() => AskRequestSchema.parse({ to: '', text: 'hello' }));
  assert.throws(() => AskRequestSchema.parse({ to: 'nihal', text: '' }));
});

test('ReplyRequestSchema requires messageId and text', () => {
  assert.deepEqual(ReplyRequestSchema.parse({ messageId: 'msg_001', text: 'yes' }), { messageId: 'msg_001', text: 'yes' });
  assert.throws(() => ReplyRequestSchema.parse({ text: 'yes' }));
});

test('ConflictSchema validates an open conflict', () => {
  assert.deepEqual(ConflictSchema.parse(conflict), conflict);
});

test('ConflictSchema validates a resolved conflict with resolutionText', () => {
  const resolved = {
    ...conflict,
    status: 'resolved',
    resolvedAt: createdAt,
    resolutionEventId: 'evt_resolve_001',
    resolutionText: 'Merged both versions'
  };
  assert.deepEqual(ConflictSchema.parse(resolved), resolved);
});

test('ConflictsResponseSchema validates a list of conflicts', () => {
  assert.deepEqual(ConflictsResponseSchema.parse({ conflicts: [conflict] }), { conflicts: [conflict] });
});

test('ResolveConflictRequestSchema requires conflictId and resolutionText', () => {
  assert.deepEqual(
    ResolveConflictRequestSchema.parse({ conflictId: 'conflict_001', resolutionText: 'merged manually' }),
    { conflictId: 'conflict_001', resolutionText: 'merged manually' }
  );
  assert.throws(() => ResolveConflictRequestSchema.parse({ conflictId: 'conflict_001' }));
});

test('TeamAskEventSchema validates a team_ask event', () => {
  const event = {
    id: 'evt_ask_001',
    workspaceId: 'ws_123',
    seq: 1,
    type: 'team_ask',
    actorId: 'user_ronish',
    deviceId: 'device_local',
    payload: { to: 'nihal', text: 'How should we structure the conflict API?' },
    createdAt
  };
  assert.deepEqual(TeamAskEventSchema.parse(event), event);
  assert.throws(() => TeamAskEventSchema.parse({ ...event, type: 'publish' }));
});

test('TeamReplyEventSchema validates a team_reply event', () => {
  const event = {
    id: 'evt_reply_001',
    workspaceId: 'ws_123',
    seq: 2,
    type: 'team_reply',
    actorId: 'user_nihal',
    deviceId: 'device_local',
    payload: { replyToMessageId: 'msg_001', text: 'Use the same table as publish events.' },
    createdAt
  };
  assert.deepEqual(TeamReplyEventSchema.parse(event), event);
  assert.throws(() => TeamReplyEventSchema.parse({ ...event, payload: { text: 'missing replyToMessageId' } }));
});

test('ConflictDetectedEventSchema validates a conflict_detected event', () => {
  const event = {
    id: 'evt_conflict_001',
    workspaceId: 'ws_123',
    seq: 3,
    type: 'conflict_detected',
    actorId: 'user_ronish',
    deviceId: 'device_local',
    payload: { targetFile: 'decisions.md', summary: 'Two publishes to decisions.md' },
    createdAt
  };
  assert.deepEqual(ConflictDetectedEventSchema.parse(event), event);
});

test('ConflictResolvedEventSchema validates a conflict_resolved event', () => {
  const event = {
    id: 'evt_resolve_001',
    workspaceId: 'ws_123',
    seq: 4,
    type: 'conflict_resolved',
    actorId: 'user_nihal',
    deviceId: 'device_local',
    payload: { conflictId: 'conflict_001', resolutionText: 'merged manually' },
    createdAt
  };
  assert.deepEqual(ConflictResolvedEventSchema.parse(event), event);
});
