import type { RelayMode } from './workspace';

export type TeambridgeConfig = {
  schemaVersion: 1;
  defaultRelayMode: RelayMode;
  daemonPort: number;
  mcpPort: number;
  autoInject: boolean;
  vaultInjectionMode: 'compact';
};

export type WorkspaceConfig = {
  sessionName: string;
  workspaceId: string;
  worktreePath: string;
  branch: string;
};

