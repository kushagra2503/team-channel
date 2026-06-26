import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTeambridgeUrl, getDefaultClientConfig, unwrapApiResult } from './teambridgeClient';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('teambridgeClient', () => {
  afterEach(() => {
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

  it('uses query params before env values for daemon config', () => {
    vi.stubEnv('VITE_TEAMBRIDGE_DAEMON_URL', 'http://env-host:9473');
    vi.stubEnv('VITE_TEAMBRIDGE_REPO_ROOT', '/env/repo');
    window.history.pushState({}, '', '/?daemonBaseUrl=http%3A%2F%2Fquery-host%3A9473&repoRoot=%2Fquery%2Frepo');

    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://query-host:9473',
      repoRoot: '/query/repo'
    });
  });

  it('falls back to env and default daemon URL', () => {
    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://127.0.0.1:9473',
      repoRoot: undefined
    });

    vi.stubEnv('VITE_TEAMBRIDGE_REPO_ROOT', '/env/repo');

    expect(getDefaultClientConfig()).toEqual({
      daemonBaseUrl: 'http://127.0.0.1:9473',
      repoRoot: '/env/repo'
    });
  });
});
