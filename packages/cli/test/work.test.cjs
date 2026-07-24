const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAgentLaunchPlan
} = require('../dist/commands/work.js');
const {
  normalizeAgent
} = require('../dist/lib/agent.js');

const pointer = {
  workspaceId: 'ws_123',
  sessionName: 'auth-redesign',
  displayName: 'Ada Lovelace',
  path: '/tmp/coord-worktree',
  branch: 'coord/auth-redesign/ada-lovelace',
  baseCommit: 'abc123',
  role: 'creator'
};

const track = {
  id: 'ws_123',
  sessionName: 'auth-redesign'
};

const options = {
  repoRoot: '/tmp/coord-repo',
  baseUrl: 'http://127.0.0.1:9473'
};

test('agent aliases normalize to stable profile values', () => {
  assert.equal(normalizeAgent('claude'), 'claude-code');
  assert.equal(normalizeAgent('CLAUDE-CODE'), 'claude-code');
  assert.equal(normalizeAgent('codex'), 'codex');
  assert.equal(normalizeAgent('shell'), 'shell');
  assert.throws(() => normalizeAgent('made-up-agent'), /Unknown agent/);
});

test('Claude launch uses the worktree and an explicit per-launch MCP config', () => {
  const plan = buildAgentLaunchPlan(
    'claude-code',
    pointer,
    track,
    options,
    '/tmp/coord-repo/.coord/workspaces/auth-redesign/claude-mcp.json'
  );

  assert.equal(plan.command, 'claude');
  assert.equal(plan.cwd, pointer.path);
  assert.deepEqual(plan.args, [
    '--mcp-config',
    '/tmp/coord-repo/.coord/workspaces/auth-redesign/claude-mcp.json'
  ]);
  assert.equal(plan.env.COORD_WORKSPACE_ID, track.id);
  assert.equal(plan.env.COORD_SESSION_NAME, track.sessionName);
});

test('Codex launch sets its working root and injects Coord MCP without global config writes', () => {
  const plan = buildAgentLaunchPlan('codex', pointer, track, options);

  assert.equal(plan.command, 'codex');
  assert.equal(plan.cwd, pointer.path);
  assert.deepEqual(plan.args.slice(0, 2), ['-C', pointer.path]);
  assert.ok(plan.args.some((arg) => arg.includes('mcp_servers.coord.command')));
  assert.ok(plan.args.some((arg) => arg.includes('mcp_servers.coord.args')));
  assert.ok(plan.args.some((arg) => arg.includes('COORD_WORKSPACE_ID')));
  assert.equal(plan.env.COORD_REPO_ROOT, options.repoRoot);
});

test('Cursor opens the worktree and shell starts as a login shell', () => {
  const cursor = buildAgentLaunchPlan('cursor', pointer, track, options);
  assert.equal(cursor.command, 'cursor');
  assert.deepEqual(cursor.args, ['.']);

  const shell = buildAgentLaunchPlan('shell', pointer, track, options);
  assert.equal(shell.cwd, pointer.path);
  assert.equal(shell.command, process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'));
  assert.deepEqual(shell.args, process.platform === 'win32' ? [] : ['-l']);
});
