import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  ApiResult,
  Participant,
  StartWorkspaceRequest,
  StartWorkspaceResponse,
  TeambridgeErrorCode,
  Workspace,
  WorkspaceListResponse,
  WorkspaceManifest
} from '@teambridge/core';
import { initializePhaseOneVault } from '@teambridge/vault';

const DEFAULT_PORT = 9473;

type StartRequestBody = StartWorkspaceRequest & {
  repoRoot?: string;
};

type AppState = {
  defaultRepoRoot: string;
};

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

function fail(code: TeambridgeErrorCode, message: string, details?: unknown): ApiResult<never> {
  return {
    ok: false,
    error: { code, message, details }
  };
}

function parseArgs(argv: string[]): { port: number; repoRoot: string } {
  let port = Number(process.env.TEAMBRIDGE_DAEMON_PORT ?? DEFAULT_PORT);
  let repoRoot = process.env.TEAMBRIDGE_REPO_ROOT ?? process.cwd();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--port' && next) {
      port = Number(next);
      i += 1;
    } else if (arg === '--repo' && next) {
      repoRoot = next;
      i += 1;
    }
  }

  return { port, repoRoot: resolve(repoRoot) };
}

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function getRepoRoot(inputPath: string): string {
  try {
    return runGit(inputPath, ['rev-parse', '--show-toplevel']);
  } catch {
    throw new Error(`Not a git repository: ${inputPath}`);
  }
}

function resolveBaseCommit(repoRoot: string, baseRef: string): string {
  return runGit(repoRoot, ['rev-parse', baseRef]);
}

function getRepoRemote(repoRoot: string): string | null {
  try {
    return runGit(repoRoot, ['config', '--get', 'remote.origin.url']) || null;
  } catch {
    return null;
  }
}

function getCurrentBranch(repoRoot: string): string {
  try {
    return runGit(repoRoot, ['branch', '--show-current']) || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

function getRepoRootHash(repoRoot: string): string {
  return createHash('sha256').update(repoRoot).digest('hex');
}

function safeDisplayName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'local';
}

function getWorkspaceDir(repoRoot: string, sessionName: string): string {
  return join(repoRoot, '.teambridge', 'workspaces', sessionName);
}

function sqlValue(value: string | number | null): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return `'${value.replace(/'/g, "''")}'`;
}

function runSql(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function querySql<T>(dbPath: string, sql: string): T[] {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  return output ? (JSON.parse(output) as T[]) : [];
}

function initializeStateDb(repoRoot: string): string {
  const teambridgeDir = join(repoRoot, '.teambridge');
  mkdirSync(teambridgeDir, { recursive: true });

  const dbPath = join(teambridgeDir, 'state.sqlite');
  runSql(dbPath, `
    pragma journal_mode = wal;

    create table if not exists workspaces (
      id text primary key,
      session_name text not null unique,
      repo_remote text,
      repo_root_hash text not null,
      base_ref text not null,
      base_commit text not null,
      scope_json text not null default '[]',
      created_by text not null,
      created_at text not null,
      status text not null check (status in ('active', 'archived')),
      relay_mode text not null check (relay_mode = 'local')
    );

    create table if not exists participants (
      id text primary key,
      workspace_id text not null references workspaces(id),
      display_name text not null,
      branch text not null,
      agent text check (agent in ('claude-code', 'cursor', 'codex', 'ghost', 'unknown') or agent is null),
      status text not null check (status in ('active', 'idle', 'offline')),
      last_seen_at text not null,
      unique (workspace_id, display_name),
      unique (workspace_id, branch)
    );

    create table if not exists worktrees (
      workspace_id text not null references workspaces(id),
      user_id text not null references participants(id),
      path text not null,
      branch text not null,
      base_commit text not null,
      current_commit text,
      dirty integer not null default 0 check (dirty in (0, 1)),
      primary key (workspace_id, user_id),
      unique (path),
      unique (branch)
    );

    create table if not exists local_sequences (
      workspace_id text primary key references workspaces(id),
      last_seq integer not null default 0
    );
  `);

  return dbPath;
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    sessionName: String(row.session_name),
    repoRemote: row.repo_remote === null ? null : String(row.repo_remote),
    repoRootHash: String(row.repo_root_hash),
    baseRef: String(row.base_ref),
    baseCommit: String(row.base_commit),
    scope: JSON.parse(String(row.scope_json)) as string[],
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    status: row.status === 'archived' ? 'archived' : 'active',
    relayMode: 'local'
  };
}

function rowToParticipant(row: Record<string, unknown>): Participant {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    displayName: String(row.display_name),
    branch: String(row.branch),
    agent: row.agent ? (String(row.agent) as Participant['agent']) : undefined,
    status: row.status === 'idle' || row.status === 'offline' ? row.status : 'active',
    lastSeenAt: String(row.last_seen_at)
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return (text ? JSON.parse(text) : {}) as T;
}

function sendJson<T>(response: ServerResponse, status: number, body: ApiResult<T>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body, null, 2));
}

async function ensureTeambridgeDirs(repoRoot: string): Promise<void> {
  await mkdir(join(repoRoot, '.teambridge', 'workspaces'), { recursive: true });
}

