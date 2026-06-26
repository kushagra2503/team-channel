import type {
  ApiResult,
  DaemonClientOptions,
  DaemonQueryParams,
  VaultContextResponse,
  VaultReadResponse,
  WorkspaceListResponse,
  WorkspaceStatusResponse
} from '@teambridge/core';
import { buildDaemonUrl } from '@teambridge/core';

export { DEFAULT_DAEMON_BASE_URL, buildDaemonUrl } from '@teambridge/core';
export type { DaemonClientOptions, DaemonQueryParams } from '@teambridge/core';

async function getJson<T>(path: string, options: DaemonClientOptions, params?: DaemonQueryParams): Promise<ApiResult<T>> {
  const response = await fetch(buildDaemonUrl(path, options, params));
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
