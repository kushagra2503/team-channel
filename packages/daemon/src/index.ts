import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: join(__dirname, '../../../.env') });
if (process.env.TEAMBRIDGE_REPO_ROOT) {
  dotenv.config({ path: join(resolve(process.env.TEAMBRIDGE_REPO_ROOT), '.env') });
}
import { z } from 'zod';
import type {
  ApiResult,
  EventListResponse,
  JoinWorkspaceRequest,
  JoinWorkspaceResponse,
  LocalUserProfile,
  LocalUserProfileResponse,
  Participant,
  Project,
  ProjectListResponse,
  ProjectMember,
  ProjectMemberListResponse,
  CreateProjectResponse,
  UpsertProjectMemberResponse,
  PublishEventPayload,
  PublishEventRequest,
  RepoContext,
  RepoContextResponse,
  StartWorkspaceRequest,
  StartWorkspaceResponse,
  SyncStateEntry,
  TeambridgeConfig,
  TeambridgeErrorCode,
  TrackListResponse,
  VaultCheckpoint,
  VaultAnnotateResponseBody,
  VaultContextResponse,
  VaultReadResponse,
  VaultSearchResponse,
  VaultSearchResult,
  WorktreeInfo,
  Workspace,
  WorkspaceEvent,
  WorkspaceListResponse,
  WorkspaceManifest
} from '@teambridge/core';
import {
  JoinWorkspaceRequestSchema,
  PublishEventRequestSchema,
  StartWorkspaceRequestSchema,
  TeambridgeConfigSchema,
  CreateProjectRequestSchema,
  SaveLocalUserProfileRequestSchema,
  UpsertProjectMemberRequestSchema,
  LocalUserProfileSchema,
  avatarStorageId,
  avatarNameSlug,
  formatDisplayName
} from '@teambridge/core';
import {
  annotateVaultItem,
  createVaultContext,
  initializePhaseOneVault,
  materializePublishEvent,
  PHASE_ONE_VAULT_FILES,
  readEventsJsonl,
  readVaultFile,
  rebuildPhaseOneVault
} from '@teambridge/vault';
import {
  DEFAULT_PFP_QUERY,
  generatePfp,
  getAvatarVersionForDisplayName,
  getOrGenerateAvatar,
  regenerateAvatar,
  type DitherAlgorithm,
  type PfpOptions
} from './pfp';

const DEFAULT_PORT = 9473;
const RELAY_SYNC_INTERVAL_MS = Number(process.env.TEAMBRIDGE_RELAY_SYNC_INTERVAL_MS ?? 5000);
const RELAY_PRESENCE_INTERVAL_MS = Number(process.env.TEAMBRIDGE_RELAY_PRESENCE_INTERVAL_MS ?? 15000);
const CHECKPOINT_INTERVAL_EVENTS = Number(process.env.TEAMBRIDGE_CHECKPOINT_INTERVAL_EVENTS ?? 50);
const CHECKPOINT_LEASE_MS = Number(process.env.TEAMBRIDGE_CHECKPOINT_LEASE_MS ?? 60000);
const CHECKPOINT_BUCKET = 'teambridge-checkpoints';

const StartRequestBodySchema = StartWorkspaceRequestSchema.extend({
  repoRoot: z.string().min(1).optional()
});

const CreateProjectBodySchema = CreateProjectRequestSchema.extend({
  repoRoot: z.string().min(1).optional()
});

const SaveLocalUserBodySchema = SaveLocalUserProfileRequestSchema.extend({
  repoRoot: z.string().min(1).optional()
});

const UpsertProjectMemberBodySchema = UpsertProjectMemberRequestSchema.extend({
  repoRoot: z.string().min(1).optional()
});

const OpenPathBodySchema = z.object({
  repoRoot: z.string().min(1).optional(),
  path: z.string().min(1)
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

const VaultAnnotateBodySchema = z.object({
  repoRoot: z.string().min(1).optional(),
  path: z.string().min(1),
  itemText: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  assign: z.string().regex(/^[\w-]+$/).nullable().optional()
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

const RegisterWorktreeBodySchema = z.object({
  repoRoot: z.string().min(1).optional(),
  userId: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().min(1),
  baseCommit: z.string().min(1),
  currentCommit: z.string().min(1).optional(),
  dirty: z.boolean().optional()
});

const AuthLoginBodySchema = z.object({
  repoRoot: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(1)
});

const RelayRequestBodySchema = z.object({
  repoRoot: z.string().min(1).optional()
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

function findGitRepoRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function parseArgs(argv: string[]): { port: number; repoRoot: string } {
  let port = Number(process.env.TEAMBRIDGE_DAEMON_PORT ?? DEFAULT_PORT);
  let repoRoot = process.env.TEAMBRIDGE_REPO_ROOT ?? findGitRepoRoot(process.cwd());

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

type ParsedRemote = {
  owner: string;
  name: string;
  webBase: string;
};

function parseGitRemote(remote: string): ParsedRemote | null {
  const sshMatch = remote.match(/^[^@]+@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const segments = sshMatch[2].replace(/\.git$/, '').split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0];
      const name = segments.slice(1).join('/');
      return { owner, name, webBase: `https://${host}/${owner}/${name}` };
    }
  }

  try {
    const normalized = remote.replace(/\.git$/, '');
    const url = normalized.includes('://') ? new URL(normalized) : new URL(`https://${normalized}`);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0];
      const name = segments[1];
      return { owner, name, webBase: `${url.protocol}//${url.host}/${owner}/${name}` };
    }
  } catch {
    return null;
  }

  return null;
}

function branchWebUrl(webBase: string | null, branch: string): string | null {
  if (!webBase || !branch || branch === 'HEAD') {
    return null;
  }
  return `${webBase}/tree/${encodeURIComponent(branch)}`;
}

function commitWebUrl(webBase: string | null, commitSha: string | null): string | null {
  if (!webBase || !commitSha) {
    return null;
  }
  return `${webBase}/commit/${commitSha}`;
}

function getPrimaryWorktreePath(repoRoot: string, workspaceId: string): string {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<{ path: string }>(
    dbPath,
    `select path from worktrees where workspace_id = ${sqlValue(workspaceId)} order by rowid asc`
  );
  if (rows.length === 0) {
    return repoRoot;
  }

  const resolvedRoot = resolve(repoRoot);
  const alternate = rows.find((row) => resolve(String(row.path)) !== resolvedRoot);
  return resolve(alternate?.path ?? rows[0].path);
}

function resolveLastPushRef(localPath: string, branch: string): string | null {
  if (!branch || branch === 'HEAD') {
    return null;
  }

  try {
    const upstream = runGit(localPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream) {
      const ahead = Number(runGit(localPath, ['rev-list', '--count', `${upstream}..HEAD`]) || '0');
      return ahead > 0 ? upstream : 'HEAD';
    }
  } catch {
    // fall through to origin/<branch>
  }

  try {
    runGit(localPath, ['rev-parse', '--verify', `origin/${branch}`]);
    return `origin/${branch}`;
  } catch {
    return 'HEAD';
  }
}

function getLastPushInfo(
  localPath: string,
  branch: string
): { lastPushAt: string | null; lastPushCommitSha: string | null } {
  const ref = resolveLastPushRef(localPath, branch);
  if (!ref) {
    return { lastPushAt: null, lastPushCommitSha: null };
  }

  try {
    const output = runGit(localPath, ['log', '-1', '--format=%cI%n%H', ref]);
    const [lastPushAt, lastPushCommitSha] = output.split('\n');
    return {
      lastPushAt: lastPushAt || null,
      lastPushCommitSha: lastPushCommitSha || null
    };
  } catch {
    return { lastPushAt: null, lastPushCommitSha: null };
  }
}

function buildRepoContext(repoRoot: string, workspaceId?: string): RepoContext {
  const localPath = workspaceId ? getPrimaryWorktreePath(repoRoot, workspaceId) : repoRoot;
  let remoteUrl: string | null = null;
  let branch = 'HEAD';
  let lastCommitAt: string | null = null;

  try {
    remoteUrl = runGit(localPath, ['config', '--get', 'remote.origin.url']) || null;
  } catch {
    try {
      remoteUrl = runGit(repoRoot, ['config', '--get', 'remote.origin.url']) || null;
    } catch {
      remoteUrl = null;
    }
  }

  try {
    branch = runGit(localPath, ['branch', '--show-current']) || 'HEAD';
  } catch {
    branch = 'HEAD';
  }

  try {
    lastCommitAt = runGit(localPath, ['log', '-1', '--format=%cI']) || null;
  } catch {
    lastCommitAt = null;
  }

  const parsed = remoteUrl ? parseGitRemote(remoteUrl) : null;
  const { lastPushAt, lastPushCommitSha } = getLastPushInfo(localPath, branch);

  return {
    remoteUrl,
    repoOwner: parsed?.owner ?? null,
    repoName: parsed?.name ?? null,
    repoLabel: parsed ? `${parsed.owner}/${parsed.name}` : null,
    repoWebUrl: parsed?.webBase ?? null,
    branch,
    branchWebUrl: branchWebUrl(parsed?.webBase ?? null, branch),
    localPath,
    lastCommitAt,
    lastPushAt,
    lastPushCommitSha,
    lastPushCommitWebUrl: commitWebUrl(parsed?.webBase ?? null, lastPushCommitSha)
  };
}

function openPathOnDevice(targetPath: string): void {
  const resolved = resolve(targetPath);
  if (process.platform === 'darwin') {
    execFileSync('open', [resolved], { stdio: 'ignore' });
    return;
  }
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'start', '', resolved], { stdio: 'ignore' });
    return;
  }
  execFileSync('xdg-open', [resolved], { stdio: 'ignore' });
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

    create table if not exists known_repos (
      repo_root text primary key,
      last_seen_at text not null
    );

    create table if not exists remote_identity (
      relay_url text primary key,
      user_id text not null,
      email text,
      access_token text not null,
      refresh_token text,
      expires_at text,
      updated_at text not null
    );

    create table if not exists remote_sync_state (
      workspace_id text primary key references tracks(id),
      last_remote_seq integer not null default 0,
      last_synced_at text,
      relay_status text not null default 'offline',
      last_error text
    );

    create table if not exists pending_remote_events (
      local_id text primary key,
      workspace_id text not null references tracks(id),
      actor_id text not null,
      device_id text not null,
      type text not null,
      target_file text,
      payload_json text not null,
      dedupe_key text not null unique,
      retry_count integer not null default 0,
      created_at text not null,
      last_error text
    );
  `);

  // Separate statement (and try/catch): if this sqlite3 build lacks FTS5, every
  // other Phase 1 table above must still be created. `vault search` degrades to
  // a clear error (see FTS5_UNAVAILABLE_MESSAGE) rather than the daemon crashing.
  try {
    runSql(dbPath, `
      create virtual table if not exists vault_search_index using fts5(
        workspace_id unindexed,
        path unindexed,
        line unindexed,
        seq unindexed,
        text
      );
    `);
  } catch (error) {
    console.error(
      `[teambridge] vault search index unavailable — this sqlite3 build lacks FTS5:\n  ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return dbPath;
}

