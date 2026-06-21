import type { PublishEventRequest } from './events';
import type { AskRequest, ReplyRequest } from './inbox';

export type McpWorkspaceResolution = {
  workspaceId: string;
  sessionName: string;
  worktreePath: string;
};

export type McpRequestContext = {
  workspaceId?: string;
  sessionName?: string;
  worktreePath?: string;
  cwd?: string;
  clientName?: string;
};

export type TeamPublishToolInput = PublishEventRequest;

export type TeamAskToolInput = AskRequest;

export type TeamReplyToolInput = ReplyRequest;

export type VaultSearchToolInput = {
  query: string;
  limit?: number;
};

export type VaultReadToolInput = {
  path: string;
};

export type McpResourceName =
  | 'teambridge://workspace'
  | 'teambridge://participants'
  | 'teambridge://vault/context'
  | 'teambridge://inbox'
  | 'teambridge://conflicts';

