import type {
  ApiResult,
  CreateProjectResponse,
  JoinWorkspaceResponse,
  LocalUserProfile,
  ProjectListResponse,
  StartWorkspaceResponse,
  TrackListResponse,
  VaultContextResponse,
  VaultReadResponse,
  VaultSearchResponse,
  WorkspaceEvent,
  WorkspaceStatusResponse
} from '@teambridge/core';
import { apiFail, buildDaemonUrl } from '@teambridge/core';

export type ClientOptions = {
  baseUrl?: string;
  repoRoot: string;
};

async function request<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiFail('INTERNAL_ERROR', `Cannot reach the teambridge daemon at ${url} — is it running? (run \`pnpm daemon\`)\n  ${message}`);
  }

  const text = await response.text();
  if (!text) {
    return apiFail('INTERNAL_ERROR', `Empty response from daemon (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(text) as ApiResult<T>;
  } catch {
    return apiFail('INTERNAL_ERROR', `Unexpected non-JSON response from daemon (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}

export async function initConfig(options: ClientOptions): Promise<ApiResult<{ created: boolean }>> {
  return request(buildDaemonUrl('/config/init', options), {
    method: 'POST',
    body: JSON.stringify({ repoRoot: options.repoRoot })
  });
}

export async function saveUserProfile(
  options: ClientOptions,
  body: { firstName: string; lastName: string; defaultAgent?: LocalUserProfile['defaultAgent']; defaultProjectId?: string | null }
): Promise<ApiResult<{ profile: LocalUserProfile; path: string }>> {
  return request(buildDaemonUrl('/user/profile', options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function getUserProfile(options: ClientOptions): Promise<ApiResult<{ profile: LocalUserProfile | null }>> {
  return request(buildDaemonUrl('/user/profile', options));
}

export async function createProject(
  options: ClientOptions,
  body: { name: string; description?: string }
): Promise<ApiResult<CreateProjectResponse>> {
  return request(buildDaemonUrl('/projects', options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot, addLocalUser: true })
  });
}

export async function listProjects(options: ClientOptions): Promise<ApiResult<ProjectListResponse>> {
  return request(buildDaemonUrl('/projects', options));
}

export async function startTrack(
  options: ClientOptions,
  body: {
    sessionName: string;
    projectId?: string;
    baseRef?: string;
    displayName?: string;
    agent?: LocalUserProfile['defaultAgent'];
  }
): Promise<ApiResult<StartWorkspaceResponse>> {
  return request(buildDaemonUrl('/workspaces/start', options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function listTracks(options: ClientOptions): Promise<ApiResult<TrackListResponse>> {
  return request(buildDaemonUrl('/tracks', options));
}

export async function joinWorkspace(
  options: ClientOptions,
  body: {
    sessionName: string;
    displayName?: string;
    agent?: LocalUserProfile['defaultAgent'];
    // worktreePath is a daemon-side schema extension (not in core's JoinWorkspaceRequest);
    // the CLI owns worktree creation and passes the path it created.
    worktreePath: string;
  }
): Promise<ApiResult<JoinWorkspaceResponse>> {
  return request(buildDaemonUrl('/workspaces/join', options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function publishEvent(
  options: ClientOptions,
  workspaceId: string,
  body: { targetFile: string; text: string }
): Promise<ApiResult<{ event: WorkspaceEvent }>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/events`, options), {
    method: 'POST',
    body: JSON.stringify({
      targetFile: body.targetFile,
      payload: { text: body.text },
      repoRoot: options.repoRoot
    })
  });
}

export async function readVaultFile(
  options: ClientOptions,
  workspaceId: string,
  path: string
): Promise<ApiResult<VaultReadResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/vault/read`, options, { path }));
}

export async function getVaultContext(
  options: ClientOptions,
  workspaceId: string
): Promise<ApiResult<VaultContextResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/vault/context`, options));
}

export async function searchVault(
  options: ClientOptions,
  workspaceId: string,
  query: string
): Promise<ApiResult<VaultSearchResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/vault/search`, options, { q: query }));
}

export async function getWorkspaceStatus(
  options: ClientOptions,
  workspaceId: string
): Promise<ApiResult<WorkspaceStatusResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/status`, options));
}

export async function setDefaultProject(
  options: ClientOptions,
  profile: LocalUserProfile,
  defaultProjectId: string
): Promise<ApiResult<{ profile: LocalUserProfile; path: string }>> {
  return saveUserProfile(options, {
    firstName: profile.firstName,
    lastName: profile.lastName,
    defaultAgent: profile.defaultAgent,
    defaultProjectId
  });
}
