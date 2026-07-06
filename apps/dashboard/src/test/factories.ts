import type { Participant, RelayStatusResponse, SyncStateEntry, VaultContext, Workspace, WorkspaceEvent, WorkspaceStatusResponse } from '@teambridge/core';

export const createdAt = '2026-06-22T00:00:00.000Z';

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws_123',
    sessionName: 'billing-refactor',
    repoRemote: null,
    repoRootHash: 'repo_hash',
    baseRef: 'main',
    baseCommit: 'abc1234567890',
    scope: [],
    createdBy: 'user_ronish',
    createdAt,
    status: 'active',
    relayMode: 'local',
    projectId: null,
    ...overrides
  };
}

export function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'user_ronish',
    displayName: 'ronish',
    workspaceId: 'ws_123',
    branch: 'teambridge/billing-refactor/ronish',
    agent: 'cursor',
    status: 'active',
    lastSeenAt: createdAt,
    ...overrides
  };
}

export function makeWorkspaceStatus(overrides: Partial<WorkspaceStatusResponse> = {}): WorkspaceStatusResponse {
  return {
    workspace: makeWorkspace({ baseCommit: 'abc123' }),
    participants: [makeParticipant()],
    worktrees: [
      {
        workspaceId: 'ws_123',
        userId: 'user_ronish',
        path: '/tmp/teambridge/.teambridge/worktrees/billing-refactor/ronish',
        branch: 'teambridge/billing-refactor/ronish',
        baseCommit: 'abc123',
        currentCommit: 'abc123',
        dirty: false
      }
    ],
    lastSeq: 3,
    ...overrides
  };
}

export function makeVaultContext(overrides: Partial<VaultContext> = {}): VaultContext {
  return {
    workspaceId: 'ws_123',
    content: '--- decisions.md ---\n# Decisions\n- Backend owns invoice state.',
    includedPaths: ['decisions.md'],
    truncated: false,
    maxBytes: 24000,
    lastSeq: 2,
    ...overrides
  };
}

export function makeSyncStateEntry(overrides: Partial<SyncStateEntry> = {}): SyncStateEntry {
  return {
    workspaceId: 'ws_123',
    lastRemoteSeq: 5,
    lastSyncedAt: '2026-07-06T12:00:00.000Z',
    relayStatus: 'online',
    lastError: null,
    ...overrides
  };
}

export function makeRelayStatus(overrides: Partial<RelayStatusResponse> = {}): RelayStatusResponse {
  return {
    configured: true,
    loggedIn: true,
    pending: 0,
    sync: [makeSyncStateEntry()],
    ...overrides
  };
}

export function makeWorkspaceEvent(overrides: Partial<WorkspaceEvent> = {}): WorkspaceEvent {
  return {
    id: 'evt_001',
    workspaceId: 'ws_123',
    seq: 1,
    type: 'publish',
    actorId: 'user_ronish',
    deviceId: 'device_local',
    payload: { text: 'Decision made' },
    targetFile: 'decisions.md',
    createdAt: '2026-07-06T12:00:00.000Z',
    ...overrides
  };
}
