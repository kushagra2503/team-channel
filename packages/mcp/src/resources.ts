import type {
  ApiResult,
  ConflictListResponse,
  InboxResponse,
  McpRequestContext,
  McpResourceName,
  McpWorkspaceResourceResponse,
  VaultContextResponse,
  WorkspaceStatusResponse
} from '@coord/core';
import { apiFail, apiOk, MCP_RESOURCE_NAMES as CORE_MCP_RESOURCE_NAMES } from '@coord/core';
import { getRelayStatus, getVaultContext, getWorkspaceStatus, listConflicts, listInbox, type DaemonClientOptions } from './daemon-client';

export const MCP_RESOURCE_NAMES = CORE_MCP_RESOURCE_NAMES;

export type ParticipantsResourceResponse = {
  participants: WorkspaceStatusResponse['participants'];
};

export type ConflictsResourceResponse = {
  conflicts: ConflictListResponse['conflicts'];
};

export type McpResourceResponse =
  | McpWorkspaceResourceResponse
  | ParticipantsResourceResponse
  | VaultContextResponse
  | InboxResponse
  | ConflictsResourceResponse;

export type McpResourceContext = DaemonClientOptions & Pick<McpRequestContext, 'workspaceId' | 'sessionName'>;

export type McpDaemonReader = {
  getWorkspaceStatus: typeof getWorkspaceStatus;
  getVaultContext: typeof getVaultContext;
  getRelayStatus: typeof getRelayStatus;
  listInbox: typeof listInbox;
  listConflicts: typeof listConflicts;
};

const defaultReader: McpDaemonReader = {
  getWorkspaceStatus,
  getVaultContext,
  getRelayStatus,
  listInbox,
  listConflicts
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
    return apiFail('NOT_FOUND', `Unknown Coord MCP resource: ${name}`);
  }

  const workspaceId = resolveWorkspaceId(context);
  if (!workspaceId) {
    return apiFail('INVALID_REQUEST', 'workspaceId or sessionName is required to resolve Coord MCP resources');
  }

  if (name === 'coord://workspace') {
    const statusResult = await reader.getWorkspaceStatus(workspaceId, context);
    if (!statusResult.ok) return statusResult;

    const relayResult = await reader.getRelayStatus(context);
    if (relayResult.ok) {
      return apiOk({ ...statusResult.data, relayStatus: relayResult.data });
    }
    return apiOk(statusResult.data);
  }

  if (name === 'coord://participants') {
    const status = await reader.getWorkspaceStatus(workspaceId, context);
    return status.ok ? apiOk({ participants: status.data.participants }) : status;
  }

  if (name === 'coord://vault/context') {
    return reader.getVaultContext(workspaceId, context);
  }

  if (name === 'coord://inbox') {
    return reader.listInbox(workspaceId, context);
  }

  return reader.listConflicts(workspaceId, context);
}
