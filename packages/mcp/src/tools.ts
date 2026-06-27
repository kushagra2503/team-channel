import { MCP_TOOL_NAMES as CORE_MCP_TOOL_NAMES } from '@teambridge/core';

/** Stub registry — HTTP MCP server wiring is Phase 3; names match contracts. */
export const MCP_TOOL_NAMES = CORE_MCP_TOOL_NAMES;

export function isMcpToolName(value: string): value is (typeof MCP_TOOL_NAMES)[number] {
  return (MCP_TOOL_NAMES as readonly string[]).includes(value);
}
