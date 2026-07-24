import type { AgentKind } from './participant';
import type { RelayMode } from './workspace';

export type CoordConfig = {
  schemaVersion: 1;
  defaultRelayMode: RelayMode;
  daemonPort: number;
  mcpPort: number;
  autoInject: boolean;
  vaultInjectionMode: 'compact';
  vault: {
    contextMaxBytes: number;
  };
};

/** Repo-local identity written by `coord init`; dashboard reads the same display name + avatar slug. */
export type LocalUserProfile = {
  schemaVersion: 1;
  firstName: string;
  lastName: string;
  displayName: string;
  defaultAgent?: AgentKind;
  defaultProjectId?: string | null;
};

export type WorkspaceConfig = {
  sessionName: string;
  workspaceId: string;
  worktreePath: string;
  branch: string;
};

