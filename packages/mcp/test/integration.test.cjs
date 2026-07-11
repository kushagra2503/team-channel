const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

// Resolve paths relative to this test file so cwd doesn't matter.
// test file: <repo>/packages/mcp/test/integration.test.cjs
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_SCRIPT = path.resolve(__dirname, '../dist/server.js');

// All 5 resource URIs registered by the server.
const EXPECTED_RESOURCE_URIS = [
  'teambridge://workspace',
  'teambridge://participants',
  'teambridge://vault/context',
  'teambridge://inbox',
  'teambridge://conflicts'
];

// All 6 tool names registered by the server.
const EXPECTED_TOOL_NAMES = [
  'team_publish',
  'vault_search',
  'vault_read',
  'workspace_status',
  'team_ask',
  'team_reply'
];

/**
 * Spawn the MCP server as a child process speaking JSON-RPC over stdio.
 * Returns helpers to send requests, notifications, and kill the process.
 */
function createMcpServer() {
  const child = spawn('node', [SERVER_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, TEAMBRIDGE_REPO_ROOT: os.tmpdir() },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const pending = new Map();
  let buffer = '';

  child.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        // Ignore non-JSON lines (e.g. stray stdout).
      }
    }
  });

  let nextId = 1;

  async function request(method, params) {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(
        () => reject(new Error(`Timeout waiting for ${method} response`)),
        5000
      );
    });
  }

  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  function kill() {
    child.kill();
  }

  return { request, notify, kill };
}

/** Spawn the server, run the initialize handshake, return the helper. */
async function bootServer() {
  const server = createMcpServer();
  try {
    const init = await server.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.1' }
    });
    assert.equal(init.result.serverInfo.name, 'teambridge');
    server.notify('notifications/initialized', {});
    return server;
  } catch (err) {
    server.kill();
    throw err;
  }
}

test('initialize handshake returns teambridge server info', async () => {
  const server = createMcpServer();
  try {
    const result = await server.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.1' }
    });
    assert.equal(result.result.serverInfo.name, 'teambridge');
    server.notify('notifications/initialized', {});
  } finally {
    server.kill();
  }
});

test('resources/list returns all 5 registered resource URIs', async () => {
  const server = await bootServer();
  try {
    const res = await server.request('resources/list', {});
    const uris = res.result.resources.map((r) => r.uri);
    for (const expected of EXPECTED_RESOURCE_URIS) {
      assert.ok(uris.includes(expected), `missing resource URI: ${expected}`);
    }
    assert.equal(uris.length, EXPECTED_RESOURCE_URIS.length);
  } finally {
    server.kill();
  }
});

test('tools/list returns all 6 registered tool names', async () => {
  const server = await bootServer();
  try {
    const res = await server.request('tools/list', {});
    const names = res.result.tools.map((t) => t.name);
    for (const expected of EXPECTED_TOOL_NAMES) {
      assert.ok(names.includes(expected), `missing tool name: ${expected}`);
    }
    assert.equal(names.length, EXPECTED_TOOL_NAMES.length);
  } finally {
    server.kill();
  }
});

test('tools/call team_ask returns error when workspace context is missing', async () => {
  const server = await bootServer();
  try {
    const res = await server.request('tools/call', {
      name: 'team_ask',
      arguments: { to: 'nihal', text: 'test' }
    });
    assert.equal(res.result.isError, true);
  } finally {
    server.kill();
  }
});

test('tools/call team_reply returns error when workspace context is missing', async () => {
  const server = await bootServer();
  try {
    const res = await server.request('tools/call', {
      name: 'team_reply',
      arguments: { messageId: 'msg_1', text: 'test' }
    });
    assert.equal(res.result.isError, true);
  } finally {
    server.kill();
  }
});
