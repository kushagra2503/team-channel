export type VaultCheckpoint = {
  id: string;
  workspaceId: string;
  seq: number;
  storagePath: string;
  hash: string;
  createdByDeviceId: string;
  createdAt: string;
};

export type CheckpointLease = {
  workspaceId: string;
  leaderDeviceId: string;
  leaseExpiresAt: string;
  updatedAt: string;
};

export type CreateCheckpointRequest = {
  workspaceId: string;
  uptoSeq: number;
};

