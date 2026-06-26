import type { Participant, VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';

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
