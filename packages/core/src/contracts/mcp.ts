import type { PublishEventRequest } from './events';
import type { AskRequest, ReplyRequest } from './inbox';
import type { RelayStatusResponse, WorkspaceStatusResponse } from './api';

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

export const MCP_RESOURCE_NAMES = [
  'teambridge://workspace',
  'teambridge://participants',
  'teambridge://vault/context',
  'teambridge://inbox',
  'teambridge://conflicts'
] as const;

export type McpResourceName = (typeof MCP_RESOURCE_NAMES)[number];

export const MCP_TOOL_NAMES = [
  'team_publish',
  'team_ask',
  'team_reply',
  'vault_search',
  'vault_read',
  'workspace_status'
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/**
 * Workspace resource response with optional relay-backed sync state.
 * When relay mode is active (`relayMode: 'supabase'`), the `relayStatus`
 * field carries sync health, pending count, and per-workspace sync entries.
 * When relay is not configured, the field is absent and the resource
 * degrades to plain `WorkspaceStatusResponse`.
 *
 * On the `teambridge://participants` resource, participant `status` and
 * `lastSeenAt` fields are relay-backed when the workspace's `relayMode`
 * is `'supabase'`; in local mode they reflect local heartbeat state only.
 */
export type McpWorkspaceResourceResponse = WorkspaceStatusResponse & {
  relayStatus?: RelayStatusResponse;
};
