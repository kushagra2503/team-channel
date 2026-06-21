export type WorktreeInfo = {
  workspaceId: string;
  userId: string;
  path: string;
  branch: string;
  baseCommit: string;
  currentCommit?: string;
  dirty: boolean;
};

export type CreateWorktreeRequest = {
  workspaceId: string;
  baseCommit: string;
  branch: string;
  path?: string;
};

export type BranchPolicy = {
  prefix: string;
  includeSessionName: boolean;
  includeUserName: boolean;
};

