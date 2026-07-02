import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTeambridgeUrl, getDefaultClientConfig, readVaultFile, searchVault, unwrapApiResult } from './teambridgeClient';

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
});
