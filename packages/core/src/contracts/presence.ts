export type PresenceState = 'online' | 'idle' | 'offline';

export type WorkspacePresence = {
  workspaceId: string;
  userId: string;
  deviceId: string;
  state: PresenceState;
  currentTask?: string;
  branch?: string;
  worktreePath?: string;
  lastSeenAt: string;
};

