import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTempGitRepo, getFreePort, parseCreatedProjectId, removeTempDir, runCli, startTestDaemon } from './helpers.mjs';

const TEST_REMOTE = 'https://example.com/coord/relay-bootstrap.git';

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function queryValue(url, key, prefix = 'eq.') {
  const value = url.searchParams.get(key);
  return value?.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function seedRemoteIdentity(repoRoot, relayUrl, email) {
  const userId = `remote_${email.replace(/[^a-z0-9]/gi, '_')}`;
  execFileSync('sqlite3', [
    join(repoRoot, '.coord', 'state.sqlite'),
    `
      insert into remote_identity (
        relay_url, user_id, email, access_token, refresh_token, expires_at, updated_at
      ) values (
        '${relayUrl.replace(/'/g, "''")}',
        '${userId}',
        '${email}',
        'token-${email}',
        'refresh-${email}',
        '2099-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      );
    `
  ]);
}

async function daemonGet(baseUrl, path, repoRoot) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('repoRoot', repoRoot);
  const response = await fetch(url);
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  assert.equal(body.ok, true, JSON.stringify(body));
  return body.data;
}

async function daemonPost(baseUrl, path, repoRoot, body = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoRoot, ...body })
  });
  const parsed = await response.json();
  assert.equal(response.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.data;
}