const FTS5_UNAVAILABLE_MESSAGE =
  'Vault search is unavailable: the local sqlite3 build does not support FTS5. Install a sqlite3 build with FTS5 enabled to use `vault search`.';

function hasVaultSearchIndex(dbPath: string): boolean {
  const rows = querySql<{ name: string }>(
    dbPath,
    "select name from sqlite_master where type = 'table' and name = 'vault_search_index'"
  );
  return rows.length > 0;
}

/**
 * Delete-and-reinsert every non-blank line of ONE vault file. This is the same
 * shape of operation whether triggered by a single publish (one file) or a
 * full `/vault/rebuild` (every Phase 1 file) — so index rebuild inherits
 * exactly the same consistency guarantee as the vault files themselves.
 */
function reindexVaultFile(dbPath: string, workspaceId: string, path: string, content: string, seq: number): void {
  if (!hasVaultSearchIndex(dbPath)) {
    return;
  }

  runSql(
    dbPath,
    `delete from vault_search_index where workspace_id = ${sqlValue(workspaceId)} and path = ${sqlValue(path)};`
  );

  const lines = content.split('\n');
  const inserts = lines
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter((entry) => entry.text.length > 0)
    .map(
      (entry) =>
        `insert into vault_search_index (workspace_id, path, line, seq, text) values (${sqlValue(workspaceId)}, ${sqlValue(path)}, ${entry.line}, ${seq}, ${sqlValue(entry.text)});`
    );

  if (inserts.length > 0) {
    runSql(dbPath, inserts.join('\n'));
  }
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

function rowToSyncState(row: Record<string, unknown>): SyncStateEntry {
  return {
    workspaceId: String(row.workspace_id),
    lastRemoteSeq: Number(row.last_remote_seq ?? 0),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    relayStatus: String(row.relay_status ?? 'offline'),
    lastError: row.last_error ? String(row.last_error) : null
  };
}

function remoteCheckpointToVaultCheckpoint(row: RemoteCheckpointRow): VaultCheckpoint {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seq: Number(row.seq),
    storagePath: row.storage_path,
    hash: row.hash,
    createdByDeviceId: row.created_by_device_id,
    createdAt: row.created_at
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

const AVATAR_CACHE_CONTROL = 'public, max-age=86400, must-revalidate';

function avatarEtag(buffer: Buffer): string {
  return `"${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}"`;
}

function sendAvatarPng(response: ServerResponse, request: IncomingMessage, png: Buffer): void {
  const etag = avatarEtag(png);
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      etag,
      'cache-control': AVATAR_CACHE_CONTROL
    });
    response.end();
    return;
  }

  sendBinary(response, 200, png, 'image/png', {
    'cache-control': AVATAR_CACHE_CONTROL,
    etag
  });
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

function getUserProfilePath(repoRoot: string): string {
  return join(repoRoot, '.teambridge', 'user.json');
}

