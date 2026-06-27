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

/** Git + filesystem context for the dashboard track sidebar. */
export type RepoContext = {
  remoteUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  repoLabel: string | null;
  repoWebUrl: string | null;
  branch: string;
  branchWebUrl: string | null;
  localPath: string;
  lastCommitAt: string | null;
  /** Best-effort time of last push to upstream (ISO 8601). */
  lastPushAt: string | null;
  lastPushCommitSha: string | null;
  lastPushCommitWebUrl: string | null;
};

