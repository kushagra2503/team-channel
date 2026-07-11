import type {
  AskResponse,
  ApiResult,
  ConflictListResponse,
  CreateProjectResponse,
  DetectConflictsResponse,
  EventListResponse,
  InboxResponse,
  JoinWorkspaceResponse,
  LocalUserProfile,
  ProjectListResponse,
  RelayMode,
  ReplyResponse,
  ResolveConflictResponse,
  StartWorkspaceResponse,
  TeambridgeConfig,
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

export async function initConfig(
  options: ClientOptions,
  body: { relayMode?: RelayMode } = {}
): Promise<ApiResult<{ config: TeambridgeConfig; path: string; created: boolean; updated: boolean }>> {
  return request(buildDaemonUrl('/config/init', options), {
    method: 'POST',
    body: JSON.stringify({ repoRoot: options.repoRoot, ...(body.relayMode ? { relayMode: body.relayMode } : {}) })
  });
}

export async function getConfig(
  options: ClientOptions
): Promise<ApiResult<{ config: TeambridgeConfig; path: string; exists: boolean }>> {
  return request(buildDaemonUrl('/config', options));
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

export async function loginRelay(
  options: ClientOptions,
  body: { email: string; password: string }
): Promise<ApiResult<{ userId: string; email?: string; relayUrl: string }>> {
  return request(buildDaemonUrl('/auth/login', options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function getRelayAuthStatus(options: ClientOptions): Promise<ApiResult<{
  loggedIn: boolean;
  userId?: string;
  email?: string;
  relayUrl?: string;
}>> {
  return request(buildDaemonUrl('/auth/status', options));
}

export async function listRelaySessions(options: ClientOptions): Promise<ApiResult<{ sessions: TrackListResponse['tracks'] }>> {
  return request(buildDaemonUrl('/relay/sessions', options));
}

export async function syncRelay(options: ClientOptions): Promise<ApiResult<{ pushed: number; pulled: number }>> {
  return request(buildDaemonUrl('/relay/sync', options), {
    method: 'POST',
    body: JSON.stringify({ repoRoot: options.repoRoot })
  });
}

export async function getRelayStatus(options: ClientOptions): Promise<ApiResult<{
  configured: boolean;
  loggedIn: boolean;
  pending: number;
  sync: unknown[];
}>> {
  return request(buildDaemonUrl('/relay/status', options));
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

export async function listInbox(
  options: ClientOptions,
  workspaceId: string,
  status?: string
): Promise<ApiResult<InboxResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/inbox`, options, status ? { status } : undefined));
}

export async function askInbox(
  options: ClientOptions,
  workspaceId: string,
  body: { to: string; text: string; actorId?: string }
): Promise<ApiResult<AskResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/inbox/ask`, options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function replyInbox(
  options: ClientOptions,
  workspaceId: string,
  messageId: string,
  body: { text: string; actorId?: string }
): Promise<ApiResult<ReplyResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(messageId)}/reply`, options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function listConflicts(
  options: ClientOptions,
  workspaceId: string,
  status?: string
): Promise<ApiResult<ConflictListResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/conflicts`, options, status ? { status } : undefined));
}

export async function detectConflicts(
  options: ClientOptions,
  workspaceId: string
): Promise<ApiResult<DetectConflictsResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/conflicts/detect`, options), {
    method: 'POST',
    body: JSON.stringify({ repoRoot: options.repoRoot })
  });
}

export async function resolveConflict(
  options: ClientOptions,
  workspaceId: string,
  conflictId: string,
  body: { resolutionText: string; actorId?: string }
): Promise<ApiResult<ResolveConflictResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`, options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
}

export async function getWorkspaceStatus(
  options: ClientOptions,
  workspaceId: string
): Promise<ApiResult<WorkspaceStatusResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/status`, options));
}

export async function listEvents(
  options: ClientOptions,
  workspaceId: string
): Promise<ApiResult<EventListResponse>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/events`, options));
}

export async function registerWorktree(
  options: ClientOptions,
  workspaceId: string,
  body: {
    userId: string;
    path: string;
    branch: string;
    baseCommit: string;
    currentCommit?: string;
    dirty?: boolean;
  }
): Promise<ApiResult<{ worktree: StartWorkspaceResponse['worktree'] }>> {
  return request(buildDaemonUrl(`/workspaces/${encodeURIComponent(workspaceId)}/worktrees/register`, options), {
    method: 'POST',
    body: JSON.stringify({ ...body, repoRoot: options.repoRoot })
  });
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
