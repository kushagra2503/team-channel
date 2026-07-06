import type { VaultCheckpoint } from './checkpoints';
import type { TeambridgeError } from './errors';
import type { WorkspaceEvent } from './events';
import type { WorktreeInfo, RepoContext } from './git';
import type { InboxMessage } from './inbox';
import type { Participant } from './participant';
import type { LocalUserProfile } from './config';
import type { Project, ProjectMember } from './project';
import type { VaultContext, VaultFile, VaultSearchResult, VaultAnnotateResponse } from './vault';
import type { Workspace, WorkspaceManifest } from './workspace';

export type ApiOk<T> = {
  ok: true;
  data: T;
};

export type ApiFail = {
  ok: false;
  error: TeambridgeError;
};

export type ApiResult<T> = ApiOk<T> | ApiFail;

export function apiOk<T>(data: T): ApiOk<T> {
  return { ok: true, data };
}

export function apiFail(code: TeambridgeError['code'], message: string, details?: unknown): ApiFail {
  return {
    ok: false,
    error: { code, message, details }
  };
}

export type WorkspaceListResponse = {
  workspaces: Workspace[];
};

export type TrackListResponse = {
  tracks: Workspace[];
};

export type ProjectListResponse = {
  projects: Project[];
};

export type ProjectMemberListResponse = {
  members: ProjectMember[];
  localUser: LocalUserProfile | null;
  localAvatarVersion?: string;
};

export type CreateProjectResponse = {
  project: Project;
  member?: ProjectMember;
};

export type UpsertProjectMemberResponse = {
  member: ProjectMember;
};

export type LocalUserProfileResponse = {
  profile: LocalUserProfile | null;
  path: string;
  avatarVersion?: string;
};

export type StartWorkspaceResponse = {
  manifest: WorkspaceManifest;
  worktree: WorktreeInfo;
};

export type WorkspaceStatusResponse = {
  workspace: Workspace;
  participants: Participant[];
  worktrees: WorktreeInfo[];
  lastSeq: number;
  latestCheckpoint?: VaultCheckpoint;
};

export type EventListResponse = {
  events: WorkspaceEvent[];
  nextSeq?: number;
};

export type InboxResponse = {
  messages: InboxMessage[];
};

export type VaultReadResponse = {
  file: VaultFile;
};

export type VaultSearchResponse = {
  results: VaultSearchResult[];
};

export type VaultContextResponse = {
  context: VaultContext;
};

export type VaultAnnotateResponseBody = VaultAnnotateResponse;

export type HookContextResponse = VaultContextResponse;

export type JoinWorkspaceResponse = {
  manifest: WorkspaceManifest;
  worktree: WorktreeInfo;
};

export type RepoContextResponse = {
  context: RepoContext;
};

export type SyncStateEntry = {
  workspaceId: string;
  lastRemoteSeq: number;
  lastSyncedAt: string | null;
  relayStatus: string;
  lastError: string | null;
};

export type RelayStatusResponse = {
  configured: boolean;
  loggedIn: boolean;
  pending: number;
  sync: SyncStateEntry[];
};

