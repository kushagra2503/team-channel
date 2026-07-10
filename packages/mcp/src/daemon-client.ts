import type {
  ApiResult,
  DaemonClientOptions,
  DaemonQueryParams,
  RelayStatusResponse,
  VaultContextResponse,
  VaultReadResponse,
  WorkspaceEvent,
  WorkspaceListResponse,
  WorkspaceStatusResponse,
  VaultSearchResponse
} from '@teambridge/core';
import { buildDaemonUrl } from '@teambridge/core';

export { DEFAULT_DAEMON_BASE_URL, buildDaemonUrl } from '@teambridge/core';
export type { DaemonClientOptions, DaemonQueryParams } from '@teambridge/core';

async function getJson<T>(path: string, options: DaemonClientOptions, params?: DaemonQueryParams): Promise<ApiResult<T>> {
  const response = await fetch(buildDaemonUrl(path, options, params));
  return (await response.json()) as ApiResult<T>;
}

async function postJson<T>(
  path: string,
  body: unknown,
  options: DaemonClientOptions,
  params?: DaemonQueryParams
): Promise<ApiResult<T>> {
  const url = buildDaemonUrl(path, options, params);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return (await response.json()) as ApiResult<T>;
}

export function listWorkspaces(options: DaemonClientOptions = {}): Promise<ApiResult<WorkspaceListResponse>> {
  return getJson<WorkspaceListResponse>('/workspaces', options);
}

export function getWorkspaceStatus(
  workspaceId: string,
  options: DaemonClientOptions = {}
): Promise<ApiResult<WorkspaceStatusResponse>> {
  return getJson<WorkspaceStatusResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/status`, options);
}

export function readVaultFile(
  workspaceId: string,
  path: string,
  options: DaemonClientOptions = {}
): Promise<ApiResult<VaultReadResponse>> {
  return getJson<VaultReadResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/vault/read`, options, { path });
}

export function getVaultContext(
  workspaceId: string,
  options: DaemonClientOptions = {},
  maxBytes?: number
): Promise<ApiResult<VaultContextResponse>> {
  return getJson<VaultContextResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/vault/context`, options, {
    maxBytes
  });
}

export function getRelayStatus(
  options: DaemonClientOptions = {}
): Promise<ApiResult<RelayStatusResponse>> {
  return getJson<RelayStatusResponse>('/relay/status', options);
}

export function publishEvent(
  workspaceId: string,
  body: { targetFile: string; payload: { text: string }; dedupeKey?: string; actorId?: string; deviceId?: string },
  options: DaemonClientOptions = {}
): Promise<ApiResult<{ event: WorkspaceEvent }>> {
  // The POST /workspaces/:id/events handler reads repoRoot from the request
  // body (not the URL query string), so we must include it in the body when
  // it is available in options.
  const bodyWithRepo = options.repoRoot ? { ...body, repoRoot: options.repoRoot } : body;
  return postJson<{ event: WorkspaceEvent }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/events`,
    bodyWithRepo,
    options
  );
}

export function searchVault(
  workspaceId: string,
  query: string,
  options: DaemonClientOptions = {},
  limit?: number
): Promise<ApiResult<VaultSearchResponse>> {
  return getJson<VaultSearchResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/vault/search`,
    options,
    { q: query, limit }
  );
}
