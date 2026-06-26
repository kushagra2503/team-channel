import type {
  ApiResult,
  VaultContextResponse,
  WorkspaceListResponse,
  WorkspaceStatusResponse
} from '@teambridge/core';

export const DEFAULT_DAEMON_BASE_URL = 'http://127.0.0.1:9473';

export type TeambridgeQueryParams = Record<string, string | number | boolean | undefined>;

export type TeambridgeClientConfig = {
  daemonBaseUrl?: string;
  repoRoot?: string;
};

export function buildTeambridgeUrl(
  path: string,
  config: TeambridgeClientConfig = {},
  params: TeambridgeQueryParams = {}
): string {
  const url = new URL(path, config.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL);

  if (config.repoRoot) {
    url.searchParams.set('repoRoot', config.repoRoot);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function unwrapApiResult<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResult<T>;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

async function getJson<T>(
  path: string,
  config: TeambridgeClientConfig,
  params?: TeambridgeQueryParams,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(buildTeambridgeUrl(path, config, params), { signal });
  return unwrapApiResult<T>(response);
}

export function getDefaultClientConfig(): TeambridgeClientConfig {
  const env = import.meta.env;
  const query = new URLSearchParams(window.location.search);
  return {
    daemonBaseUrl: query.get('daemonBaseUrl') ?? env.VITE_TEAMBRIDGE_DAEMON_URL ?? DEFAULT_DAEMON_BASE_URL,
    repoRoot: query.get('repoRoot') ?? env.VITE_TEAMBRIDGE_REPO_ROOT
  };
}

export function listWorkspaces(config: TeambridgeClientConfig, signal?: AbortSignal): Promise<WorkspaceListResponse> {
  return getJson<WorkspaceListResponse>('/workspaces', config, undefined, signal);
}

export function getWorkspaceStatus(
  workspaceId: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<WorkspaceStatusResponse> {
  return getJson<WorkspaceStatusResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/status`, config, undefined, signal);
}

export function getVaultContext(
  workspaceId: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<VaultContextResponse> {
  return getJson<VaultContextResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/vault/context`,
    config,
    undefined,
    signal
  );
}
