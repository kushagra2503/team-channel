export type CoordErrorCode =
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

export type CoordError = {
  code: CoordErrorCode;
  message: string;
  details?: unknown;
};

