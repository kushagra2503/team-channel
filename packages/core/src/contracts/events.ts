export type WorkspaceEventType =
  | 'observation'
  | 'decision'
  | 'blocker'
  | 'test_result'
  | 'attempt_failed'
  | 'team_ask'
  | 'team_reply'
  | 'vault_patch'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'checkpoint_created';

export type PublishableEventType =
  | 'observation'
  | 'decision'
  | 'blocker'
  | 'test_result'
  | 'attempt_failed';

export type WorkspaceEvent<TPayload = unknown> = {
  id: string;
  workspaceId: string;
  seq: number;
  type: WorkspaceEventType;
  actorId: string;
  deviceId: string;
  payload: TPayload;
  dedupeKey?: string;
  createdAt: string;
};

export type PublishEventRequest<TPayload = unknown> = {
  type: PublishableEventType;
  payload: TPayload;
  dedupeKey?: string;
};

export type DecisionEventPayload = {
  text: string;
  resolvesConflictId?: string;
  affectedPaths?: string[];
};

export type ObservationEventPayload = {
  text: string;
  affectedPaths?: string[];
};

export type BlockerEventPayload = {
  text: string;
  blockedBy?: string[];
  affectedPaths?: string[];
};

export type TestResultEventPayload = {
  command?: string;
  status: 'passed' | 'failed' | 'skipped';
  summary: string;
};

export type EventVaultRoute = {
  type: PublishableEventType;
  targetFiles: string[];
};