async function startMockSupabase() {
  const port = await getFreePort();
  const rows = {
    profiles: new Map(),
    devices: new Map(),
    projects: new Map(),
    projectMembers: new Map(),
    workspaces: new Map(),
    participants: new Map(),
    events: new Map(),
    checkpoints: new Map(),
    leases: new Map(),
    storage: new Map()
  };
  let appendAvailable = false;

  const send = (response, status, body, headers = {}) => {
    response.writeHead(status, {
      'access-control-allow-origin': '*',
      'content-type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
      ...headers
    });
    response.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const upsert = (table, key) => async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString('utf8') || '[]');
    for (const row of body) rows[table].set(row[key], { ...(rows[table].get(row[key]) ?? {}), ...row });
    send(response, 200, body);
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

      if (request.method === 'POST' && url.pathname === '/auth/v1/token') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '{}');
        send(response, 200, {
          access_token: `token-${body.email}`,
          refresh_token: `refresh-${body.email}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: `remote_${String(body.email).replace(/[^a-z0-9]/gi, '_')}`, email: body.email }
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_profiles') return upsert('profiles', 'user_id')(request, response);
      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_devices') return upsert('devices', 'id')(request, response);
      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_projects') return upsert('projects', 'id')(request, response);
      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_project_members') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '[]');
        for (const row of body) rows.projectMembers.set(`${row.project_id}:${row.user_id}`, row);
        send(response, 200, body);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_participants') return upsert('participants', 'id')(request, response);

      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_workspaces') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '[]');
        for (const row of body) rows.workspaces.set(row.id, { ...(rows.workspaces.get(row.id) ?? {}), ...row });
        send(response, 200, body);
        return;
      }

      if (request.method === 'PATCH' && url.pathname === '/rest/v1/tc_workspaces') {
        const id = queryValue(url, 'id');
        const patch = JSON.parse((await readBody(request)).toString('utf8') || '{}');
        rows.workspaces.set(id, { ...(rows.workspaces.get(id) ?? {}), ...patch });
        send(response, 200, [rows.workspaces.get(id)]);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_workspaces') {
        const repoRemote = queryValue(url, 'repo_remote');
        const repoHash = queryValue(url, 'repo_root_hash');
        const workspaces = [...rows.workspaces.values()]
          .filter((row) => !repoRemote || row.repo_remote === repoRemote)
          .filter((row) => !repoHash || row.repo_root_hash === repoHash)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        send(response, 200, workspaces);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_participants') {
        const workspaceId = queryValue(url, 'workspace_id');
        send(response, 200, [...rows.participants.values()].filter((row) => row.workspace_id === workspaceId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/tc_append_event') {
        if (!appendAvailable) {
          send(response, 503, { error: 'network closed' });
          return;
        }
        const body = JSON.parse((await readBody(request)).toString('utf8') || '{}');
        const events = rows.events.get(body.p_workspace_id) ?? [];
        const existing = events.find((event) => event.dedupe_key === body.p_dedupe_key);
        if (existing) {
          send(response, 200, [existing]);
          return;
        }
        const row = {
          id: body.p_event_id,
          workspace_id: body.p_workspace_id,
          seq: events.length + 1,
          type: body.p_type,
          actor_id: body.p_actor_id,
          device_id: body.p_device_id,
          target_file: body.p_target_file,
          payload: body.p_payload,
          dedupe_key: body.p_dedupe_key,
          created_at: new Date().toISOString()
        };
        rows.events.set(body.p_workspace_id, [...events, row]);
        send(response, 200, [row]);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_workspace_events') {
        const workspaceId = queryValue(url, 'workspace_id');
        const afterSeq = Number(queryValue(url, 'seq', 'gt.') ?? 0);
        const events = (rows.events.get(workspaceId) ?? [])
          .filter((event) => Number(event.seq) > afterSeq)
          .sort((a, b) => Number(a.seq) - Number(b.seq));
        send(response, 200, events);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_checkpoint_leases') {
        const workspaceId = queryValue(url, 'workspace_id');
        const lease = rows.leases.get(workspaceId);
        send(response, 200, lease ? [lease] : []);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_checkpoint_leases') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '[]');
        for (const row of body) rows.leases.set(row.workspace_id, row);
        send(response, 200, body);
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/rest/v1/tc_checkpoint_leases') {
        rows.leases.delete(queryValue(url, 'workspace_id'));
        send(response, 200, []);
        return;
      }

      if (request.method === 'PUT' && url.pathname.startsWith('/storage/v1/object/teambridge-checkpoints/')) {
        const storagePath = decodeURIComponent(url.pathname.replace('/storage/v1/object/teambridge-checkpoints/', ''));
        rows.storage.set(storagePath, await readBody(request));
        send(response, 200, {});
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/storage/v1/object/teambridge-checkpoints/')) {
        const storagePath = decodeURIComponent(url.pathname.replace('/storage/v1/object/teambridge-checkpoints/', ''));
        const body = rows.storage.get(storagePath);
        if (!body) {
          send(response, 404, { error: 'missing object' });
          return;
        }
        send(response, 200, body, { 'content-type': 'application/gzip' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_workspace_vault_checkpoints') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '[]');
        for (const row of body) rows.checkpoints.set(`${row.workspace_id}:${row.seq}`, row);
        send(response, 200, body);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_workspace_vault_checkpoints') {
        const workspaceId = queryValue(url, 'workspace_id');
        const checkpoints = [...rows.checkpoints.values()]
          .filter((row) => row.workspace_id === workspaceId)
          .sort((a, b) => Number(b.seq) - Number(a.seq));
        send(response, 200, checkpoints.slice(0, Number(url.searchParams.get('limit') ?? checkpoints.length)));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/rest/v1/tc_presence') {
        send(response, 200, []);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/rest/v1/tc_presence') {
        send(response, 200, JSON.parse((await readBody(request)).toString('utf8') || '[]'));
        return;
      }

      send(response, 404, { error: `Unhandled ${request.method} ${url.pathname}` });
    } catch (error) {
      send(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}`,
    rows,
    setAppendAvailable(value) {
      appendAvailable = value;
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

test('relay reconnect pushes queued events and late join bootstraps from checkpoint', async (t) => {
  const mock = await startMockSupabase();
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_REST_URL: process.env.SUPABASE_REST_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    COORD_RELAY_SYNC_INTERVAL_MS: process.env.COORD_RELAY_SYNC_INTERVAL_MS,
    COORD_CHECKPOINT_INTERVAL_EVENTS: process.env.COORD_CHECKPOINT_INTERVAL_EVENTS
  };
  Object.assign(process.env, {
    SUPABASE_URL: mock.url,
    SUPABASE_REST_URL: `${mock.url}/rest/v1`,
    SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
    COORD_RELAY_SYNC_INTERVAL_MS: '60000',
    COORD_CHECKPOINT_INTERVAL_EVENTS: '1'
  });
  t.after(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await mock.stop();
  });

  const repoRoot = await createTempGitRepo();
  const cloneRoot = await mkdtemp(join(tmpdir(), 'coord-it-clone-'));
  t.after(async () => {
    await removeTempDir(repoRoot);
    await rm(cloneRoot, { recursive: true, force: true });
  });

  execFileSync('git', ['remote', 'add', 'origin', TEST_REMOTE], { cwd: repoRoot });
  execFileSync('git', ['clone', repoRoot, cloneRoot], { stdio: 'ignore' });
  execFileSync('git', ['remote', 'set-url', 'origin', TEST_REMOTE], { cwd: cloneRoot });
  execFileSync('git', ['config', 'user.email', 'coord-test@local'], { cwd: cloneRoot });
  execFileSync('git', ['config', 'user.name', 'Coord Test'], { cwd: cloneRoot });

  const daemon = await startTestDaemon(repoRoot);
  const cloneDaemon = await startTestDaemon(cloneRoot);
  t.after(async () => {
    await daemon.stop();
    await cloneDaemon.stop();
  });

  const ctx = { repoRoot, baseUrl: daemon.baseUrl };
  assert.equal(runCli(['init', '--first-name', 'Nihal', '--last-name', 'T', '--relay', 'supabase'], ctx).exitCode, 0);
  seedRemoteIdentity(repoRoot, mock.url, 'nihal@test.com');

  const createProject = runCli(['project', 'create', '--name', 'Relay Bootstrap'], ctx);
  assert.equal(createProject.exitCode, 0, createProject.stderr || createProject.stdout);
  const projectId = parseCreatedProjectId(createProject.stdout);

  const start = await daemonPost(daemon.baseUrl, '/workspaces/start', repoRoot, {
    sessionName: 'relay-bootstrap',
    projectId,
    displayName: 'Nihal T'
  });
  const workspaceId = start.manifest.id;

  await daemonPost(daemon.baseUrl, `/workspaces/${workspaceId}/events`, repoRoot, {
    targetFile: 'decisions.md',
    payload: { text: 'Queued while relay is down' }
  });
  const queuedStatus = await daemonGet(daemon.baseUrl, '/relay/status', repoRoot);
  assert.equal(queuedStatus.pending, 1);

  mock.setAppendAvailable(true);
  const sync = await daemonPost(daemon.baseUrl, '/relay/sync', repoRoot);
  assert.equal(sync.pushed, 1);
  assert.equal(mock.rows.events.get(workspaceId)?.length, 1);
  assert.equal([...mock.rows.checkpoints.values()].length, 1);

  const syncedStatus = await daemonGet(daemon.baseUrl, '/relay/status', repoRoot);
  assert.equal(syncedStatus.pending, 0);

  const cloneCtx = { repoRoot: cloneRoot, baseUrl: cloneDaemon.baseUrl };
  assert.equal(runCli(['init', '--first-name', 'Kush', '--last-name', 'T', '--relay', 'supabase'], cloneCtx).exitCode, 0);
  seedRemoteIdentity(cloneRoot, mock.url, 'kush@test.com');

  await daemonPost(cloneDaemon.baseUrl, '/workspaces/join', cloneRoot, {
    sessionName: 'relay-bootstrap',
    displayName: 'Kush T'
  });

  const bootstrappedDecision = await readFile(
    join(cloneRoot, '.coord', 'workspaces', 'relay-bootstrap', 'vault', 'decisions.md'),
    'utf8'
  );
  assert.match(bootstrappedDecision, /Queued while relay is down/);
});