async function startWorkspace(state: AppState, body: StartRequestBody): Promise<StartWorkspaceResponse> {
  if (!body.sessionName?.trim()) {
    throw new Error('sessionName is required');
  }

  const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
  await ensureTeambridgeDirs(repoRoot);

  const dbPath = initializeStateDb(repoRoot);
  const sessionName = body.sessionName.trim();
  const displayName = safeDisplayName(body.displayName ?? process.env.USER ?? 'local');
  const baseRef = body.baseRef?.trim() || 'HEAD';
  const baseCommit = resolveBaseCommit(repoRoot, baseRef);
  const now = new Date().toISOString();
  const workspaceId = `ws_${randomUUID()}`;
  const participantId = `user_${randomUUID()}`;
  const branch = `teambridge/${sessionName}/${displayName}`;
  const repoRemote = getRepoRemote(repoRoot);
  const currentCommit = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const currentBranch = getCurrentBranch(repoRoot);

  const workspace: Workspace = {
    id: workspaceId,
    sessionName,
    repoRemote,
    repoRootHash: getRepoRootHash(repoRoot),
    baseRef,
    baseCommit,
    scope: body.scope ?? [],
    createdBy: participantId,
    createdAt: now,
    status: 'active',
    relayMode: 'local'
  };

  const participant: Participant = {
    id: participantId,
    displayName,
    workspaceId,
    branch,
    agent: body.agent,
    status: 'active',
    lastSeenAt: now
  };

  const workspaceDir = getWorkspaceDir(repoRoot, sessionName);
  const vaultDir = join(workspaceDir, 'vault');

  await mkdir(workspaceDir, { recursive: true });
  await initializePhaseOneVault(vaultDir);
  await writeFile(join(workspaceDir, 'events.jsonl'), '', { flag: 'a' });

  const persistedBranch = currentBranch === 'HEAD' ? branch : currentBranch;

  runSql(dbPath, `
    begin;

    insert into workspaces (
      id, session_name, repo_remote, repo_root_hash, base_ref, base_commit,
      scope_json, created_by, created_at, status, relay_mode
    ) values (
      ${sqlValue(workspace.id)},
      ${sqlValue(workspace.sessionName)},
      ${sqlValue(workspace.repoRemote)},
      ${sqlValue(workspace.repoRootHash)},
      ${sqlValue(workspace.baseRef)},
      ${sqlValue(workspace.baseCommit)},
      ${sqlValue(JSON.stringify(workspace.scope))},
      ${sqlValue(workspace.createdBy)},
      ${sqlValue(workspace.createdAt)},
      ${sqlValue(workspace.status)},
      ${sqlValue(workspace.relayMode)}
    );

    insert into participants (
      id, workspace_id, display_name, branch, agent, status, last_seen_at
    ) values (
      ${sqlValue(participant.id)},
      ${sqlValue(participant.workspaceId)},
      ${sqlValue(participant.displayName)},
      ${sqlValue(participant.branch)},
      ${sqlValue(participant.agent ?? null)},
      ${sqlValue(participant.status)},
      ${sqlValue(participant.lastSeenAt)}
    );

    insert or replace into worktrees (
      workspace_id, user_id, path, branch, base_commit, current_commit, dirty
    ) values (
      ${sqlValue(workspaceId)},
      ${sqlValue(participantId)},
      ${sqlValue(repoRoot)},
      ${sqlValue(persistedBranch)},
      ${sqlValue(baseCommit)},
      ${sqlValue(currentCommit)},
      0
    );

    insert into local_sequences (workspace_id, last_seq)
    values (${sqlValue(workspaceId)}, 0);

    commit;
  `);

  const manifest: WorkspaceManifest = {
    ...workspace,
    schemaVersion: 1,
    participants: [participant]
  };

  await writeFile(join(workspaceDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    worktree: {
      workspaceId,
      userId: participantId,
      path: repoRoot,
      branch: persistedBranch,
      baseCommit,
      currentCommit,
      dirty: false
    }
  };
}

function listWorkspaces(repoRoot: string): Workspace[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(dbPath, 'select * from workspaces order by created_at desc');
  return rows.map(rowToWorkspace);
}

function listParticipants(repoRoot: string, workspaceId: string): Participant[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(
    dbPath,
    `select * from participants where workspace_id = ${sqlValue(workspaceId)} order by display_name asc`
  );
  return rows.map(rowToParticipant);
}

async function handleRequest(state: AppState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, ok({ status: 'ok' }));
    return;
  }

  if (method === 'GET' && url.pathname === '/workspaces') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    sendJson<WorkspaceListResponse>(response, 200, ok({ workspaces: listWorkspaces(repoRoot) }));
    return;
  }

  if (method === 'POST' && url.pathname === '/workspaces/start') {
    const body = await readJsonBody<StartRequestBody>(request);
    const result = await startWorkspace(state, body);
    sendJson(response, 201, ok(result));
    return;
  }

  const statusMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/status$/);
  if (method === 'GET' && statusMatch) {
    const workspaceId = statusMatch[1];
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const dbPath = initializeStateDb(repoRoot);
    const [row] = querySql<Record<string, unknown>>(
      dbPath,
      `select * from workspaces where id = ${sqlValue(workspaceId)}`
    );

    if (!row) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} was not found`));
      return;
    }

    const [sequence] = querySql<{ last_seq?: number }>(
      dbPath,
      `select last_seq from local_sequences where workspace_id = ${sqlValue(workspaceId)}`
    );

    sendJson(response, 200, ok({
      workspace: rowToWorkspace(row),
      participants: listParticipants(repoRoot, workspaceId),
      lastSeq: sequence?.last_seq ?? 0
    }));
    return;
  }

  sendJson(response, 404, fail('NOT_FOUND', `${method} ${url.pathname} is not implemented`));
}

function main(): void {
  const { port, repoRoot } = parseArgs(process.argv.slice(2));
  const state: AppState = { defaultRepoRoot: repoRoot };

  const server = createServer((request, response) => {
    handleRequest(state, request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown daemon error';
      sendJson(response, 500, fail('INTERNAL_ERROR', message));
    });
  });

  server.listen(port, () => {
    console.log(`teambridge daemon listening on http://127.0.0.1:${port}`);
    console.log(`default repo: ${repoRoot}`);
  });
}

main();
