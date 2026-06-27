import type { AgentKind } from './participant';

export type TeambridgeConfig = {
  schemaVersion: 1;
  defaultRelayMode: 'local';
  daemonPort: number;
  mcpPort: number;
  autoInject: boolean;
  vaultInjectionMode: 'compact';
  vault: {
    contextMaxBytes: number;
  };
};

/** Repo-local identity written by `teambridge init`; dashboard reads the same display name + avatar slug. */
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

