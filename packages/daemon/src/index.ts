import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
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
  TeambridgeConfig,
  TeambridgeErrorCode,
  TrackListResponse,
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

    sendJson(response, 200, ok({
      workspace,
      participants: listParticipants(repoRoot, workspace.id),
      worktrees: listWorktrees(repoRoot, workspace.id),
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
}

main();
