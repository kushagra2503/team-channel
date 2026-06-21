export type WorkspaceEventType =
  | 'publish'
  | 'team_ask'
  | 'team_reply'
  | 'vault_patch'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'checkpoint_created';

export type VaultTargetFile = string;

export type WorkspaceEvent<TPayload = unknown> = {
  id: string;
  workspaceId: string;
  seq: number;
  type: WorkspaceEventType;
  actorId: string;
  deviceId: string;
  payload: TPayload;
  targetFile?: VaultTargetFile;
  dedupeKey?: string;
  createdAt: string;
};

export type PublishEventPayload = {
  text: string;
  metadata?: Record<string, unknown>;
};

export type PublishEventRequest<TPayload = PublishEventPayload> = {
  targetFile: VaultTargetFile;
  payload: TPayload;
  dedupeKey?: string;
};

