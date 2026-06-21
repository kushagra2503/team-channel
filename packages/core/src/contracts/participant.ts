export type AgentKind = 'claude-code' | 'cursor' | 'codex' | 'ghost' | 'unknown';
export type ParticipantStatus = 'active' | 'idle' | 'offline';

export type Participant = {
  id: string;
  displayName: string;
  workspaceId: string;
  branch: string;
  agent?: AgentKind;
  status: ParticipantStatus;
  lastSeenAt: string;
};

