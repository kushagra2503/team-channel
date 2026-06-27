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

export function buildAvatarUrl(
  workspaceId: string,
  participantId: string,
  config: TeambridgeClientConfig,
  rev?: number
): string {
  return buildTeambridgeUrl(
    `/workspaces/${encodeURIComponent(workspaceId)}/participants/${encodeURIComponent(participantId)}/avatar`,
    config,
    { v: rev }
  );
}

export type PfpPreviewOptions = {
  query?: string;
  size?: number;
  algorithm?: 'floyd-steinberg' | 'atkinson' | 'bayer';
  bayerLevel?: number;
  color?: { r: number; g: number; b: number };
  seed?: string;
};

export type PfpPreviewResult = {
  blob: Blob;
  source: string;
  sourceUrl: string;
  imageUrl: string;
  photographer: string;
  alt: string;
};

export async function previewPfp(
  config: TeambridgeClientConfig,
  options: PfpPreviewOptions,
  signal?: AbortSignal
): Promise<PfpPreviewResult> {
  const response = await fetch(buildTeambridgeUrl('/dev/pfp/preview', config), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
    signal
  });
  if (!response.ok) {
    throw new Error(`pfp preview failed: ${response.status}`);
  }
  return {
    blob: await response.blob(),
    source: response.headers.get('x-pfp-source') ?? '',
    sourceUrl: response.headers.get('x-pfp-source-url') ?? '',
    imageUrl: response.headers.get('x-pfp-image-url') ?? '',
    photographer: response.headers.get('x-pfp-photographer') ?? '',
    alt: response.headers.get('x-pfp-alt') ?? ''
  };
}

export async function regeneratePfp(
  config: TeambridgeClientConfig,
  participantId: string,
  options: PfpPreviewOptions
): Promise<{ participantId: string; meta: unknown }> {
  const response = await fetch(buildTeambridgeUrl('/dev/pfp/regenerate', config), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ participantId, ...options })
  });
  return unwrapApiResult<{ participantId: string; meta: unknown }>(response);
}