async function readLocalUserProfile(repoRoot: string): Promise<LocalUserProfile | null> {
  const profilePath = getUserProfilePath(repoRoot);
  const content = await readFile(profilePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (!content) {
    return null;
  }
  return LocalUserProfileSchema.parse(JSON.parse(content));
}

async function writeLocalUserProfile(repoRoot: string, profile: LocalUserProfile): Promise<string> {
  await ensureTeambridgeDirs(repoRoot);
  const profilePath = getUserProfilePath(repoRoot);
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  return profilePath;
}

async function saveLocalUserProfile(
  repoRoot: string,
  body: z.infer<typeof SaveLocalUserProfileRequestSchema>
): Promise<{ profile: LocalUserProfile; path: string }> {
  const displayName = formatDisplayName(body.firstName, body.lastName);
  const profile: LocalUserProfile = {
    schemaVersion: 1,
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    displayName,
    defaultAgent: body.defaultAgent,
    defaultProjectId: body.defaultProjectId ?? null
  };
  const path = await writeLocalUserProfile(repoRoot, profile);
  await ensureAvatarForDisplayName(repoRoot, displayName);
  return { profile, path };
}

async function ensureAvatarForDisplayName(repoRoot: string, displayName: string): Promise<void> {
  const slug = avatarNameSlug(displayName);
  const avatarId = avatarStorageId(displayName);
  await getOrGenerateAvatar(
    repoRoot,
    avatarId,
    { query: DEFAULT_PFP_QUERY },
    findLegacyAvatarIdsForSlug(repoRoot, slug)
  );
}

function resolveParticipantDisplayName(repoRoot: string, bodyDisplayName: string | undefined, profile: LocalUserProfile | null): string {
  if (bodyDisplayName?.trim()) {
    return bodyDisplayName.trim();
  }
  if (profile?.displayName) {
    return profile.displayName;
  }
  return process.env.USER?.trim() || 'local';
}

function branchForParticipant(sessionName: string, displayName: string): string {
  return `teambridge/${sessionName}/${safeDisplayName(displayName)}`;
}

function upsertProjectMember(
  repoRoot: string,
  projectId: string,
  displayName: string,
  status: Participant['status'] = 'active'
): ProjectMember {
  const dbPath = initializeStateDb(repoRoot);
  const now = new Date().toISOString();
  const existing = querySql<Record<string, unknown>>(
    dbPath,
    `select * from project_members where project_id = ${sqlValue(projectId)} and display_name = ${sqlValue(displayName)} limit 1`
  );
  if (existing.length > 0) {
    runSql(
      dbPath,
      `update project_members set status = ${sqlValue(status)}, last_seen_at = ${sqlValue(now)} where id = ${sqlValue(String(existing[0].id))}`
    );
    const [row] = querySql<Record<string, unknown>>(
      dbPath,
      `select * from project_members where id = ${sqlValue(String(existing[0].id))} limit 1`
    );
    return rowToProjectMember(row);
  }

  const memberId = `pm_${randomUUID()}`;
  runSql(dbPath, `
    insert into project_members (id, project_id, display_name, status, last_seen_at)
    values (
      ${sqlValue(memberId)},
      ${sqlValue(projectId)},
      ${sqlValue(displayName)},
      ${sqlValue(status)},
      ${sqlValue(now)}
    );
  `);
  const [row] = querySql<Record<string, unknown>>(
    dbPath,
    `select * from project_members where id = ${sqlValue(memberId)} limit 1`
  );
  return rowToProjectMember(row);
}

async function createProject(
  repoRoot: string,
  body: z.infer<typeof CreateProjectRequestSchema>
): Promise<CreateProjectResponse> {
  const dbPath = initializeStateDb(repoRoot);
  const name = body.name.trim();
  const description = body.description?.trim() ?? '';
  const duplicate = querySql<{ id: string }>(
    dbPath,
    `select id from projects where name = ${sqlValue(name)} limit 1`
  );
  if (duplicate.length > 0) {
    throw new Error(`Project name already exists: ${name}`);
  }

  const projectId = `proj_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  runSql(dbPath, `
    insert into projects (id, name, description, status, created_at)
    values (
      ${sqlValue(projectId)},
      ${sqlValue(name)},
      ${sqlValue(description)},
      'active',
      ${sqlValue(now)}
    );
  `);

  const project = getProjectById(repoRoot, projectId);
  if (!project) {
    throw new Error('Failed to create project');
  }

  let member: ProjectMember | undefined;
  if (body.addLocalUser !== false) {
    const profile = await readLocalUserProfile(repoRoot);
    if (profile) {
      member = upsertProjectMember(repoRoot, projectId, profile.displayName, 'active');
      await ensureAvatarForDisplayName(repoRoot, profile.displayName);
    }
  }

  return { project, member };
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
  const profile = await readLocalUserProfile(repoRoot);
  const displayName = resolveParticipantDisplayName(repoRoot, body.displayName, profile);
  const baseRef = body.baseRef?.trim() || 'HEAD';
  const baseCommit = resolveBaseCommit(repoRoot, baseRef);
  const now = new Date().toISOString();
  const workspaceId = `ws_${randomUUID()}`;
  const participantId = `user_${randomUUID()}`;
  const branch = branchForParticipant(sessionName, displayName);
  const repoRemote = getRepoRemote(repoRoot);
  const currentCommit = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const currentBranch = getCurrentBranch(repoRoot);

  const projectId = body.projectId?.trim() || profile?.defaultProjectId?.trim() || null;
  if (projectId) {
    const project = getProjectById(repoRoot, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
  }

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
    projectId
  };

  const participant: Participant = {
    id: participantId,
    displayName,
    workspaceId,
    branch,
    agent: body.agent ?? profile?.defaultAgent,
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

  if (projectId) {
    upsertProjectMember(repoRoot, projectId, displayName, 'active');
    await ensureAvatarForDisplayName(repoRoot, displayName);
  }

  await maybeMirrorWorkspaceToRelay(repoRoot, workspace, participant, profile);

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

function rememberRepoRoot(registryRoot: string, repoRoot: string): void {
  const resolved = resolve(repoRoot);
  const dbPath = initializeStateDb(registryRoot);
  runSql(dbPath, `
    insert into known_repos (repo_root, last_seen_at)
    values (${sqlValue(resolved)}, ${sqlValue(new Date().toISOString())})
    on conflict(repo_root) do update set last_seen_at = excluded.last_seen_at;
  `);
}

function listKnownRepos(registryRoot: string): Array<{ repoRoot: string; lastSeenAt: string; projects: Project[] }> {
  const dbPath = initializeStateDb(registryRoot);
  const rows = querySql<Record<string, unknown>>(
    dbPath,
    'select repo_root, last_seen_at from known_repos order by last_seen_at desc'
  );

  return rows
    .map((row) => {
      const repoRoot = String(row.repo_root);
      try {
        return {
          repoRoot,
          lastSeenAt: String(row.last_seen_at),
          projects: listProjects(repoRoot)
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { repoRoot: string; lastSeenAt: string; projects: Project[] } => Boolean(entry));
}

type RelayConfig = {
  supabaseUrl: string;
  restUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

type RemoteIdentity = {
  relayUrl: string;
  userId: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  updatedAt: string;
};

type RemoteWorkspaceRow = {
  id: string;
  project_id: string | null;
  session_name: string;
  repo_remote: string | null;
  repo_root_hash: string | null;
  base_ref: string;
  base_commit: string;
  scope_json: string[] | string;
  created_by_participant_id: string | null;
  created_by_user_id: string;
  status: 'active' | 'archived';
  relay_mode: 'supabase';
  created_at: string;
};

type RemoteParticipantRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  display_name: string;
  branch: string;
  agent?: Participant['agent'] | null;
  status: Participant['status'];
  last_seen_at: string;
  created_at?: string;
};

type RemoteEventRow = {
  id: string;
  workspace_id: string;
  seq: number;
  type: WorkspaceEvent['type'];
  actor_id: string;
  device_id: string;
  target_file?: string | null;
  payload: unknown;
  dedupe_key?: string | null;
  created_at: string;
};

type RemoteCheckpointRow = {
  id: string;
  workspace_id: string;
  seq: number;
  storage_path: string;
  hash: string;
  byte_size: number;
  created_by_device_id: string;
  created_at: string;
};

type CheckpointSnapshot = {
  schemaVersion: 1;
  workspaceId: string;
  seq: number;
  files: Record<string, string>;
  createdAt: string;
};

type RealtimeMessage = {
  event?: string;
  topic?: string;
  payload?: {
    status?: string;
    response?: unknown;
    data?: {
      record?: RemoteEventRow;
    };
  };
  ref?: string;
  join_ref?: string;
};

function relayConfig(): RelayConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const restUrl = (process.env.SUPABASE_REST_URL ?? (supabaseUrl ? `${supabaseUrl}/rest/v1` : '')).replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !restUrl || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, restUrl, anonKey, serviceRoleKey };
}

function requireRelayConfig(): RelayConfig {
  const config = relayConfig();
  if (!config) {
    throw new Error('Supabase relay env is missing. Set SUPABASE_URL, SUPABASE_REST_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return config;
}

async function supabaseRest<T>(
  config: RelayConfig,
  path: string,
  init: RequestInit = {},
  query?: Record<string, string>
): Promise<T> {
  const url = new URL(`${config.restUrl}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${path} failed (${response.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function supabaseRpc<T>(config: RelayConfig, name: string, body: unknown): Promise<T> {
  return supabaseRest<T>(config, `/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function storageObjectUrl(config: RelayConfig, bucket: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function uploadStorageObject(config: RelayConfig, bucket: string, path: string, body: Buffer, contentType: string): Promise<void> {
  const response = await fetch(storageObjectUrl(config, bucket, path), {
    method: 'PUT',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': contentType,
      'x-upsert': 'true'
    },
    body: body as unknown as BodyInit
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase storage upload failed (${response.status}): ${text}`);
  }
}

async function downloadStorageObject(config: RelayConfig, bucket: string, path: string): Promise<Buffer> {
  const response = await fetch(storageObjectUrl(config, bucket, path), {
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`
    }
  });
  const bytes = await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`Supabase storage download failed (${response.status}): ${Buffer.from(bytes).toString('utf8')}`);
  }
  return Buffer.from(bytes);
}

async function supabaseAuthPassword(
  config: RelayConfig,
  email: string,
  password: string
): Promise<{ access_token: string; refresh_token?: string; expires_at?: number; user: { id: string; email?: string } }> {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase login failed (${response.status}): ${text}`);
  }
  return JSON.parse(text);
}

function saveRemoteIdentity(repoRoot: string, identity: RemoteIdentity): void {
  const dbPath = initializeStateDb(repoRoot);
  runSql(dbPath, `
    insert into remote_identity (
      relay_url, user_id, email, access_token, refresh_token, expires_at, updated_at
    ) values (
      ${sqlValue(identity.relayUrl)},
      ${sqlValue(identity.userId)},
      ${sqlValue(identity.email ?? null)},
      ${sqlValue(identity.accessToken)},
      ${sqlValue(identity.refreshToken ?? null)},
      ${sqlValue(identity.expiresAt ?? null)},
      ${sqlValue(identity.updatedAt)}
    )
    on conflict(relay_url) do update set
      user_id = excluded.user_id,
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;
  `);
}

function getRemoteIdentity(repoRoot: string): RemoteIdentity | null {
  const config = relayConfig();
  if (!config) return null;
  const dbPath = initializeStateDb(repoRoot);
  const [row] = querySql<Record<string, unknown>>(
    dbPath,
    `select * from remote_identity where relay_url = ${sqlValue(config.supabaseUrl)} limit 1`
  );
  if (!row) return null;
  return {
    relayUrl: String(row.relay_url),
    userId: String(row.user_id),
    email: row.email ? String(row.email) : undefined,
    accessToken: String(row.access_token),
    refreshToken: row.refresh_token ? String(row.refresh_token) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    updatedAt: String(row.updated_at)
  };
}

function requireRemoteIdentity(repoRoot: string): RemoteIdentity {
  const identity = getRemoteIdentity(repoRoot);
  if (!identity) {
    throw new Error('Not logged in to Teambridge relay. Run `teambridge login` first.');
  }
  return identity;
}

function relayDeviceId(repoRoot: string, userId: string): string {
  return `dev_${getRepoRootHash(`${repoRoot}:${userId}:${hostname()}`).slice(0, 24)}`;
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

function rowToWorktree(row: Record<string, unknown>): WorktreeInfo {
  return {
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    path: String(row.path),
    branch: String(row.branch),
    baseCommit: String(row.base_commit),
    currentCommit: row.current_commit ? String(row.current_commit) : undefined,
    dirty: Number(row.dirty) === 1
  };
}

function listWorktrees(repoRoot: string, workspaceId: string): WorktreeInfo[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(
    dbPath,
    `select * from worktrees where workspace_id = ${sqlValue(workspaceId)} order by rowid asc`
  );
  return rows.map(rowToWorktree);
}

function registerWorktree(
  repoRoot: string,
  workspaceId: string,
  worktree: Omit<WorktreeInfo, 'workspaceId'>
): WorktreeInfo {
  const dbPath = initializeStateDb(repoRoot);
  const path = resolve(worktree.path);
  runSql(dbPath, `
    insert or replace into worktrees (
      workspace_id, user_id, path, branch, base_commit, current_commit, dirty
    ) values (
      ${sqlValue(workspaceId)},
      ${sqlValue(worktree.userId)},
      ${sqlValue(path)},
      ${sqlValue(worktree.branch)},
      ${sqlValue(worktree.baseCommit)},
      ${sqlValue(worktree.currentCommit ?? null)},
      ${worktree.dirty ? 1 : 0}
    );
  `);

  return {
    workspaceId,
    ...worktree,
    path
  };
}

function remoteEventToWorkspaceEvent(row: RemoteEventRow): WorkspaceEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seq: Number(row.seq),
    type: row.type,
    actorId: row.actor_id,
    deviceId: row.device_id,
    targetFile: row.target_file ?? undefined,
    payload: row.payload,
    dedupeKey: row.dedupe_key ?? undefined,
    createdAt: row.created_at
  };
}

function remoteWorkspaceToWorkspace(row: RemoteWorkspaceRow): Workspace {
  return {
    id: row.id,
    sessionName: row.session_name,
    repoRemote: row.repo_remote,
    repoRootHash: row.repo_root_hash ?? '',
    baseRef: row.base_ref,
    baseCommit: row.base_commit,
    scope: Array.isArray(row.scope_json) ? row.scope_json.map(String) : JSON.parse(String(row.scope_json ?? '[]')),
    createdBy: row.created_by_participant_id ?? '',
    createdAt: row.created_at,
    status: row.status === 'archived' ? 'archived' : 'active',
    relayMode: 'local',
    projectId: row.project_id
  };
}

async function upsertSupabaseRows<T>(config: RelayConfig, table: string, rows: unknown[], onConflict: string): Promise<T[]> {
  return supabaseRest<T[]>(config, table, {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(rows)
  }, { on_conflict: onConflict });
}

async function ensureRelayIdentity(repoRoot: string, profile?: LocalUserProfile | null): Promise<{ config: RelayConfig; identity: RemoteIdentity; deviceId: string }> {
  const config = requireRelayConfig();
  const identity = requireRemoteIdentity(repoRoot);
  const deviceId = relayDeviceId(repoRoot, identity.userId);
  const displayName = profile?.displayName ?? identity.email ?? identity.userId;

  await upsertSupabaseRows(config, 'tc_profiles', [{
    user_id: identity.userId,
    display_name: displayName,
    updated_at: new Date().toISOString()
  }], 'user_id');

  await upsertSupabaseRows(config, 'tc_devices', [{
    id: deviceId,
    user_id: identity.userId,
    hostname: hostname(),
    daemon_version: '0.0.0',
    last_seen_at: new Date().toISOString()
  }], 'id');

  return { config, identity, deviceId };
}

async function mirrorProjectToRelay(repoRoot: string, projectId: string | null, profile: LocalUserProfile | null | undefined): Promise<void> {
  if (!projectId) return;
  const project = getProjectById(repoRoot, projectId);
  if (!project) return;
  const { config, identity } = await ensureRelayIdentity(repoRoot, profile);
  await upsertSupabaseRows(config, 'tc_projects', [{
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    created_by: identity.userId,
    created_at: project.createdAt
  }], 'id');

  if (profile) {
    await upsertSupabaseRows(config, 'tc_project_members', [{
      project_id: project.id,
      user_id: identity.userId,
      display_name: profile.displayName,
      role: 'owner',
      status: 'active',
      last_seen_at: new Date().toISOString()
    }], 'project_id,user_id');
  }
}

async function mirrorWorkspaceToRelay(repoRoot: string, workspace: Workspace, participant: Participant, profile: LocalUserProfile | null | undefined): Promise<void> {
  const { config, identity } = await ensureRelayIdentity(repoRoot, profile);
  await mirrorProjectToRelay(repoRoot, workspace.projectId, profile);

  await upsertSupabaseRows(config, 'tc_workspaces', [{
    id: workspace.id,
    project_id: workspace.projectId,
    session_name: workspace.sessionName,
    repo_remote: workspace.repoRemote,
    repo_root_hash: workspace.repoRootHash,
    base_ref: workspace.baseRef,
    base_commit: workspace.baseCommit,
    scope_json: workspace.scope,
    created_by_participant_id: null,
    created_by_user_id: identity.userId,
    status: workspace.status,
    relay_mode: 'supabase',
    created_at: workspace.createdAt
  }], 'id');

  await upsertSupabaseRows(config, 'tc_participants', [{
    id: participant.id,
    workspace_id: workspace.id,
    user_id: identity.userId,
    display_name: participant.displayName,
    branch: participant.branch,
    agent: participant.agent ?? 'unknown',
    status: participant.status,
    last_seen_at: participant.lastSeenAt
  }], 'id');

  await supabaseRest(config, 'tc_workspaces', {
    method: 'PATCH',
    body: JSON.stringify({ created_by_participant_id: participant.id })
  }, { id: `eq.${workspace.id}` });
}

async function maybeMirrorWorkspaceToRelay(repoRoot: string, workspace: Workspace, participant: Participant, profile: LocalUserProfile | null | undefined): Promise<void> {
  if (!relayConfig() || !getRemoteIdentity(repoRoot)) return;
  try {
    await mirrorWorkspaceToRelay(repoRoot, workspace, participant, profile);
  } catch (error) {
    console.error(`[teambridge] relay mirror failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function syncRemoteParticipants(repoRoot: string, workspaceId: string): Promise<void> {
  const config = relayConfig();
  if (!config || !getRemoteIdentity(repoRoot)) return;
  const rows = await supabaseRest<RemoteParticipantRow[]>(config, 'tc_participants', {}, {
    workspace_id: `eq.${workspaceId}`,
    order: 'created_at.asc'
  });
  if (rows.length === 0) return;

  const dbPath = initializeStateDb(repoRoot);
  const statements = rows.map((participant) => `
    insert into participants (
      id, workspace_id, display_name, branch, agent, status, last_seen_at
    ) values (
      ${sqlValue(participant.id)},
      ${sqlValue(participant.workspace_id)},
      ${sqlValue(participant.display_name)},
      ${sqlValue(participant.branch)},
      ${sqlValue(participant.agent ?? null)},
      ${sqlValue(participant.status === 'offline' || participant.status === 'idle' ? participant.status : 'active')},
      ${sqlValue(participant.last_seen_at)}
    )
    on conflict(id) do update set
      display_name = excluded.display_name,
      branch = excluded.branch,
      agent = excluded.agent,
      status = excluded.status,
      last_seen_at = excluded.last_seen_at;
  `);
  runSql(dbPath, statements.join('\n'));
}

async function syncPresence(repoRoot: string): Promise<void> {
  const config = relayConfig();
  const identity = getRemoteIdentity(repoRoot);
  if (!config || !identity) return;

  const deviceId = relayDeviceId(repoRoot, identity.userId);
  const dbPath = initializeStateDb(repoRoot);
  const now = new Date().toISOString();
  const localParticipants = querySql<Record<string, unknown>>(
    dbPath,
    'select p.id, p.workspace_id, p.branch from participants p order by p.workspace_id asc'
  );

  for (const row of localParticipants) {
    await upsertSupabaseRows(config, 'tc_presence', [{
      workspace_id: String(row.workspace_id),
      participant_id: String(row.id),
      device_id: deviceId,
      status: 'active',
      current_branch: String(row.branch),
      current_worktree_path_hash: getRepoRootHash(repoRoot),
      last_seen_at: now
    }], 'workspace_id,participant_id,device_id').catch(() => undefined);
  }

  for (const workspace of listWorkspaces(repoRoot)) {
    await syncRemoteParticipants(repoRoot, workspace.id).catch(() => undefined);
    const presence = await supabaseRest<Array<{ participant_id: string; status: string; last_seen_at: string }>>(
      config,
      'tc_presence',
      {},
      { workspace_id: `eq.${workspace.id}` }
    ).catch(() => []);
    for (const entry of presence) {
      const seenAgoMs = Date.now() - Date.parse(entry.last_seen_at);
      const status = seenAgoMs > RELAY_PRESENCE_INTERVAL_MS * 3
        ? 'offline'
        : (entry.status === 'idle' || entry.status === 'offline' ? entry.status : 'active');
      runSql(dbPath, `
        update participants
        set status = ${sqlValue(status)},
            last_seen_at = ${sqlValue(entry.last_seen_at)}
        where id = ${sqlValue(entry.participant_id)}
          and workspace_id = ${sqlValue(workspace.id)};
      `);
    }
  }
}

function setRemoteSyncState(repoRoot: string, workspaceId: string, patch: { lastSeq?: number; status?: string; error?: string | null }): void {
  const dbPath = initializeStateDb(repoRoot);
  const existing = querySql<{ last_remote_seq?: number }>(
    dbPath,
    `select last_remote_seq from remote_sync_state where workspace_id = ${sqlValue(workspaceId)} limit 1`
  )[0];
  const lastSeq = patch.lastSeq ?? Number(existing?.last_remote_seq ?? 0);
  runSql(dbPath, `
    insert into remote_sync_state (workspace_id, last_remote_seq, last_synced_at, relay_status, last_error)
    values (
      ${sqlValue(workspaceId)},
      ${lastSeq},
      ${sqlValue(new Date().toISOString())},
      ${sqlValue(patch.status ?? 'online')},
      ${sqlValue(patch.error ?? null)}
    )
    on conflict(workspace_id) do update set
      last_remote_seq = excluded.last_remote_seq,
      last_synced_at = excluded.last_synced_at,
      relay_status = excluded.relay_status,
      last_error = excluded.last_error;
  `);
}

function queuePendingRemoteEvent(repoRoot: string, event: WorkspaceEvent): void {
  const dbPath = initializeStateDb(repoRoot);
  runSql(dbPath, `
    insert or ignore into pending_remote_events (
      local_id, workspace_id, actor_id, device_id, type, target_file,
      payload_json, dedupe_key, created_at
    ) values (
      ${sqlValue(event.id)},
      ${sqlValue(event.workspaceId)},
      ${sqlValue(event.actorId)},
      ${sqlValue(event.deviceId)},
      ${sqlValue(event.type)},
      ${sqlValue(event.targetFile ?? null)},
      ${sqlValue(JSON.stringify(event.payload))},
      ${sqlValue(event.dedupeKey ?? event.id)},
      ${sqlValue(event.createdAt)}
    );
  `);
}

async function rebuildWorkspaceFromEvents(repoRoot: string, workspace: Workspace): Promise<number> {
  const { eventsPath, vaultDir } = getWorkspacePaths(repoRoot, workspace);
  const result = await rebuildPhaseOneVault(vaultDir, eventsPath);
  const dbPath = initializeStateDb(repoRoot);
  runSql(dbPath, `
    insert into local_sequences (workspace_id, last_seq)
    values (${sqlValue(workspace.id)}, ${result.lastSeq})
    on conflict(workspace_id) do update set last_seq = excluded.last_seq;
  `);
  for (const file of PHASE_ONE_VAULT_FILES) {
    const content = await readFile(join(vaultDir, file), 'utf8').catch(() => '');
    reindexVaultFile(dbPath, workspace.id, file, content, result.lastSeq);
  }
  return result.lastSeq;
}

async function applyCanonicalRemoteEvent(repoRoot: string, workspace: Workspace, event: WorkspaceEvent): Promise<void> {
  const paths = getWorkspacePaths(repoRoot, workspace);
  const events = await readEventsJsonl(paths.eventsPath).catch(() => []);
  const byId = new Map(events.map((entry) => [entry.id, entry]));
  byId.set(event.id, event);
  const canonical = [...byId.values()].sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
  await writeFile(paths.eventsPath, canonical.map((entry) => JSON.stringify(entry)).join('\n') + (canonical.length ? '\n' : ''));
  await rebuildWorkspaceFromEvents(repoRoot, workspace);
  setRemoteSyncState(repoRoot, workspace.id, { lastSeq: Math.max(...canonical.map((entry) => entry.seq), event.seq), status: 'online' });
}

async function appendRemoteEvent(repoRoot: string, workspace: Workspace, event: WorkspaceEvent): Promise<WorkspaceEvent> {
  const config = requireRelayConfig();
  requireRemoteIdentity(repoRoot);
  const rows = await supabaseRpc<RemoteEventRow[] | RemoteEventRow>(config, 'tc_append_event', {
    p_event_id: event.id,
    p_workspace_id: workspace.id,
    p_type: event.type,
    p_actor_id: event.actorId,
    p_device_id: event.deviceId,
    p_target_file: event.targetFile ?? null,
    p_payload: event.payload,
    p_dedupe_key: event.dedupeKey ?? event.id
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return remoteEventToWorkspaceEvent(row);
}

async function pushPendingRemoteEvents(repoRoot: string): Promise<number> {
  const config = relayConfig();
  if (!config || !getRemoteIdentity(repoRoot)) return 0;
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(dbPath, 'select * from pending_remote_events order by created_at asc');
  let pushed = 0;
  for (const row of rows) {
    const workspace = getWorkspaceByIdentifier(repoRoot, String(row.workspace_id));
    if (!workspace) continue;
    try {
      const event: WorkspaceEvent = {
        id: String(row.local_id),
        workspaceId: String(row.workspace_id),
        seq: getLastSeq(repoRoot, String(row.workspace_id)) + 1,
        type: String(row.type) as WorkspaceEvent['type'],
        actorId: String(row.actor_id),
        deviceId: String(row.device_id),
        targetFile: row.target_file ? String(row.target_file) : undefined,
        payload: JSON.parse(String(row.payload_json)),
        dedupeKey: String(row.dedupe_key),
        createdAt: String(row.created_at)
      };
      const remote = await appendRemoteEvent(repoRoot, workspace, event);
      await applyCanonicalRemoteEvent(repoRoot, workspace, remote);
      runSql(dbPath, `delete from pending_remote_events where local_id = ${sqlValue(event.id)};`);
      pushed += 1;
    } catch (error) {
      runSql(dbPath, `
        update pending_remote_events
        set retry_count = retry_count + 1,
            last_error = ${sqlValue(error instanceof Error ? error.message : String(error))}
        where local_id = ${sqlValue(String(row.local_id))};
      `);
      setRemoteSyncState(repoRoot, String(row.workspace_id), { status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return pushed;
}

async function pullRemoteEvents(repoRoot: string): Promise<number> {
  const config = relayConfig();
  if (!config || !getRemoteIdentity(repoRoot)) return 0;
  const dbPath = initializeStateDb(repoRoot);
  let pulled = 0;
  for (const workspace of listWorkspaces(repoRoot)) {
    await syncRemoteParticipants(repoRoot, workspace.id).catch(() => undefined);
    const [state] = querySql<{ last_remote_seq?: number }>(
      dbPath,
      `select last_remote_seq from remote_sync_state where workspace_id = ${sqlValue(workspace.id)} limit 1`
    );
    const lastSeq = Number(state?.last_remote_seq ?? 0);
    try {
      const rows = await supabaseRest<RemoteEventRow[]>(config, 'tc_workspace_events', {}, {
        workspace_id: `eq.${workspace.id}`,
        seq: `gt.${lastSeq}`,
        order: 'seq.asc'
      });
      for (const row of rows) {
        await applyCanonicalRemoteEvent(repoRoot, workspace, remoteEventToWorkspaceEvent(row));
        pulled += 1;
      }
      if (rows.length === 0) {
        setRemoteSyncState(repoRoot, workspace.id, { lastSeq, status: 'online' });
      }
    } catch (error) {
      setRemoteSyncState(repoRoot, workspace.id, { status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return pulled;
}

async function syncRelay(repoRoot: string): Promise<{ pushed: number; pulled: number }> {
  const pushed = await pushPendingRemoteEvents(repoRoot);
  const pulled = await pullRemoteEvents(repoRoot);
  for (const workspace of listWorkspaces(repoRoot)) {
    await maybeCreateRemoteCheckpoint(repoRoot, workspace).catch((error) => {
      setRemoteSyncState(repoRoot, workspace.id, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
  return { pushed, pulled };
}

function realtimeMessageFromRaw(raw: unknown): RealtimeMessage | null {
  if (Array.isArray(raw)) {
    const [joinRef, ref, topic, event, payload] = raw;
    return {
      join_ref: joinRef === null ? undefined : String(joinRef),
      ref: ref === null ? undefined : String(ref),
      topic: topic === null ? undefined : String(topic),
      event: event === null ? undefined : String(event),
      payload: payload as RealtimeMessage['payload']
    };
  }
  if (raw && typeof raw === 'object') {
    return raw as RealtimeMessage;
  }
  return null;
}

async function applyRealtimeEventToKnownRepos(state: AppState, row: RemoteEventRow): Promise<void> {
  const repos = [state.defaultRepoRoot, ...listKnownRepos(state.defaultRepoRoot).map((repo) => repo.repoRoot)];
  for (const repoRoot of [...new Set(repos)]) {
    if (!getRemoteIdentity(repoRoot)) continue;
    const workspace = getWorkspaceByIdentifier(repoRoot, row.workspace_id);
    if (!workspace) continue;
    await syncRemoteParticipants(repoRoot, workspace.id).catch(() => undefined);
    await applyCanonicalRemoteEvent(repoRoot, workspace, remoteEventToWorkspaceEvent(row));
  }
}

function startRealtimeEventSubscriber(state: AppState): void {
  const config = relayConfig();
  if (!config || typeof WebSocket === 'undefined') return;

  let socket: WebSocket | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let reconnect: NodeJS.Timeout | undefined;
  let ref = 1;
  const topic = 'realtime:teambridge-events';

  const nextRef = () => String(ref++);
  const send = (event: string, payload: unknown, joinRef?: string, messageTopic = topic) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify([joinRef ?? null, nextRef(), messageTopic, event, payload]));
  };

  const connect = () => {
    const wsUrl = `${config.supabaseUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(config.serviceRoleKey)}&vsn=2.0.0`;
    socket = new WebSocket(wsUrl);
    const joinRef = nextRef();

    socket.addEventListener('open', () => {
      send('phx_join', {
        config: {
          broadcast: { self: false, ack: false },
          presence: { enabled: false },
          postgres_changes: [
            { event: 'INSERT', schema: 'public', table: 'tc_workspace_events' }
          ],
          private: false
        },
        access_token: config.serviceRoleKey
      }, joinRef);
      heartbeat = setInterval(() => {
        send('heartbeat', {}, undefined, 'phoenix');
      }, 25000);
    });

    socket.addEventListener('message', (event) => {
      void (async () => {
        const parsed = realtimeMessageFromRaw(JSON.parse(String(event.data)));
        if (!parsed) return;
        if (parsed.event === 'postgres_changes') {
          const record = parsed.payload?.data?.record;
          if (record) {
            await applyRealtimeEventToKnownRepos(state, record);
          }
        } else if (parsed.event === 'system' && parsed.payload?.status === 'error') {
          console.error(`[teambridge] realtime system error: ${JSON.stringify(parsed.payload)}`);
        } else if (parsed.event === 'phx_reply' && parsed.payload?.status === 'error') {
          console.error(`[teambridge] realtime join error: ${JSON.stringify(parsed.payload)}`);
        }
      })().catch((error) => {
        console.error(`[teambridge] realtime event apply failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    });

    const scheduleReconnect = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (reconnect) return;
      reconnect = setTimeout(() => {
        reconnect = undefined;
        connect();
      }, 5000);
    };

    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', scheduleReconnect);
  };

  connect();
}

