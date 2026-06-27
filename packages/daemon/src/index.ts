import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import 'dotenv/config';
import { z } from 'zod';
import type {
  ApiResult,
  EventListResponse,
  JoinWorkspaceRequest,
  JoinWorkspaceResponse,
  Participant,
  Project,
  ProjectListResponse,
  ProjectMember,
  ProjectMemberListResponse,
  PublishEventPayload,
  PublishEventRequest,
  StartWorkspaceRequest,
  StartWorkspaceResponse,
  TeambridgeConfig,
  TeambridgeErrorCode,
  TrackListResponse,
  VaultContextResponse,
  VaultReadResponse,
  Workspace,
  WorkspaceEvent,
  WorkspaceListResponse,
  WorkspaceManifest
} from '@teambridge/core';
import {
  JoinWorkspaceRequestSchema,
  PublishEventRequestSchema,
  StartWorkspaceRequestSchema,
  TeambridgeConfigSchema
} from '@teambridge/core';
import {
  createVaultContext,
  initializePhaseOneVault,
  materializePublishEvent,
  readEventsJsonl,
  readVaultFile,
  rebuildPhaseOneVault
} from '@teambridge/vault';
import {
  generatePfp,
  getOrGenerateAvatar,
  regenerateAvatar,
  type DitherAlgorithm,
  type PfpOptions
} from './pfp';

const DEFAULT_PORT = 9473;

const StartRequestBodySchema = StartWorkspaceRequestSchema.extend({
  repoRoot: z.string().min(1).optional()
});

const JoinRequestBodySchema = JoinWorkspaceRequestSchema.extend({
  repoRoot: z.string().min(1).optional(),
  worktreePath: z.string().min(1).optional()
});

const PublishRequestBodySchema = PublishEventRequestSchema.extend({
  repoRoot: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional()
});

const VaultRebuildRequestBodySchema = z.object({
  repoRoot: z.string().min(1).optional()
});

const ConfigRequestBodySchema = z.object({
  repoRoot: z.string().min(1).optional()
});

const PfpPreviewBodySchema = z.object({
  query: z.string().optional(),
  size: z.number().int().min(8).max(512).optional(),
  algorithm: z.enum(['floyd-steinberg', 'atkinson', 'bayer']).optional(),
  bayerLevel: z.number().int().min(0).max(4).optional(),
  color: z.object({ r: z.number().int().min(0).max(255), g: z.number().int().min(0).max(255), b: z.number().int().min(0).max(255) }).optional(),
  seed: z.string().optional()
});

const PfpRegenerateBodySchema = z.object({
  repoRoot: z.string().min(1).optional(),
  participantId: z.string().min(1),
  query: z.string().optional(),
  size: z.number().int().min(8).max(512).optional(),
  algorithm: z.enum(['floyd-steinberg', 'atkinson', 'bayer']).optional(),
  bayerLevel: z.number().int().min(0).max(4).optional(),
  color: z.object({ r: z.number().int().min(0).max(255), g: z.number().int().min(0).max(255), b: z.number().int().min(0).max(255) }).optional()
});

const DEFAULT_CONFIG: TeambridgeConfig = {
  schemaVersion: 1,
  defaultRelayMode: 'local',
  daemonPort: DEFAULT_PORT,
  mcpPort: 9474,
  autoInject: true,
  vaultInjectionMode: 'compact',
  vault: {
    contextMaxBytes: 24000
  }
};

type StartRequestBody = StartWorkspaceRequest & {
  repoRoot?: string;
};

type JoinRequestBody = JoinWorkspaceRequest & {
  repoRoot?: string;
  worktreePath?: string;
};

