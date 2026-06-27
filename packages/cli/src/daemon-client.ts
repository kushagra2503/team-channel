import type {
  ApiResult,
  CreateProjectResponse,
  LocalUserProfile,
  ProjectListResponse,
  StartWorkspaceResponse,
  TrackListResponse,
  WorkspaceStatusResponse
} from '@teambridge/core';
import { buildDaemonUrl } from '@teambridge/core';

export type ClientOptions = {
  baseUrl?: string;
  repoRoot: string;
};

async function request<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  return response.json() as Promise<ApiResult<T>>;
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
