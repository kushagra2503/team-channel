import type {
  ApiResult,
  LocalUserProfileResponse,
  Project,
  ProjectListResponse,
  ProjectMemberListResponse,
  RepoContextResponse,
  TrackListResponse,
  VaultAnnotateResponseBody,
  VaultContextResponse,
  VaultReadResponse,
  VaultSearchResponse,
  VaultItemAnnotation,
  WorkspaceListResponse,
  WorkspaceStatusResponse
} from '@teambridge/core';
import { avatarNameSlug } from '@/lib/avatar-identity';

export const DEFAULT_DAEMON_BASE_URL = 'http://127.0.0.1:9473';

export type TeambridgeQueryParams = Record<string, string | number | boolean | undefined>;

export type TeambridgeClientConfig = {
  daemonBaseUrl?: string;
  repoRoot?: string;
};

export type KnownRepo = {
  repoRoot: string;
  lastSeenAt: string;
  projects: Project[];
};

function normalizeDaemonBaseUrl(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_DAEMON_BASE_URL;
  }

  let current = value;
  for (let i = 0; i < 2 && current.includes('%'); i += 1) {
    try {
      current = decodeURIComponent(current);
    } catch {
      break;
    }
  }

  try {
    return new URL(current).toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_DAEMON_BASE_URL;
  }
}

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
    daemonBaseUrl: normalizeDaemonBaseUrl(query.get('daemonBaseUrl') ?? env.VITE_TEAMBRIDGE_DAEMON_URL),
    repoRoot: query.get('repoRoot') ?? env.VITE_TEAMBRIDGE_REPO_ROOT
  };
}

export function listKnownRepos(config: TeambridgeClientConfig, signal?: AbortSignal): Promise<{ repos: KnownRepo[] }> {
  return getJson<{ repos: KnownRepo[] }>('/repos', { daemonBaseUrl: config.daemonBaseUrl }, undefined, signal);
}

export async function registerRepo(config: TeambridgeClientConfig, repoRoot: string, signal?: AbortSignal): Promise<{ repoRoot: string }> {
  const response = await fetch(buildTeambridgeUrl('/repos/register', { daemonBaseUrl: config.daemonBaseUrl }), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoRoot }),
    signal
  });
  return unwrapApiResult<{ repoRoot: string }>(response);
}

export function listWorkspaces(config: TeambridgeClientConfig, signal?: AbortSignal): Promise<WorkspaceListResponse> {
  return getJson<WorkspaceListResponse>('/workspaces', config, undefined, signal);
}

export function listProjects(config: TeambridgeClientConfig, signal?: AbortSignal): Promise<ProjectListResponse> {
  return getJson<ProjectListResponse>('/projects', config, undefined, signal);
}

export function getUserProfile(
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<LocalUserProfileResponse> {
  return getJson<LocalUserProfileResponse>('/user/profile', config, undefined, signal);
}

export function getProjectMembers(
  projectId: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<ProjectMemberListResponse> {
  return getJson<ProjectMemberListResponse>(`/projects/${encodeURIComponent(projectId)}/members`, config, undefined, signal);
}

export function getProjectTracks(
  projectId: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<TrackListResponse> {
  return getJson<TrackListResponse>(`/projects/${encodeURIComponent(projectId)}/tracks`, config, undefined, signal);
}

export function listRelaySessions(
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<{ sessions: TrackListResponse['tracks'] }> {
  return getJson<{ sessions: TrackListResponse['tracks'] }>('/relay/sessions', config, undefined, signal);
}

export function getRepoContext(
  config: TeambridgeClientConfig,
  workspaceId?: string,
  signal?: AbortSignal
): Promise<RepoContextResponse> {
  return getJson<RepoContextResponse>(
    '/repo/context',
    config,
    workspaceId ? { workspaceId } : undefined,
    signal
  );
}

export async function openRepoPath(
  config: TeambridgeClientConfig,
  path: string,
  signal?: AbortSignal
): Promise<{ opened: string }> {
  const response = await fetch(buildTeambridgeUrl('/repo/open-path', config), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, repoRoot: config.repoRoot }),
    signal
  });
  return unwrapApiResult<{ opened: string }>(response);
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

export function readVaultFile(
  workspaceId: string,
  path: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<VaultReadResponse> {
  return getJson<VaultReadResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/vault/read`,
    config,
    { path },
    signal
  );
}

export function searchVault(
  workspaceId: string,
  query: string,
  config: TeambridgeClientConfig,
  signal?: AbortSignal
): Promise<VaultSearchResponse> {
  return getJson<VaultSearchResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/vault/search`,
    config,
    { q: query },
    signal
  );
}

export function annotateVaultItem(
  workspaceId: string,
  config: TeambridgeClientConfig,
  annotation: VaultItemAnnotation,
  signal?: AbortSignal
): Promise<VaultAnnotateResponseBody> {
  return fetch(buildTeambridgeUrl(`/workspaces/${encodeURIComponent(workspaceId)}/vault/annotate`, config), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...annotation, repoRoot: config.repoRoot }),
    signal
  }).then((response) => unwrapApiResult<VaultAnnotateResponseBody>(response));
}

export function buildDisplayNameAvatarUrl(
  displayName: string,
  config: TeambridgeClientConfig,
  rev?: number | string
): string {
  return buildTeambridgeUrl(
    `/avatars/by-name/${encodeURIComponent(avatarNameSlug(displayName))}`,
    config,
    rev !== undefined ? { v: rev } : {}
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