type PublishRequestBody = PublishEventRequest & {
  repoRoot?: string;
  actorId?: string;
  deviceId?: string;
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

  // Migration: rename legacy workspaces table → tracks
  const existingTables = querySql<{ name: string }>(
    dbPath,
    "select name from sqlite_master where type='table' and name in ('workspaces', 'tracks')"
  );
  const hasWorkspaces = existingTables.some((t) => t.name === 'workspaces');
  const hasTracks = existingTables.some((t) => t.name === 'tracks');

  if (hasWorkspaces && !hasTracks) {
    runSql(dbPath, 'alter table workspaces rename to tracks;');
  }

  if (hasTracks || hasWorkspaces) {
    const cols = querySql<{ name: string }>(dbPath, "pragma table_info('tracks')");
    if (!cols.some((c) => c.name === 'project_id')) {
      runSql(dbPath, 'alter table tracks add column project_id text;');
    }
  }

  runSql(dbPath, `
    pragma journal_mode = wal;

    create table if not exists projects (
      id text primary key,
      name text not null unique,
      description text not null default '',
      status text not null check (status in ('active', 'archived')) default 'active',
      created_at text not null
    );

    create table if not exists project_members (
      id text primary key,
      project_id text not null references projects(id),
      display_name text not null,
      status text not null check (status in ('active', 'idle', 'offline')) default 'offline',
      last_seen_at text not null,
      unique(project_id, display_name)
    );

    create table if not exists tracks (
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
      relay_mode text not null check (relay_mode = 'local'),
      project_id text references projects(id)
    );

    create table if not exists participants (
      id text primary key,
      workspace_id text not null references tracks(id),
      display_name text not null,
      branch text not null,
      agent text check (agent in ('claude-code', 'cursor', 'codex', 'ghost', 'unknown') or agent is null),
      status text not null check (status in ('active', 'idle', 'offline')),
      last_seen_at text not null,
      unique (workspace_id, display_name),
      unique (workspace_id, branch)
    );

    create table if not exists worktrees (
      workspace_id text not null references tracks(id),
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
      workspace_id text primary key references tracks(id),
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
    relayMode: 'local',
    projectId: row.project_id ? String(row.project_id) : null
  };
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: String(row.created_at)
  };
}

function rowToProjectMember(row: Record<string, unknown>): ProjectMember {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    displayName: String(row.display_name),
    status: (row.status === 'idle' || row.status === 'offline') ? row.status : 'active',
    lastSeenAt: String(row.last_seen_at)
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
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json'
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendCorsPreflight(response: ServerResponse): void {
  response.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end();
}

function sendBinary(
  response: ServerResponse,
  status: number,
  buffer: Buffer,
  contentType: string,
  extraHeaders?: Record<string, string>
): void {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-expose-headers': 'x-pfp-source,x-pfp-source-url,x-pfp-image-url,x-pfp-photographer,x-pfp-alt',
    'content-type': contentType,
    'content-length': buffer.length,
    'cache-control': 'no-store',
    ...extraHeaders
  });
  response.end(buffer);
}

async function ensureTeambridgeDirs(repoRoot: string): Promise<void> {
  await mkdir(join(repoRoot, '.teambridge', 'workspaces'), { recursive: true });
}

function getConfigPath(repoRoot: string): string {
  return join(repoRoot, '.teambridge', 'config.json');
}

async function readRepoConfig(repoRoot: string): Promise<TeambridgeConfig> {
  const configPath = getConfigPath(repoRoot);
  const content = await readFile(configPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (!content) {
    return DEFAULT_CONFIG;
  }

  return TeambridgeConfigSchema.parse(JSON.parse(content));
}

async function initRepoConfig(repoRoot: string): Promise<{ config: TeambridgeConfig; path: string; created: boolean }> {
  await ensureTeambridgeDirs(repoRoot);

  const configPath = getConfigPath(repoRoot);
  const existing = await readFile(configPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (existing) {
    return {
      config: TeambridgeConfigSchema.parse(JSON.parse(existing)),
      path: configPath,
      created: false
    };
  }

  await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { flag: 'wx' });
  return {
    config: DEFAULT_CONFIG,
    path: configPath,
    created: true
  };
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
    relayMode: 'local',
    projectId: null
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

    insert into tracks (
      id, session_name, repo_remote, repo_root_hash, base_ref, base_commit,
      scope_json, created_by, created_at, status, relay_mode, project_id
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
      ${sqlValue(workspace.relayMode)},
      ${sqlValue(workspace.projectId)}
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
  const rows = querySql<Record<string, unknown>>(dbPath, 'select * from tracks order by created_at desc');
  return rows.map(rowToWorkspace);
}

function listProjects(repoRoot: string): Project[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(dbPath, 'select * from projects order by created_at desc');
  return rows.map(rowToProject);
}

function getProjectById(repoRoot: string, projectId: string): Project | undefined {
  const dbPath = initializeStateDb(repoRoot);
  const [row] = querySql<Record<string, unknown>>(
    dbPath,
    `select * from projects where id = ${sqlValue(projectId)} limit 1`
  );
  return row ? rowToProject(row) : undefined;
}

function listProjectMembers(repoRoot: string, projectId: string): ProjectMember[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(
    dbPath,
    `select * from project_members where project_id = ${sqlValue(projectId)} order by display_name asc`
  );
  return rows.map(rowToProjectMember);
}

function listTracksByProject(repoRoot: string, projectId: string): Workspace[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(
    dbPath,
    `select * from tracks where project_id = ${sqlValue(projectId)} order by created_at desc`
  );
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

function getWorkspaceByIdentifier(repoRoot: string, identifier: string): Workspace | undefined {
  const dbPath = initializeStateDb(repoRoot);
  const [row] = querySql<Record<string, unknown>>(
    dbPath,
    `select * from tracks where id = ${sqlValue(identifier)} or session_name = ${sqlValue(identifier)} limit 1`
  );

  return row ? rowToWorkspace(row) : undefined;
}

function getLastSeq(repoRoot: string, workspaceId: string): number {
  const dbPath = initializeStateDb(repoRoot);
  const [row] = querySql<{ last_seq?: number }>(
    dbPath,
    `select last_seq from local_sequences where workspace_id = ${sqlValue(workspaceId)}`
  );

  return row?.last_seq ?? 0;
}

async function writeWorkspaceManifest(repoRoot: string, workspace: Workspace): Promise<WorkspaceManifest> {
  const manifest: WorkspaceManifest = {
    ...workspace,
    schemaVersion: 1,
    participants: listParticipants(repoRoot, workspace.id)
  };

  await writeFile(
    join(getWorkspaceDir(repoRoot, workspace.sessionName), 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return manifest;
}

function getWorkspacePaths(repoRoot: string, workspace: Workspace): { workspaceDir: string; eventsPath: string; vaultDir: string } {
  const workspaceDir = getWorkspaceDir(repoRoot, workspace.sessionName);
  return {
    workspaceDir,
    eventsPath: join(workspaceDir, 'events.jsonl'),
    vaultDir: join(workspaceDir, 'vault')
  };
}

async function joinWorkspace(state: AppState, body: JoinRequestBody): Promise<JoinWorkspaceResponse> {
  if (!body.sessionName?.trim()) {
    throw new Error('sessionName is required');
  }

  const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
  await ensureTeambridgeDirs(repoRoot);

  const workspace = getWorkspaceByIdentifier(repoRoot, body.sessionName.trim());
  if (!workspace) {
    throw new Error(`Workspace not found: ${body.sessionName}`);
  }

  const dbPath = initializeStateDb(repoRoot);
  const now = new Date().toISOString();
  const displayName = safeDisplayName(body.displayName ?? process.env.USER ?? 'local');
  const participantId = `user_${randomUUID()}`;
  const branch = `teambridge/${workspace.sessionName}/${displayName}`;
  const participant: Participant = {
    id: participantId,
    workspaceId: workspace.id,
    displayName,
    branch,
    agent: body.agent,
    status: 'active',
    lastSeenAt: now
  };

  runSql(dbPath, `
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
  `);

  const currentCommit = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const worktreePath = body.worktreePath ? resolve(body.worktreePath) : repoRoot;

  if (body.worktreePath) {
    runSql(dbPath, `
      insert or replace into worktrees (
        workspace_id, user_id, path, branch, base_commit, current_commit, dirty
      ) values (
        ${sqlValue(workspace.id)},
        ${sqlValue(participantId)},
        ${sqlValue(worktreePath)},
        ${sqlValue(branch)},
        ${sqlValue(workspace.baseCommit)},
        ${sqlValue(currentCommit)},
        0
      );
    `);
  }

  const manifest = await writeWorkspaceManifest(repoRoot, workspace);

  return {
    manifest,
    worktree: {
      workspaceId: workspace.id,
      userId: participantId,
      path: worktreePath,
      branch,
      baseCommit: workspace.baseCommit,
      currentCommit,
      dirty: false
    }
  };
}

async function appendPublishEvent(
  state: AppState,
  workspaceIdentifier: string,
  body: PublishRequestBody
): Promise<WorkspaceEvent<PublishEventPayload>> {
  const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
  const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceIdentifier}`);
  }

  if (!body.targetFile) {
    throw new Error('targetFile is required');
  }

  const payload = body.payload as PublishEventPayload | undefined;
  if (!payload?.text?.trim()) {
    throw new Error('payload.text is required');
  }

  const dbPath = initializeStateDb(repoRoot);
  runSql(
    dbPath,
    `update local_sequences set last_seq = last_seq + 1 where workspace_id = ${sqlValue(workspace.id)};`
  );
  const seq = getLastSeq(repoRoot, workspace.id);

  const event: WorkspaceEvent<PublishEventPayload> = {
    id: `evt_${randomUUID()}`,
    workspaceId: workspace.id,
    seq,
    type: 'publish',
    actorId: body.actorId ?? workspace.createdBy,
    deviceId: body.deviceId ?? 'device_local',
    targetFile: body.targetFile,
    payload,
    dedupeKey: body.dedupeKey,
    createdAt: new Date().toISOString()
  };

  const { eventsPath, vaultDir } = getWorkspacePaths(repoRoot, workspace);
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`);
  await materializePublishEvent(vaultDir, event);

  return event;
}

async function handleRequest(state: AppState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (method === 'OPTIONS') {
    sendCorsPreflight(response);
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, ok({ status: 'ok' }));
    return;
  }

  if (method === 'GET' && url.pathname === '/config') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const config = await readRepoConfig(repoRoot);
    sendJson(response, 200, ok({ config, path: getConfigPath(repoRoot), exists: config !== DEFAULT_CONFIG }));
    return;
  }

  if (method === 'POST' && url.pathname === '/config/init') {
    const body = ConfigRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const result = await initRepoConfig(repoRoot);
    sendJson(response, result.created ? 201 : 200, ok(result));
    return;
  }

  if (method === 'GET' && url.pathname === '/workspaces') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    sendJson<WorkspaceListResponse>(response, 200, ok({ workspaces: listWorkspaces(repoRoot) }));
    return;
  }

  if (method === 'GET' && url.pathname === '/tracks') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    sendJson<TrackListResponse>(response, 200, ok({ tracks: listWorkspaces(repoRoot) }));
    return;
  }

  if (method === 'GET' && url.pathname === '/projects') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    sendJson<ProjectListResponse>(response, 200, ok({ projects: listProjects(repoRoot) }));
    return;
  }

  const projectMembersMatch = url.pathname.match(/^\/projects\/([^/]+)\/members$/);
  if (method === 'GET' && projectMembersMatch) {
    const projectId = decodeURIComponent(projectMembersMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const project = getProjectById(repoRoot, projectId);
    if (!project) {
      sendJson(response, 404, fail('PROJECT_NOT_FOUND', `Project ${projectId} was not found`));
      return;
    }
    sendJson<ProjectMemberListResponse>(response, 200, ok({ members: listProjectMembers(repoRoot, projectId) }));
    return;
  }

  const projectTracksMatch = url.pathname.match(/^\/projects\/([^/]+)\/tracks$/);
  if (method === 'GET' && projectTracksMatch) {
    const projectId = decodeURIComponent(projectTracksMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const project = getProjectById(repoRoot, projectId);
    if (!project) {
      sendJson(response, 404, fail('PROJECT_NOT_FOUND', `Project ${projectId} was not found`));
      return;
    }
    sendJson<TrackListResponse>(response, 200, ok({ tracks: listTracksByProject(repoRoot, projectId) }));
    return;
  }

  if (method === 'POST' && url.pathname === '/workspaces/start') {
    const body = StartRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const result = await startWorkspace(state, body);
    sendJson(response, 201, ok(result));
    return;
  }

  if (method === 'POST' && url.pathname === '/workspaces/join') {
    const body = JoinRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const result = await joinWorkspace(state, body);
    sendJson(response, 201, ok(result));
    return;
  }

  const eventListMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/events$/);
  if (method === 'GET' && eventListMatch) {
    const workspaceIdentifier = decodeURIComponent(eventListMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const events = await readEventsJsonl(getWorkspacePaths(repoRoot, workspace).eventsPath);
    sendJson<EventListResponse>(response, 200, ok({ events }));
    return;
  }

  if (method === 'POST' && eventListMatch) {
    const workspaceIdentifier = decodeURIComponent(eventListMatch[1]);
    const body = PublishRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const event = await appendPublishEvent(state, workspaceIdentifier, body);
    sendJson(response, 201, ok({ event }));
    return;
  }

  const vaultReadMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/vault\/read$/);
  if (method === 'GET' && vaultReadMatch) {
    const workspaceIdentifier = decodeURIComponent(vaultReadMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const path = url.searchParams.get('path');
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }
    if (!path) {
      sendJson(response, 400, fail('INVALID_REQUEST', 'path query parameter is required'));
      return;
    }

    const file = await readVaultFile(getWorkspacePaths(repoRoot, workspace).vaultDir, path);
    sendJson<VaultReadResponse>(response, 200, ok({ file }));
    return;
  }

  const vaultContextMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/vault\/context$/);
  if (method === 'GET' && vaultContextMatch) {
    const workspaceIdentifier = decodeURIComponent(vaultContextMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const repoConfig = await readRepoConfig(repoRoot);
    const maxBytes = Number(url.searchParams.get('maxBytes') ?? repoConfig.vault.contextMaxBytes);
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const context = await createVaultContext(
      workspace.id,
      getWorkspacePaths(repoRoot, workspace).vaultDir,
      getLastSeq(repoRoot, workspace.id),
      maxBytes
    );
    sendJson<VaultContextResponse>(response, 200, ok({ context }));
    return;
  }

  const vaultRebuildMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/vault\/rebuild$/);
  if (method === 'POST' && vaultRebuildMatch) {
    const workspaceIdentifier = decodeURIComponent(vaultRebuildMatch[1]);
    const body = VaultRebuildRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const { eventsPath, vaultDir } = getWorkspacePaths(repoRoot, workspace);
    const result = await rebuildPhaseOneVault(vaultDir, eventsPath);
    sendJson(response, 200, ok({ rebuilt: true, lastSeq: result.lastSeq }));
    return;
  }

  const statusMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/status$/);
  if (method === 'GET' && statusMatch) {
    const workspaceIdentifier = decodeURIComponent(statusMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const dbPath = initializeStateDb(repoRoot);
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);

    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const [sequence] = querySql<{ last_seq?: number }>(
      dbPath,
      `select last_seq from local_sequences where workspace_id = ${sqlValue(workspace.id)}`
    );

    sendJson(response, 200, ok({
      workspace,
      participants: listParticipants(repoRoot, workspace.id),
      lastSeq: sequence?.last_seq ?? 0
    }));
    return;
  }

  const avatarMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/participants\/([^/]+)\/avatar$/);
  if (method === 'GET' && avatarMatch) {
    const workspaceIdentifier = decodeURIComponent(avatarMatch[1]);
    const participantId = decodeURIComponent(avatarMatch[2]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }
    const participants = listParticipants(repoRoot, workspace.id);
    if (!participants.some((participant) => participant.id === participantId)) {
      sendJson(response, 404, fail('NOT_FOUND', `Participant ${participantId} was not found`));
      return;
    }
    const { png } = await getOrGenerateAvatar(repoRoot, participantId, {
      query: url.searchParams.get('query') ?? undefined,
      size: url.searchParams.get('size') ? Number(url.searchParams.get('size')) : undefined,
      algorithm: (url.searchParams.get('algorithm') as DitherAlgorithm | null) ?? undefined,
      bayerLevel: url.searchParams.get('bayerLevel') ? Number(url.searchParams.get('bayerLevel')) : undefined
    });
    sendBinary(response, 200, png, 'image/png');
    return;
  }

  if (method === 'POST' && url.pathname === '/dev/pfp/preview') {
    const body = PfpPreviewBodySchema.parse(await readJsonBody<unknown>(request));
    const options: PfpOptions = {
      query: body.query,
      size: body.size,
      algorithm: body.algorithm,
      bayerLevel: body.bayerLevel,
      color: body.color,
      seed: body.seed
    };
    const { png, meta } = await generatePfp(options);
    sendBinary(response, 200, png, 'image/png', {
      'x-pfp-source': meta.source,
      'x-pfp-source-url': meta.sourceUrl ?? '',
      'x-pfp-image-url': meta.imageUrl ?? '',
      'x-pfp-photographer': meta.photographer ?? '',
      'x-pfp-alt': meta.alt ?? ''
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/dev/pfp/regenerate') {
    const body = PfpRegenerateBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const { meta } = await regenerateAvatar(repoRoot, body.participantId, {
      query: body.query,
      size: body.size,
      algorithm: body.algorithm,
      bayerLevel: body.bayerLevel,
      color: body.color
    });
    sendJson(response, 200, ok({ participantId: body.participantId, meta }));
    return;
  }

  sendJson(response, 404, fail('NOT_FOUND', `${method} ${url.pathname} is not implemented`));
}

function main(): void {
  const { port, repoRoot } = parseArgs(process.argv.slice(2));
  const state: AppState = { defaultRepoRoot: repoRoot };

  const server = createServer((request, response) => {
    handleRequest(state, request, response).catch((error: unknown) => {
      if (error instanceof z.ZodError) {
        sendJson(response, 400, fail('INVALID_REQUEST', 'Request body failed validation', error.issues));
        return;
      }

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