function startRelayPolling(state: AppState): void {
  if (!relayConfig()) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const repos = [state.defaultRepoRoot, ...listKnownRepos(state.defaultRepoRoot).map((repo) => repo.repoRoot)];
      for (const repoRoot of [...new Set(repos)]) {
        if (getRemoteIdentity(repoRoot)) {
          await syncPresence(repoRoot);
          await syncRelay(repoRoot);
        }
      }
    } catch (error) {
      console.error(`[teambridge] relay poll failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };
  setInterval(() => { void tick(); }, RELAY_SYNC_INTERVAL_MS);
  void tick();
}

async function listRelaySessions(repoRoot: string): Promise<Workspace[]> {
  const config = requireRelayConfig();
  requireRemoteIdentity(repoRoot);
  const remote = getRepoRemote(repoRoot);
  const query: Record<string, string> = {
    order: 'created_at.desc'
  };
  if (remote) {
    query.repo_remote = `eq.${remote}`;
  } else {
    query.repo_root_hash = `eq.${getRepoRootHash(repoRoot)}`;
  }
  const rows = await supabaseRest<RemoteWorkspaceRow[]>(config, 'tc_workspaces', {}, query);
  return rows.map(remoteWorkspaceToWorkspace);
}

async function importRelayWorkspace(repoRoot: string, sessionName: string): Promise<Workspace | undefined> {
  if (!relayConfig() || !getRemoteIdentity(repoRoot)) return undefined;
  const remote = (await listRelaySessions(repoRoot)).find((workspace) => workspace.sessionName === sessionName);
  if (!remote) return undefined;

  const dbPath = initializeStateDb(repoRoot);
  const workspace: Workspace = {
    ...remote,
    projectId: null,
    createdBy: remote.createdBy || 'remote',
    relayMode: 'local'
  };
  const workspaceDir = getWorkspaceDir(repoRoot, workspace.sessionName);
  const vaultDir = join(workspaceDir, 'vault');
  await mkdir(workspaceDir, { recursive: true });
  await initializePhaseOneVault(vaultDir);
  await writeFile(join(workspaceDir, 'events.jsonl'), '', { flag: 'a' });

  runSql(dbPath, `
    insert or ignore into tracks (
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
      'local',
      null
    );

    insert or ignore into local_sequences (workspace_id, last_seq)
    values (${sqlValue(workspace.id)}, 0);
  `);

  await syncRemoteParticipants(repoRoot, workspace.id).catch(() => undefined);
  await writeWorkspaceManifest(repoRoot, workspace);
  const latestCheckpoint = await getLatestRemoteCheckpoint(repoRoot, workspace.id).catch(() => undefined);
  if (latestCheckpoint) {
    await materializeCheckpointSnapshot(repoRoot, workspace, latestCheckpoint);
  }
  await pullRemoteEvents(repoRoot);
  return getWorkspaceByIdentifier(repoRoot, workspace.id) ?? workspace;
}

function findLegacyAvatarIdsForSlug(repoRoot: string, slug: string): string[] {
  const dbPath = initializeStateDb(repoRoot);
  const rows = querySql<Record<string, unknown>>(dbPath, 'select id, display_name from participants');
  const ids: string[] = [];
  for (const row of rows) {
    if (avatarNameSlug(String(row.display_name)) === slug) {
      ids.push(String(row.id));
    }
  }
  return ids;
}

function avatarOptionsFromParams(params: URLSearchParams): PfpOptions {
  return {
    query: params.get('query') ?? undefined,
    size: params.get('size') ? Number(params.get('size')) : undefined,
    algorithm: (params.get('algorithm') as DitherAlgorithm | null) ?? undefined,
    bayerLevel: params.get('bayerLevel') ? Number(params.get('bayerLevel')) : undefined
  };
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

async function getLatestRemoteCheckpoint(repoRoot: string, workspaceId: string): Promise<VaultCheckpoint | undefined> {
  const config = relayConfig();
  if (!config || !getRemoteIdentity(repoRoot)) return undefined;
  const rows = await supabaseRest<RemoteCheckpointRow[]>(config, 'tc_workspace_vault_checkpoints', {}, {
    workspace_id: `eq.${workspaceId}`,
    order: 'seq.desc',
    limit: '1'
  });
  return rows[0] ? remoteCheckpointToVaultCheckpoint(rows[0]) : undefined;
}

async function acquireCheckpointLease(repoRoot: string, workspaceId: string, deviceId: string): Promise<boolean> {
  const config = requireRelayConfig();
  requireRemoteIdentity(repoRoot);
  const now = Date.now();
  const leaseExpiresAt = new Date(now + CHECKPOINT_LEASE_MS).toISOString();

  const existing = await supabaseRest<Array<{ workspace_id: string; leader_device_id: string; lease_expires_at: string }>>(
    config,
    'tc_checkpoint_leases',
    {},
    { workspace_id: `eq.${workspaceId}`, limit: '1' }
  );

  if (existing.length === 0) {
    try {
      await upsertSupabaseRows(config, 'tc_checkpoint_leases', [{
        workspace_id: workspaceId,
        leader_device_id: deviceId,
        lease_expires_at: leaseExpiresAt,
        updated_at: new Date().toISOString()
      }], 'workspace_id');
      return true;
    } catch {
      return false;
    }
  }

  const current = existing[0];
  if (current.leader_device_id !== deviceId && Date.parse(current.lease_expires_at) > now) {
    return false;
  }

  await supabaseRest(config, 'tc_checkpoint_leases', {
    method: 'PATCH',
    body: JSON.stringify({
      leader_device_id: deviceId,
      lease_expires_at: leaseExpiresAt,
      updated_at: new Date().toISOString()
    })
  }, { workspace_id: `eq.${workspaceId}` });
  return true;
}

async function releaseCheckpointLease(repoRoot: string, workspaceId: string, deviceId: string): Promise<void> {
  const config = relayConfig();
  if (!config || !getRemoteIdentity(repoRoot)) return;
  await supabaseRest(config, 'tc_checkpoint_leases', {
    method: 'DELETE'
  }, {
    workspace_id: `eq.${workspaceId}`,
    leader_device_id: `eq.${deviceId}`
  }).catch(() => undefined);
}

async function createRemoteCheckpoint(repoRoot: string, workspace: Workspace): Promise<VaultCheckpoint> {
  const profile = await readLocalUserProfile(repoRoot);
  const { config, deviceId } = await ensureRelayIdentity(repoRoot, profile);
  const leaseAcquired = await acquireCheckpointLease(repoRoot, workspace.id, deviceId);
  if (!leaseAcquired) {
    throw new Error(`Checkpoint lease is held by another device for workspace ${workspace.id}`);
  }

  try {
    const seq = getLastSeq(repoRoot, workspace.id);
    if (seq <= 0) {
      throw new Error('Cannot create a checkpoint before any canonical events exist.');
    }

    const { vaultDir } = getWorkspacePaths(repoRoot, workspace);
    const files: Record<string, string> = {};
    for (const file of PHASE_ONE_VAULT_FILES) {
      files[file] = await readFile(join(vaultDir, file), 'utf8').catch(() => '');
    }

    const snapshot: CheckpointSnapshot = {
      schemaVersion: 1,
      workspaceId: workspace.id,
      seq,
      files,
      createdAt: new Date().toISOString()
    };
    const json = JSON.stringify(snapshot);
    const compressed = gzipSync(Buffer.from(json, 'utf8'));
    const hash = createHash('sha256').update(json).digest('hex');
    const checkpointId = `chk_${randomUUID()}`;
    const storagePath = `${workspace.id}/vault-${seq}-${checkpointId}.json.gz`;

    await uploadStorageObject(config, CHECKPOINT_BUCKET, storagePath, compressed, 'application/gzip');
    const rows = await upsertSupabaseRows<RemoteCheckpointRow>(config, 'tc_workspace_vault_checkpoints', [{
      id: checkpointId,
      workspace_id: workspace.id,
      seq,
      storage_path: storagePath,
      hash,
      byte_size: compressed.byteLength,
      created_by_device_id: deviceId
    }], 'workspace_id,seq');
    return remoteCheckpointToVaultCheckpoint(rows[0]);
  } finally {
    await releaseCheckpointLease(repoRoot, workspace.id, deviceId);
  }
}

async function downloadCheckpointSnapshot(repoRoot: string, checkpoint: VaultCheckpoint): Promise<CheckpointSnapshot> {
  const config = requireRelayConfig();
  requireRemoteIdentity(repoRoot);
  const compressed = await downloadStorageObject(config, CHECKPOINT_BUCKET, checkpoint.storagePath);
  const json = gunzipSync(compressed).toString('utf8');
  const hash = createHash('sha256').update(json).digest('hex');
  if (hash !== checkpoint.hash) {
    throw new Error(`Checkpoint hash mismatch for ${checkpoint.id}`);
  }
  return JSON.parse(json) as CheckpointSnapshot;
}

async function materializeCheckpointSnapshot(repoRoot: string, workspace: Workspace, checkpoint: VaultCheckpoint): Promise<void> {
  const snapshot = await downloadCheckpointSnapshot(repoRoot, checkpoint);
  if (snapshot.workspaceId !== workspace.id) {
    throw new Error(`Checkpoint ${checkpoint.id} belongs to ${snapshot.workspaceId}, not ${workspace.id}`);
  }

  const { vaultDir } = getWorkspacePaths(repoRoot, workspace);
  await initializePhaseOneVault(vaultDir);
  const dbPath = initializeStateDb(repoRoot);
  for (const file of PHASE_ONE_VAULT_FILES) {
    const content = snapshot.files[file] ?? '';
    await writeFile(join(vaultDir, file), content);
    reindexVaultFile(dbPath, workspace.id, file, content, checkpoint.seq);
  }

  runSql(dbPath, `
    insert into local_sequences (workspace_id, last_seq)
    values (${sqlValue(workspace.id)}, ${checkpoint.seq})
    on conflict(workspace_id) do update set last_seq = excluded.last_seq;
  `);
  setRemoteSyncState(repoRoot, workspace.id, { lastSeq: checkpoint.seq, status: 'online' });
}

async function maybeCreateRemoteCheckpoint(repoRoot: string, workspace: Workspace): Promise<VaultCheckpoint | undefined> {
  const lastSeq = getLastSeq(repoRoot, workspace.id);
  if (lastSeq <= 0) return undefined;
  const latest = await getLatestRemoteCheckpoint(repoRoot, workspace.id).catch(() => undefined);
  if (latest && latest.seq >= lastSeq) return latest;
  if (latest && lastSeq - latest.seq < CHECKPOINT_INTERVAL_EVENTS) return latest;
  return createRemoteCheckpoint(repoRoot, workspace);
}

async function joinWorkspace(state: AppState, body: JoinRequestBody): Promise<JoinWorkspaceResponse> {
  if (!body.sessionName?.trim()) {
    throw new Error('sessionName is required');
  }

  const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
  await ensureTeambridgeDirs(repoRoot);

  let workspace = getWorkspaceByIdentifier(repoRoot, body.sessionName.trim());
  if (!workspace) {
    workspace = await importRelayWorkspace(repoRoot, body.sessionName.trim());
  }
  if (!workspace) {
    throw new Error(`Workspace not found: ${body.sessionName}`);
  }

  const dbPath = initializeStateDb(repoRoot);
  const now = new Date().toISOString();
  const profile = await readLocalUserProfile(repoRoot);
  const displayName = resolveParticipantDisplayName(repoRoot, body.displayName, profile);
  const participantId = `user_${randomUUID()}`;
  const branch = branchForParticipant(workspace.sessionName, displayName);
  const participant: Participant = {
    id: participantId,
    workspaceId: workspace.id,
    displayName,
    branch,
    agent: body.agent ?? profile?.defaultAgent,
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

  if (workspace.projectId) {
    upsertProjectMember(repoRoot, workspace.projectId, displayName, 'active');
    await ensureAvatarForDisplayName(repoRoot, displayName);
  }

  await maybeMirrorWorkspaceToRelay(repoRoot, workspace, participant, profile);

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
  const identity = getRemoteIdentity(repoRoot);
  const deviceId = identity ? relayDeviceId(repoRoot, identity.userId) : undefined;
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
    deviceId: body.deviceId ?? deviceId ?? 'device_local',
    targetFile: body.targetFile,
    payload,
    dedupeKey: body.dedupeKey ?? `${workspace.id}:${deviceId ?? 'device_local'}:${randomUUID()}`,
    createdAt: new Date().toISOString()
  };

  if (relayConfig() && identity) {
    try {
      const remoteEvent = await appendRemoteEvent(repoRoot, workspace, event);
      await applyCanonicalRemoteEvent(repoRoot, workspace, remoteEvent);
      return remoteEvent as WorkspaceEvent<PublishEventPayload>;
    } catch (error) {
      queuePendingRemoteEvent(repoRoot, event);
      setRemoteSyncState(repoRoot, workspace.id, {
        status: 'queued',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const { eventsPath, vaultDir } = getWorkspacePaths(repoRoot, workspace);
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`);
  await materializePublishEvent(vaultDir, event);

  const updatedContent = await readFile(join(vaultDir, body.targetFile), 'utf8').catch(() => '');
  reindexVaultFile(dbPath, workspace.id, body.targetFile, updatedContent, seq);

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

  if (method === 'POST' && url.pathname === '/auth/login') {
    const body = AuthLoginBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const config = requireRelayConfig();
    const result = await supabaseAuthPassword(config, body.email, body.password);
    const identity: RemoteIdentity = {
      relayUrl: config.supabaseUrl,
      userId: result.user.id,
      email: result.user.email ?? body.email,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: result.expires_at ? new Date(result.expires_at * 1000).toISOString() : undefined,
      updatedAt: new Date().toISOString()
    };
    saveRemoteIdentity(repoRoot, identity);
    const profile = await readLocalUserProfile(repoRoot);
    await ensureRelayIdentity(repoRoot, profile);
    sendJson(response, 200, ok({ userId: identity.userId, email: identity.email, relayUrl: identity.relayUrl }));
    return;
  }

  if (method === 'GET' && url.pathname === '/auth/status') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const identity = getRemoteIdentity(repoRoot);
    sendJson(response, 200, ok({
      loggedIn: Boolean(identity),
      userId: identity?.userId,
      email: identity?.email,
      relayUrl: identity?.relayUrl
    }));
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/logout') {
    const body = RelayRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const config = relayConfig();
    if (config) {
      const dbPath = initializeStateDb(repoRoot);
      runSql(dbPath, `delete from remote_identity where relay_url = ${sqlValue(config.supabaseUrl)};`);
    }
    sendJson(response, 200, ok({ loggedOut: true }));
    return;
  }

  if (method === 'GET' && url.pathname === '/relay/sessions') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const sessions = await listRelaySessions(repoRoot);
    sendJson(response, 200, ok({ sessions }));
    return;
  }

  if (method === 'GET' && url.pathname === '/relay/status') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const dbPath = initializeStateDb(repoRoot);
    const identity = getRemoteIdentity(repoRoot);
    const pending = querySql<{ count: number }>(dbPath, 'select count(*) as count from pending_remote_events')[0]?.count ?? 0;
    const sync = querySql<Record<string, unknown>>(dbPath, 'select * from remote_sync_state order by last_synced_at desc').map(rowToSyncState);
    sendJson(response, 200, ok({ configured: Boolean(relayConfig()), loggedIn: Boolean(identity), pending, sync }));
    return;
  }

  if (method === 'POST' && url.pathname === '/relay/sync') {
    const body = RelayRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const result = await syncRelay(repoRoot);
    sendJson(response, 200, ok(result));
    return;
  }

  if (method === 'GET' && url.pathname === '/repos') {
    sendJson(response, 200, ok({ repos: listKnownRepos(state.defaultRepoRoot) }));
    return;
  }

  if (method === 'POST' && url.pathname === '/repos/register') {
    const body = ConfigRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    sendJson(response, 200, ok({ repoRoot }));
    return;
  }

  if (method === 'GET' && url.pathname === '/config') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const config = await readRepoConfig(repoRoot);
    sendJson(response, 200, ok({ config, path: getConfigPath(repoRoot), exists: config !== DEFAULT_CONFIG }));
    return;
  }

  if (method === 'POST' && url.pathname === '/config/init') {
    const body = ConfigRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const result = await initRepoConfig(repoRoot);
    sendJson(response, result.created ? 201 : 200, ok(result));
    return;
  }

  if (method === 'GET' && url.pathname === '/workspaces') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    sendJson<WorkspaceListResponse>(response, 200, ok({ workspaces: listWorkspaces(repoRoot) }));
    return;
  }

  if (method === 'GET' && url.pathname === '/tracks') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    sendJson<TrackListResponse>(response, 200, ok({ tracks: listWorkspaces(repoRoot) }));
    return;
  }

  if (method === 'GET' && url.pathname === '/projects') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    sendJson<ProjectListResponse>(response, 200, ok({ projects: listProjects(repoRoot) }));
    return;
  }

  if (method === 'POST' && url.pathname === '/projects') {
    try {
      const body = CreateProjectBodySchema.parse(await readJsonBody<unknown>(request));
      const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
      rememberRepoRoot(state.defaultRepoRoot, repoRoot);
      const result = await createProject(repoRoot, body);
      sendJson<CreateProjectResponse>(response, 201, ok(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      const status = message.includes('already exists') ? 409 : 400;
      sendJson(response, status, fail(status === 409 ? 'CONFLICT' : 'INVALID_REQUEST', message));
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/user/profile') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const profile = await readLocalUserProfile(repoRoot);
    const avatarVersion = profile
      ? await getAvatarVersionForDisplayName(repoRoot, profile.displayName)
      : undefined;
    sendJson<LocalUserProfileResponse>(response, 200, ok({ profile, path: getUserProfilePath(repoRoot), avatarVersion }));
    return;
  }

  if (method === 'GET' && url.pathname === '/repo/context') {
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined;
    let resolvedWorkspaceId = workspaceId;
    if (workspaceId && !getWorkspaceByIdentifier(repoRoot, workspaceId)) {
      resolvedWorkspaceId = undefined;
    }
    sendJson<RepoContextResponse>(response, 200, ok({ context: buildRepoContext(repoRoot, resolvedWorkspaceId) }));
    return;
  }

  if (method === 'POST' && url.pathname === '/repo/open-path') {
    try {
      const body = OpenPathBodySchema.parse(await readJsonBody<unknown>(request));
      const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
      const target = resolve(body.path);
      const rel = relative(resolve(repoRoot), target);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        sendJson(response, 400, fail('INVALID_REQUEST', 'Path must be inside the repository'));
        return;
      }
      openPathOnDevice(target);
      sendJson(response, 200, ok({ opened: target }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open path';
      sendJson(response, 400, fail('INVALID_REQUEST', message));
    }
    return;
  }

  if (method === 'POST' && url.pathname === '/user/profile') {
    try {
      const body = SaveLocalUserBodySchema.parse(await readJsonBody<unknown>(request));
      const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
      rememberRepoRoot(state.defaultRepoRoot, repoRoot);
      await initRepoConfig(repoRoot);
      const result = await saveLocalUserProfile(repoRoot, body);
      sendJson(response, 200, ok(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save user profile';
      sendJson(response, 400, fail('INVALID_REQUEST', message));
    }
    return;
  }

  const avatarByNameMatch = url.pathname.match(/^\/avatars\/by-name\/([^/]+)$/);
  if (method === 'GET' && avatarByNameMatch) {
    const slug = decodeURIComponent(avatarByNameMatch[1]);
    if (!slug || !/^[\w-]+$/.test(slug)) {
      sendJson(response, 400, fail('INVALID_REQUEST', `Invalid avatar slug ${slug}`));
      return;
    }
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const avatarId = `name_${slug}`;
    const legacyIds = findLegacyAvatarIdsForSlug(repoRoot, slug);
    const avatarParams = avatarOptionsFromParams(url.searchParams);
    const { png } = await getOrGenerateAvatar(
      repoRoot,
      avatarId,
      { ...avatarParams, query: avatarParams.query ?? DEFAULT_PFP_QUERY },
      legacyIds
    );
    sendAvatarPng(response, request, png);
    return;
  }

  const projectMembersMatch = url.pathname.match(/^\/projects\/([^/]+)\/members$/);
  if (method === 'GET' && projectMembersMatch) {
    const projectId = decodeURIComponent(projectMembersMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const project = getProjectById(repoRoot, projectId);
    if (!project) {
      sendJson(response, 404, fail('PROJECT_NOT_FOUND', `Project ${projectId} was not found`));
      return;
    }
    const profile = await readLocalUserProfile(repoRoot);
    const localAvatarVersion = profile
      ? await getAvatarVersionForDisplayName(repoRoot, profile.displayName)
      : undefined;
    sendJson<ProjectMemberListResponse>(response, 200, ok({
      members: listProjectMembers(repoRoot, projectId),
      localUser: profile,
      localAvatarVersion
    }));
    return;
  }

  if (method === 'POST' && projectMembersMatch) {
    try {
      const projectId = decodeURIComponent(projectMembersMatch[1]);
      const body = UpsertProjectMemberBodySchema.parse(await readJsonBody<unknown>(request));
      const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
      rememberRepoRoot(state.defaultRepoRoot, repoRoot);
      const project = getProjectById(repoRoot, projectId);
      if (!project) {
        sendJson(response, 404, fail('PROJECT_NOT_FOUND', `Project ${projectId} was not found`));
        return;
      }
      const member = upsertProjectMember(repoRoot, projectId, body.displayName.trim(), body.status ?? 'active');
      await ensureAvatarForDisplayName(repoRoot, member.displayName);
      sendJson<UpsertProjectMemberResponse>(response, 201, ok({ member }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upsert project member';
      sendJson(response, 400, fail('INVALID_REQUEST', message));
    }
    return;
  }

  const projectMemberAvatarMatch = url.pathname.match(/^\/projects\/([^/]+)\/members\/([^/]+)\/avatar$/);
  if (method === 'GET' && projectMemberAvatarMatch) {
    const projectId = decodeURIComponent(projectMemberAvatarMatch[1]);
    const memberId = decodeURIComponent(projectMemberAvatarMatch[2]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const project = getProjectById(repoRoot, projectId);
    if (!project) {
      sendJson(response, 404, fail('PROJECT_NOT_FOUND', `Project ${projectId} was not found`));
      return;
    }
    const members = listProjectMembers(repoRoot, projectId);
    const member = members.find((entry) => entry.id === memberId);
    if (!member) {
      sendJson(response, 404, fail('NOT_FOUND', `Project member ${memberId} was not found`));
      return;
    }
    const avatarId = avatarStorageId(member.displayName);
    const slug = avatarNameSlug(member.displayName);
    const legacyIds = findLegacyAvatarIdsForSlug(repoRoot, slug);
    const avatarParams = avatarOptionsFromParams(url.searchParams);
    const { png } = await getOrGenerateAvatar(
      repoRoot,
      avatarId,
      { ...avatarParams, query: avatarParams.query ?? DEFAULT_PFP_QUERY },
      legacyIds
    );
    sendAvatarPng(response, request, png);
    return;
  }

  const projectTracksMatch = url.pathname.match(/^\/projects\/([^/]+)\/tracks$/);
  if (method === 'GET' && projectTracksMatch) {
    const projectId = decodeURIComponent(projectTracksMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
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
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const result = await startWorkspace(state, body);
    sendJson(response, 201, ok(result));
    return;
  }

  if (method === 'POST' && url.pathname === '/workspaces/join') {
    const body = JoinRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const result = await joinWorkspace(state, body);
    sendJson(response, 201, ok(result));
    return;
  }

  const eventListMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/events$/);
  if (method === 'GET' && eventListMatch) {
    const workspaceIdentifier = decodeURIComponent(eventListMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    rememberRepoRoot(state.defaultRepoRoot, repoRoot);
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    await pullRemoteEvents(repoRoot).catch(() => undefined);
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

  const vaultSearchMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/vault\/search$/);
  if (method === 'GET' && vaultSearchMatch) {
    const workspaceIdentifier = decodeURIComponent(vaultSearchMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const query = url.searchParams.get('q');
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }
    if (!query?.trim()) {
      sendJson(response, 400, fail('INVALID_REQUEST', 'q query parameter is required'));
      return;
    }

    const dbPath = initializeStateDb(repoRoot);
    if (!hasVaultSearchIndex(dbPath)) {
      sendJson(response, 500, fail('INTERNAL_ERROR', FTS5_UNAVAILABLE_MESSAGE));
      return;
    }

    // Wrap the whole query as one FTS5 phrase (escaping embedded quotes) so
    // arbitrary user input — including FTS5 operators like `*`, `-`, `AND` —
    // is always treated as literal search text, never as query syntax.
    const ftsPhrase = `"${query.trim().replace(/"/g, '""')}"`;
    const rows = querySql<{ path: string; line: number; text: string }>(
      dbPath,
      `select path, line, text from vault_search_index
       where workspace_id = ${sqlValue(workspace.id)} and vault_search_index match ${sqlValue(ftsPhrase)}
       order by rank
       limit 50;`
    );
    const results: VaultSearchResult[] = rows.map((row) => ({ path: row.path, line: row.line, text: row.text }));
    sendJson<VaultSearchResponse>(response, 200, ok({ results }));
    return;
  }

  const vaultAnnotateMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/vault\/annotate$/);
  if (method === 'POST' && vaultAnnotateMatch) {
    const workspaceIdentifier = decodeURIComponent(vaultAnnotateMatch[1]);
    const body = VaultAnnotateBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    try {
      const { vaultDir } = getWorkspacePaths(repoRoot, workspace);
      const file = await annotateVaultItem(vaultDir, {
        path: body.path,
        itemText: body.itemText,
        color: body.color,
        assign: body.assign
      });
      const repoConfig = await readRepoConfig(repoRoot);
      const context = await createVaultContext(
        workspace.id,
        vaultDir,
        getLastSeq(repoRoot, workspace.id),
        repoConfig.vault.contextMaxBytes
      );
      sendJson<VaultAnnotateResponseBody>(response, 200, ok({ file, context }));
    } catch (error) {
      sendJson(response, 400, fail('INVALID_REQUEST', error instanceof Error ? error.message : 'Unable to annotate vault item'));
    }
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

    const dbPath = initializeStateDb(repoRoot);
    for (const file of PHASE_ONE_VAULT_FILES) {
      const content = await readFile(join(vaultDir, file), 'utf8').catch(() => '');
      reindexVaultFile(dbPath, workspace.id, file, content, result.lastSeq);
    }

    sendJson(response, 200, ok({ rebuilt: true, lastSeq: result.lastSeq }));
    return;
  }

  const latestCheckpointMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/checkpoints\/latest$/);
  if (method === 'GET' && latestCheckpointMatch) {
    const workspaceIdentifier = decodeURIComponent(latestCheckpointMatch[1]);
    const repoRoot = getRepoRoot(resolve(url.searchParams.get('repoRoot') ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const checkpoint = await getLatestRemoteCheckpoint(repoRoot, workspace.id);
    sendJson(response, 200, ok({ checkpoint: checkpoint ?? null }));
    return;
  }

  const createCheckpointMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/checkpoints$/);
  if (method === 'POST' && createCheckpointMatch) {
    const workspaceIdentifier = decodeURIComponent(createCheckpointMatch[1]);
    const body = RelayRequestBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const checkpoint = await createRemoteCheckpoint(repoRoot, workspace);
    sendJson(response, 201, ok({ checkpoint }));
    return;
  }

  const registerWorktreeMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/worktrees\/register$/);
  if (method === 'POST' && registerWorktreeMatch) {
    const workspaceIdentifier = decodeURIComponent(registerWorktreeMatch[1]);
    const body = RegisterWorktreeBodySchema.parse(await readJsonBody<unknown>(request));
    const repoRoot = getRepoRoot(resolve(body.repoRoot ?? state.defaultRepoRoot));
    const workspace = getWorkspaceByIdentifier(repoRoot, workspaceIdentifier);
    if (!workspace) {
      sendJson(response, 404, fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceIdentifier} was not found`));
      return;
    }

    const worktree = registerWorktree(repoRoot, workspace.id, {
      userId: body.userId,
      path: body.path,
      branch: body.branch,
      baseCommit: body.baseCommit,
      currentCommit: body.currentCommit,
      dirty: body.dirty ?? false
    });
    sendJson(response, 200, ok({ worktree }));
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

    const latestCheckpoint = await getLatestRemoteCheckpoint(repoRoot, workspace.id).catch(() => undefined);

    sendJson(response, 200, ok({
      workspace,
      participants: listParticipants(repoRoot, workspace.id),
      worktrees: listWorktrees(repoRoot, workspace.id),
      lastSeq: sequence?.last_seq ?? 0,
      latestCheckpoint
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
    const participant = participants.find((entry) => entry.id === participantId);
    if (!participant) {
      sendJson(response, 404, fail('NOT_FOUND', `Participant ${participantId} was not found`));
      return;
    }
    const avatarId = avatarStorageId(participant.displayName);
    const slug = avatarNameSlug(participant.displayName);
    const legacyIds = [participantId, ...findLegacyAvatarIdsForSlug(repoRoot, slug).filter((id) => id !== participantId)];
    const avatarParams = avatarOptionsFromParams(url.searchParams);
    const { png } = await getOrGenerateAvatar(
      repoRoot,
      avatarId,
      { ...avatarParams, query: avatarParams.query ?? DEFAULT_PFP_QUERY },
      legacyIds
    );
    sendAvatarPng(response, request, png);
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
  startRelayPolling({ defaultRepoRoot: repoRoot });
  startRealtimeEventSubscriber({ defaultRepoRoot: repoRoot });
}

main();
