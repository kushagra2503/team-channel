import type {
  ApiResult,
  InboxResponse,
  McpRequestContext,
  McpResourceName,
  VaultContextResponse,
  WorkspaceStatusResponse
} from '@teambridge/core';
import { apiFail, apiOk, MCP_RESOURCE_NAMES as CORE_MCP_RESOURCE_NAMES } from '@teambridge/core';
import { getVaultContext, getWorkspaceStatus, type DaemonClientOptions } from './daemon-client';

export const MCP_RESOURCE_NAMES = CORE_MCP_RESOURCE_NAMES;

export type ParticipantsResourceResponse = {
  participants: WorkspaceStatusResponse['participants'];
};

export type ConflictsResourceResponse = {
  conflicts: [];
};

export type McpResourceResponse =
  | WorkspaceStatusResponse
  | ParticipantsResourceResponse
  | VaultContextResponse
  | InboxResponse
  | ConflictsResourceResponse;

export type McpResourceContext = DaemonClientOptions & Pick<McpRequestContext, 'workspaceId' | 'sessionName'>;

export type McpDaemonReader = {
  getWorkspaceStatus: typeof getWorkspaceStatus;
  getVaultContext: typeof getVaultContext;
};

const defaultReader: McpDaemonReader = {
  getWorkspaceStatus,
  getVaultContext
};

function resolveWorkspaceId(context: McpResourceContext): string | undefined {
  return context.workspaceId ?? context.sessionName;
}

export function isMcpResourceName(value: string): value is McpResourceName {
  return (MCP_RESOURCE_NAMES as readonly string[]).includes(value);
}

export async function resolveMcpResource(
  name: string,
  context: McpResourceContext = {},
  reader: McpDaemonReader = defaultReader
): Promise<ApiResult<McpResourceResponse>> {
  if (!isMcpResourceName(name)) {
    return apiFail('NOT_FOUND', `Unknown Teambridge MCP resource: ${name}`);
  }

  const workspaceId = resolveWorkspaceId(context);
  if (!workspaceId) {
    return apiFail('INVALID_REQUEST', 'workspaceId or sessionName is required to resolve Teambridge MCP resources');
  }

  if (name === 'teambridge://workspace') {
    return reader.getWorkspaceStatus(workspaceId, context);
  }

  if (name === 'teambridge://participants') {
    const status = await reader.getWorkspaceStatus(workspaceId, context);
    return status.ok ? apiOk({ participants: status.data.participants }) : status;
  }

  if (name === 'teambridge://vault/context') {
    return reader.getVaultContext(workspaceId, context);
  }

  if (name === 'teambridge://inbox') {
    return apiOk({ messages: [] });
  }

  return apiOk({ conflicts: [] });
}
