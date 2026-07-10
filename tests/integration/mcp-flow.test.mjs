/**
 * MCP + daemon integration smoke tests.
 *
 * Exercises the 4 live MCP tools (workspace_status, vault_read, vault_search,
 * team_publish) and both stubs (team_ask, team_reply) against a real running
 * daemon. Verifies that the MCP server, daemon-client, and daemon are wired
 * together correctly — not just that JSON-RPC handshakes work in isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createTempGitRepo, parseCreatedProjectId, removeTempDir, runCli, startTestDaemon } from './helpers.mjs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = pathJoin(__dirname, '../..');
const MCP_SERVER_BIN = pathJoin(MONOREPO_ROOT, 'packages/mcp/dist/server.js');

/**
 * Spawn the MCP stdio server pointed at a real daemon and repo.
 * Returns helpers to send JSON-RPC requests and kill the process.
 */
function createMcpClient({ daemonUrl, repoRoot }) {
  const child = spawn(process.execPath, [MCP_SERVER_BIN], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TEAMBRIDGE_DAEMON_URL: daemonUrl,
      TEAMBRIDGE_REPO_ROOT: repoRoot
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const pending = new Map();
  let buffer = '';
  let nextId = 1;

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  });

  let stderrOutput = '';
  child.stderr.on('data', (chunk) => {
    stderrOutput += chunk.toString();
  });

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(
        () => reject(new Error(`Timeout waiting for ${method} (stderr: ${stderrOutput})`)),
        10_000
      );
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  function kill() {
    child.kill('SIGTERM');
  }

  return { request, notify, kill };
}

function parseWorktreePath(output) {
  const match = output.match(/Worktree: (.+)/);
  if (!match) throw new Error(`Could not parse worktree path:\n${output}`);
  return match[1].trim();
}

test('MCP tools work end-to-end against a real daemon', async (t) => {
  // --- Setup: real temp git repo + daemon + track with published events ---
  const repoRoot = await createTempGitRepo();
  t.after(() => removeTempDir(repoRoot));

  const daemon = await startTestDaemon(repoRoot);
  t.after(() => daemon.stop());

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };

  // Bootstrap: init, project, track with two participants and a published note.
  runCli(['init', '--first-name', 'Alice', '--last-name', 'T'], ctx);
  const create = runCli(['project', 'create', '--name', 'SmokePrj'], ctx);
  assert.equal(create.exitCode, 0, create.stderr || create.stdout);
  const projectId = parseCreatedProjectId(create.stdout);

  const start = runCli(['start', 'smoke-track', '--project', projectId], ctx);
  assert.equal(start.exitCode, 0, start.stderr || start.stdout);
  const aliceWorktree = parseWorktreePath(start.stdout);

  const join = runCli(['join', 'smoke-track', '--as', 'Bob'], ctx);
  assert.equal(join.exitCode, 0, join.stderr || join.stdout);

  // Alice publishes a note so vault files are non-empty.
  const pub = runCli(
    ['publish', 'decisions.md', 'Use SQLite for local state'],
    { ...ctx, cwd: aliceWorktree }
  );
  assert.equal(pub.exitCode, 0, pub.stderr || pub.stdout);

  // Publish a second note so vault_search has something to rank.
  const pub2 = runCli(
    ['publish', 'observations.md', 'SQLite FTS5 is fast for small vaults'],
    { ...ctx, cwd: aliceWorktree }
  );
  assert.equal(pub2.exitCode, 0, pub2.stderr || pub2.stdout);

  // .active file lets the MCP server resolve workspace without explicit params.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(pathJoin(repoRoot, '.teambridge', '.active'), 'smoke-track');

  // --- Spawn the MCP server ---
  const mcp = createMcpClient({ daemonUrl: daemon.baseUrl, repoRoot });
  t.after(() => mcp.kill());

  // MCP initialize handshake.
  const init = await mcp.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0.0.1' }
  });
  assert.equal(init.result.serverInfo.name, 'teambridge');
  mcp.notify('notifications/initialized');

  // --- workspace_status: returns real workspace + participants ---
  const statusRes = await mcp.request('tools/call', { name: 'workspace_status', arguments: {} });
  assert.ok(!statusRes.result.isError, `workspace_status failed: ${statusRes.result.content?.[0]?.text}`);
  const status = JSON.parse(statusRes.result.content[0].text);
  assert.equal(status.workspace.sessionName, 'smoke-track');
  assert.ok(Array.isArray(status.participants));
  assert.ok(status.participants.length >= 2, 'Expected at least 2 participants (Alice + Bob)');
  const names = status.participants.map((p) => p.displayName);
  assert.ok(names.some((n) => n.toLowerCase().includes('alice')), `Alice not found in participants: ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.toLowerCase().includes('bob')), `Bob not found in participants: ${JSON.stringify(names)}`);

  // --- vault_read: reads the published decisions.md content ---
  const readRes = await mcp.request('tools/call', { name: 'vault_read', arguments: { path: 'decisions.md' } });
  assert.ok(!readRes.result.isError, `vault_read failed: ${readRes.result.content?.[0]?.text}`);
  assert.match(readRes.result.content[0].text, /SQLite for local state/);

  // --- vault_search: finds the published decision ---
  const searchRes = await mcp.request('tools/call', { name: 'vault_search', arguments: { query: 'SQLite' } });
  assert.ok(!searchRes.result.isError, `vault_search failed: ${searchRes.result.content?.[0]?.text}`);
  const searchData = JSON.parse(searchRes.result.content[0].text);
  assert.ok(Array.isArray(searchData.results), 'Expected results array');
  assert.ok(searchData.results.length > 0, 'Expected at least one vault search result for "SQLite"');
  const resultTexts = searchData.results.map((r) => r.text);
  assert.ok(
    resultTexts.some((t) => t.includes('SQLite')),
    `No result mentioned SQLite: ${JSON.stringify(resultTexts)}`
  );

  // --- team_publish: writes a new note and it appears in vault_read ---
  const publishRes = await mcp.request('tools/call', {
    name: 'team_publish',
    arguments: { targetFile: 'observations.md', text: 'MCP smoke test published this note' }
  });
  assert.ok(!publishRes.result.isError, `team_publish failed: ${publishRes.result.content?.[0]?.text}`);
  const publishedEvent = JSON.parse(publishRes.result.content[0].text);
  assert.equal(publishedEvent.targetFile, 'observations.md');
  assert.ok(typeof publishedEvent.seq === 'number' && publishedEvent.seq > 0);

  // Verify the published note is now readable.
  const readAfterPublish = await mcp.request('tools/call', { name: 'vault_read', arguments: { path: 'observations.md' } });
  assert.ok(!readAfterPublish.result.isError);
  assert.match(readAfterPublish.result.content[0].text, /MCP smoke test published this note/);

  // --- Stubs: team_ask and team_reply return isError: true ---
  const askRes = await mcp.request('tools/call', { name: 'team_ask', arguments: { to: 'bob', text: 'hello?' } });
  assert.equal(askRes.result.isError, true, 'team_ask should be stubbed with isError: true');

  const replyRes = await mcp.request('tools/call', { name: 'team_reply', arguments: { messageId: 'msg_1', text: 'reply' } });
  assert.equal(replyRes.result.isError, true, 'team_reply should be stubbed with isError: true');
});
