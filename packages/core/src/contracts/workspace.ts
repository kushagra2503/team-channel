import type { AgentKind, Participant } from './participant';

export type WorkspaceStatus = 'active' | 'archived';
export type RelayMode = 'local';

export type Workspace = {
  id: string;
  sessionName: string;
  repoRemote: string | null;
  repoRootHash: string;
  baseRef: string;
  baseCommit: string;
  scope: string[];
  createdBy: string;
  createdAt: string;
  status: WorkspaceStatus;
  relayMode: RelayMode;
  /** Project this workspace (track) belongs to. Null for legacy workspaces. */
  projectId: string | null;
};

/** Alias for Workspace reflecting the new terminology. */
export type Track = Workspace;

export type WorkspaceManifest = Workspace & {
  schemaVersion: 1;
  participants: Participant[];
};

export type StartWorkspaceRequest = {
  sessionName: string;
  baseRef?: string;
  scope?: string[];
  displayName?: string;
  agent?: AgentKind;
  /** Link the new track to a project; creator is upserted on the project roster when profile exists. */
  projectId?: string;
};

export type JoinWorkspaceRequest = {
  sessionName: string;
  displayName?: string;
  agent?: AgentKind;
};

