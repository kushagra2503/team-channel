import type { VaultCheckpoint } from './checkpoints';
import type { TeambridgeError } from './errors';
import type { WorkspaceEvent } from './events';
import type { WorktreeInfo } from './git';
import type { InboxMessage } from './inbox';
import type { Participant } from './participant';
import type { VaultContext, VaultFile, VaultSearchResult } from './vault';
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

export type WorkspaceListResponse = {
  workspaces: Workspace[];
};

export type StartWorkspaceResponse = {
  manifest: WorkspaceManifest;
  worktree: WorktreeInfo;
};

export type WorkspaceStatusResponse = {
  workspace: Workspace;
  participants: Participant[];
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

export type HookContextResponse = {
  context: VaultContext;
};

export type JoinWorkspaceResponse = {
  manifest: WorkspaceManifest;
  worktree: WorktreeInfo;
};

