import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askInbox,
  buildTeambridgeUrl,
  getContextPointer,
  getDefaultClientConfig,
  listConflicts,
  listInbox,
  getRelayStatus,
  getWorkspaceEvents,
  readVaultFile,
  replyInbox,
  resolveConflict,
  searchVault,
  setContextPointer,
  unwrapApiResult
} from './teambridgeClient';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('teambridgeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('builds daemon URLs with repoRoot and encoded query params', () => {
    expect(
      buildTeambridgeUrl('/workspaces/ws_123/vault/read', { repoRoot: '/tmp/team channel' }, { path: 'decisions.md' })
    ).toBe(
      'http://127.0.0.1:9473/workspaces/ws_123/vault/read?repoRoot=%2Ftmp%2Fteam+channel&path=decisions.md'
    );
  });

  it('unwraps successful ApiResult envelopes', async () => {
    await expect(unwrapApiResult(jsonResponse({ ok: true, data: { workspaces: [] } }))).resolves.toEqual({
      workspaces: []
    });
  });

  it('throws failed ApiResult messages', async () => {
    await expect(
      unwrapApiResult(
        jsonResponse({
          ok: false,
          error: {
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace was not found'
          }
        })
      )
    ).rejects.toThrow('Workspace was not found');
  });

  it('reads and searches vault files through daemon endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { file: { path: 'decisions.md', content: '# Decisions' } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { results: [{ path: 'decisions.md', line: 2, text: 'Backend owns state' }] } }));

    await expect(readVaultFile('ws_123', 'decisions.md', { repoRoot: '/tmp/repo' })).resolves.toEqual({
      file: { path: 'decisions.md', content: '# Decisions' }
    });
    await expect(searchVault('ws_123', 'Backend', { repoRoot: '/tmp/repo' })).resolves.toEqual({
      results: [{ path: 'decisions.md', line: 2, text: 'Backend owns state' }]
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:9473/workspaces/ws_123/vault/read?repoRoot=%2Ftmp%2Frepo&path=decisions.md'
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://127.0.0.1:9473/workspaces/ws_123/vault/search?repoRoot=%2Ftmp%2Frepo&q=Backend'
    );
  });

  it('uses query params before env values for daemon config', () => {
    vi.stubEnv('VITE_TEAMBRIDGE_DAEMON_URL', 'http://env-host:9473');
    vi.stubEnv('VITE_TEAMBRIDGE_REPO_ROOT', '/env/repo');
    window.history.pushState({}, '', '/?daemonBaseUrl=http%3A%2F%2Fquery-host%3A9473&repoRoot=%2Fquery%2Frepo');

    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://query-host:9473',
      repoRoot: '/query/repo'
    });
  });

  it('normalizes double-encoded daemon URL params', () => {
    window.history.pushState({}, '', '/?daemonBaseUrl=http%253A%252F%252F127.0.0.1%253A9473');

    expect(getDefaultClientConfig().daemonBaseUrl).toBe('http://127.0.0.1:9473');
  });

  it('falls back to env and default daemon URL', () => {
    vi.stubEnv('VITE_TEAMBRIDGE_REPO_ROOT', '');
    window.history.pushState({}, '', '/');

    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://127.0.0.1:9473',
      repoRoot: ''
    });

    vi.stubEnv('VITE_TEAMBRIDGE_REPO_ROOT', '/env/repo');

    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://127.0.0.1:9473',
      repoRoot: '/env/repo'
    });
  });

  it('fetches relay status from the daemon', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const relayStatus = {
      configured: true,
      loggedIn: true,
      pending: 2,
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: relayStatus }));

    await expect(getRelayStatus({ repoRoot: '/tmp/repo' })).resolves.toEqual(relayStatus);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9473/relay/status?repoRoot=%2Ftmp%2Frepo');
  });

  it('fetches workspace events from the daemon', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const events = {
      events: [
        {
          id: 'evt_001',
          workspaceId: 'ws_123',
          seq: 1,
          type: 'publish',
          actorId: 'user_ronish',
          deviceId: 'device_local',
          payload: { text: 'Decision made' },
          targetFile: 'decisions.md',
          createdAt: '2026-07-06T12:00:00.000Z'
        }
      ]
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: events }));

    await expect(getWorkspaceEvents('ws_123', { repoRoot: '/tmp/repo' })).resolves.toEqual(events);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:9473/workspaces/ws_123/events?repoRoot=%2Ftmp%2Frepo'
    );
  });

  it('propagates relay status error messages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Daemon error' } })
    );

    await expect(getRelayStatus({})).rejects.toThrow('Daemon error');
  });

  it('fetches inbox, conflicts, and context pointer from the daemon', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const message = {
      id: 'msg_001',
      workspaceId: 'ws_123',
      fromUserId: 'user_ronish',
      toUserId: 'user_nihal',
      status: 'pending',
      body: 'How should we structure the conflict API?',
      createdAt: '2026-07-10T12:00:00.000Z'
    };
    const conflict = {
      id: 'conflict_001',
      workspaceId: 'ws_123',
      kind: 'vault',
      status: 'open',
      summary: 'Two publishes to decisions.md',
      eventIds: ['evt_001', 'evt_002'],
      affectedPaths: ['decisions.md'],
      createdAt: '2026-07-10T12:00:00.000Z'
    };
    const pointer = {
      workspaceId: 'ws_123',
      sessionName: 'billing-refactor',
      displayName: 'ronish',
      lastSeenSeq: 5,
      updatedAt: '2026-07-10T12:00:00.000Z'
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { messages: [message] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { conflicts: [conflict] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: pointer }));

    await expect(listInbox('ws_123', { repoRoot: '/tmp/repo' })).resolves.toEqual({ messages: [message] });
    await expect(listConflicts('ws_123', { repoRoot: '/tmp/repo' })).resolves.toEqual({ conflicts: [conflict] });
    await expect(getContextPointer('ws_123', { repoRoot: '/tmp/repo' })).resolves.toEqual(pointer);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/inbox?repoRoot=%2Ftmp%2Frepo');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/conflicts?repoRoot=%2Ftmp%2Frepo');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/context-pointer?repoRoot=%2Ftmp%2Frepo');
  });

  it('posts ask, reply, resolve, and context pointer updates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const askResponse = {
      message: { id: 'msg_001', status: 'pending' },
      event: { id: 'evt_ask_001', workspaceId: 'ws_123', seq: 1, type: 'team_ask', actorId: 'user_local', deviceId: 'device_local', payload: {}, createdAt: '2026-07-10T12:00:00.000Z' }
    };
    const replyResponse = {
      message: { id: 'msg_001', status: 'answered' },
      event: { id: 'evt_reply_001', workspaceId: 'ws_123', seq: 2, type: 'team_reply', actorId: 'user_local', deviceId: 'device_local', payload: {}, createdAt: '2026-07-10T12:00:00.000Z' }
    };
    const resolveResponse = {
      conflict: { id: 'conflict_001', status: 'resolved' },
      event: { id: 'evt_resolve_001', workspaceId: 'ws_123', seq: 3, type: 'conflict_resolved', actorId: 'user_local', deviceId: 'device_local', payload: {}, createdAt: '2026-07-10T12:00:00.000Z' }
    };
    const pointerResponse = {
      workspaceId: 'ws_123',
      sessionName: 'billing-refactor',
      displayName: 'ronish',
      lastSeenSeq: 7,
      updatedAt: '2026-07-10T12:00:00.000Z'
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: askResponse }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: replyResponse }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: resolveResponse }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: pointerResponse }));

    await expect(askInbox('ws_123', { repoRoot: '/tmp/repo' }, { to: 'nihal', text: 'hello' })).resolves.toEqual(askResponse);
    await expect(replyInbox('ws_123', 'msg_001', { repoRoot: '/tmp/repo' }, { text: 'reply' })).resolves.toEqual(replyResponse);
    await expect(resolveConflict('ws_123', 'conflict_001', { repoRoot: '/tmp/repo' }, { resolutionText: 'merged' })).resolves.toEqual(resolveResponse);
    await expect(setContextPointer('ws_123', { lastSeenSeq: 7 }, { repoRoot: '/tmp/repo' })).resolves.toEqual(pointerResponse);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/inbox/ask?repoRoot=%2Ftmp%2Frepo');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/inbox/msg_001/reply?repoRoot=%2Ftmp%2Frepo');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'http://127.0.0.1:9473/workspaces/ws_123/conflicts/conflict_001/resolve?repoRoot=%2Ftmp%2Frepo'
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://127.0.0.1:9473/workspaces/ws_123/context-pointer?repoRoot=%2Ftmp%2Frepo');
  });
});
