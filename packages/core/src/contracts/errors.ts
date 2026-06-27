export type TeambridgeErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKTREE_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RELAY_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export type TeambridgeError = {
  code: TeambridgeErrorCode;
  message: string;
  details?: unknown;
};

