import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveMcpResource, type McpResourceContext } from './resources';
import { resolveWorkspaceContext } from './resolution';
import { askInbox, getWorkspaceStatus, publishEvent, readVaultFile, replyInbox, searchVault } from './daemon-client';

const SERVER_NAME = 'coord';
const SERVER_VERSION = '0.1.0';

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // --- Resources ---

  server.registerResource(
    'workspace',
    'coord://workspace',
    { title: 'Workspace', description: 'Current workspace status with participants, worktrees, and relay sync state', mimeType: 'application/json' },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const result = await resolveMcpResource('coord://workspace', ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { contents: [{ uri: 'coord://workspace', mimeType: 'application/json', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerResource(
    'participants',
    'coord://participants',
    { title: 'Participants', description: 'List of participants on the current track with status and presence', mimeType: 'application/json' },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const result = await resolveMcpResource('coord://participants', ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { contents: [{ uri: 'coord://participants', mimeType: 'application/json', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerResource(
    'vault-context',
    'coord://vault/context',
    { title: 'Vault Context', description: 'Concatenated vault context for the current track', mimeType: 'application/json' },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const result = await resolveMcpResource('coord://vault/context', ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { contents: [{ uri: 'coord://vault/context', mimeType: 'application/json', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerResource(
    'inbox',
    'coord://inbox',
    { title: 'Inbox', description: 'Team inbox messages on the current track', mimeType: 'application/json' },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const result = await resolveMcpResource('coord://inbox', ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { contents: [{ uri: 'coord://inbox', mimeType: 'application/json', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerResource(
    'conflicts',
    'coord://conflicts',
    { title: 'Conflicts', description: 'Detected conflicts on the current track', mimeType: 'application/json' },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const result = await resolveMcpResource('coord://conflicts', ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { contents: [{ uri: 'coord://conflicts', mimeType: 'application/json', text: JSON.stringify(result.data) }] };
    }
  );

  // --- Tools ---

  server.registerTool(
    'team_publish',
    {
      title: 'Publish to vault',
      description: 'Publish a note to a vault file on the current track',
      inputSchema: {
        targetFile: z.string().min(1),
        text: z.string()
      }
    },
    async ({ targetFile, text }) => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for publish');
      const result = await publishEvent(wsId, { targetFile, payload: { text } }, ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: JSON.stringify(result.data.event) }] };
    }
  );

  server.registerTool(
    'vault_search',
    {
      title: 'Search vault',
      description: 'Search the vault for matching text',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().optional()
      }
    },
    async ({ query, limit }) => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for search');
      const result = await searchVault(wsId, query, ctx, limit);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerTool(
    'vault_read',
    {
      title: 'Read vault file',
      description: 'Read a single vault file by path',
      inputSchema: {
        path: z.string().min(1)
      }
    },
    async ({ path }) => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for read');
      const result = await readVaultFile(wsId, path, ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: result.data.file.content }] };
    }
  );

  server.registerTool(
    'workspace_status',
    {
      title: 'Workspace status',
      description: 'Get the current workspace status including participants, worktrees, and relay state',
      inputSchema: {}
    },
    async () => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for status');
      const result = await getWorkspaceStatus(wsId, ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    }
  );

  server.registerTool(
    'team_ask',
    {
      title: 'Ask teammate',
      description: 'Ask a question to a teammate on the current track',
      inputSchema: {
        to: z.string().min(1),
        text: z.string()
      }
    },
    async ({ to, text }) => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for ask');
      const result = await askInbox(wsId, { to, text }, ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: JSON.stringify(result.data.message) }] };
    }
  );

  server.registerTool(
    'team_reply',
    {
      title: 'Reply to teammate',
      description: 'Reply to an inbox message on the current track',
      inputSchema: {
        messageId: z.string().min(1),
        text: z.string()
      }
    },
    async ({ messageId, text }) => {
      const ctx = await resolveWorkspaceContext({ repoRoot: process.env.COORD_REPO_ROOT, baseUrl: process.env.COORD_DAEMON_URL });
      const wsId = ctx.workspaceId ?? ctx.sessionName;
      if (!wsId) throw new Error('Unable to resolve workspace for reply');
      const result = await replyInbox(wsId, messageId, { text }, ctx);
      if (!result.ok) throw new Error(result.error.message);
      return { content: [{ type: 'text', text: JSON.stringify(result.data.message) }] };
    }
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// When run directly (`node dist/server.js`), start the stdio server.
if (require.main === module) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
