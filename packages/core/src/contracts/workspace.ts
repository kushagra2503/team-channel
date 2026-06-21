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
};

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
};

export type JoinWorkspaceRequest = {
  sessionName: string;
  displayName?: string;
  agent?: AgentKind;
};

