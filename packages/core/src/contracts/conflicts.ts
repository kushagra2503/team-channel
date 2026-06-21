export type ConflictStatus = 'open' | 'resolved' | 'ignored';
export type ConflictKind = 'decision' | 'vault' | 'branch' | 'unknown';

export type Conflict = {
  id: string;
  workspaceId: string;
  kind: ConflictKind;
  status: ConflictStatus;
  summary: string;
  eventIds: string[];
  affectedPaths?: string[];
  createdAt: string;
  resolvedAt?: string;
  resolutionEventId?: string;
};

export type ResolveConflictRequest = {
  conflictId: string;
  decision: string;
};

