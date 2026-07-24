import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LocalUserProfile, Workspace } from '@coord/core';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile, listRelaySessions, listTracks } from '../daemon-client';
import { ask, hasFlag, parseFlag } from '../prompt';
import {
  agentCommand,
  commandExists,
  detectDefaultAgent,
  displayAgent,
  normalizeAgent,
  type LaunchAgent
} from '../lib/agent';
import { currentSessionNameFromBranch } from '../lib/current-track';
import { readWorktreePointer, writeActiveTrack, type WorktreePointer } from '../lib/pointers';
import { ensureDaemonRunning } from './daemon';
import { installClaudeHook } from './hook';
import { runInit } from './init';
import { runStart } from './start';
import { runTrackJoin } from './track';

export type AgentLaunchPlan = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

function cliEntryPoint(): string {
  return resolve(__dirname, '../index.js');
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function coordEnvironment(
  options: ClientOptions,
  track: Workspace
): NodeJS.ProcessEnv {
  const daemonUrl = options.baseUrl ?? 'http://127.0.0.1:9473';
  return {
    ...process.env,
    COORD_REPO_ROOT: options.repoRoot,
    COORD_DAEMON_URL: daemonUrl,
    COORD_WORKSPACE_ID: track.id,
    COORD_SESSION_NAME: track.sessionName
  };
}

function writeClaudeMcpConfig(
  options: ClientOptions,
  track: Workspace
): string {
  const daemonUrl = options.baseUrl ?? 'http://127.0.0.1:9473';
  const dir = join(options.repoRoot, '.coord', 'workspaces', track.sessionName);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'claude-mcp.json');
  writeFileSync(path, `${JSON.stringify({
    mcpServers: {
      coord: {
        command: process.execPath,
        args: [cliEntryPoint(), 'mcp'],
        env: {
          COORD_REPO_ROOT: options.repoRoot,
          COORD_DAEMON_URL: daemonUrl,
          COORD_WORKSPACE_ID: track.id,
          COORD_SESSION_NAME: track.sessionName
        }
      }
    }
  }, null, 2)}\n`);
  return path;
}

export function buildAgentLaunchPlan(
  agent: LaunchAgent,
  pointer: WorktreePointer,
  track: Workspace,
  options: ClientOptions,
  claudeMcpConfigPath?: string
): AgentLaunchPlan {
  const command = agentCommand(agent);
  const env = coordEnvironment(options, track);

  if (agent === 'claude-code') {
    if (!claudeMcpConfigPath) {
      throw new Error('Claude MCP configuration path is required.');
    }
    return {
      command,
      args: ['--mcp-config', claudeMcpConfigPath],
      cwd: pointer.path,
      env
    };
  }

  if (agent === 'codex') {
    const daemonUrl = options.baseUrl ?? 'http://127.0.0.1:9473';
    const mcpArgs = JSON.stringify([cliEntryPoint(), 'mcp']);
    const mcpEnv = [
      `COORD_REPO_ROOT = ${quoteToml(options.repoRoot)}`,
      `COORD_DAEMON_URL = ${quoteToml(daemonUrl)}`,
      `COORD_WORKSPACE_ID = ${quoteToml(track.id)}`,
      `COORD_SESSION_NAME = ${quoteToml(track.sessionName)}`
    ].join(', ');
    return {
      command,
      args: [
        '-C',
        pointer.path,
        '-c',
        `mcp_servers.coord.command=${quoteToml(process.execPath)}`,
        '-c',
        `mcp_servers.coord.args=${mcpArgs}`,
        '-c',
        `mcp_servers.coord.env={ ${mcpEnv} }`
      ],
      cwd: pointer.path,
      env
    };
  }

  if (agent === 'cursor') {
    return { command, args: ['.'], cwd: pointer.path, env };
  }

  if (agent === 'shell') {
    return {
      command,
      args: process.platform === 'win32' ? [] : ['-l'],
      cwd: pointer.path,
      env
    };
  }

  return { command, args: [], cwd: pointer.path, env };
}

function positionalArgs(argv: string[]): string[] {
  const valueFlags = new Set(['--agent', '--project', '--base', '--base-ref']);
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith('-')) values.push(arg);
  }
  return values;
}

async function chooseTrack(argv: string[], tracks: Workspace[]): Promise<string> {
  const explicit = positionalArgs(argv)[0];
  if (explicit) return explicit;

  const current = currentSessionNameFromBranch();
  if (current) return current;
  if (tracks.length === 1) return tracks[0].sessionName;

  if (!process.stdin.isTTY) {
    if (tracks.length === 0) {
      throw new Error('No tracks exist yet. Run `coord work <track-name>`.');
    }
    throw new Error('More than one track exists. Run `coord work <track-name>`.');
  }

  if (tracks.length > 0) {
    console.log('Tracks:');
    for (const track of tracks) {
      console.log(`  - ${track.sessionName}`);
    }
  }
  return ask('Track name', tracks[0]?.sessionName ?? 'main');
}

function requestedAgent(argv: string[], profile: LocalUserProfile): LaunchAgent | undefined {
  if (hasFlag(argv, '--claude')) return 'claude-code';
  if (hasFlag(argv, '--codex')) return 'codex';
  if (hasFlag(argv, '--cursor')) return 'cursor';
  if (hasFlag(argv, '--ghost')) return 'ghost';
  if (hasFlag(argv, '--shell')) return 'shell';

  const flag = parseFlag(argv, '--agent');
  if (flag) return normalizeAgent(flag);
  if (profile.defaultAgent && profile.defaultAgent !== 'unknown') {
    return profile.defaultAgent;
  }
  return detectDefaultAgent();
}

async function listAvailableTracks(options: ClientOptions): Promise<Workspace[]> {
  const local = await listTracks(options);
  if (!local.ok) throw new Error(local.error.message);

  // A signed-in teammate may only know about a session through the relay.
  // Include those sessions in the same picker, while keeping local state
  // authoritative if the same track is present in both places.
  const bySessionName = new Map(
    local.data.tracks.map((track) => [track.sessionName, track])
  );
  const remote = await listRelaySessions(options);
  if (remote.ok) {
    for (const track of remote.data.sessions) {
      if (!bySessionName.has(track.sessionName)) {
        bySessionName.set(track.sessionName, track);
      }
    }
  }
  return [...bySessionName.values()];
}

async function resolveProfile(options: ClientOptions): Promise<LocalUserProfile> {
  let result = await getUserProfile(options);
  if (!result.ok) throw new Error(result.error.message);

  if (!result.data.profile) {
    if (!process.stdin.isTTY) {
      throw new Error('Coord is not initialized. Run `coord init` first.');
    }
    console.log('This repository is not initialized yet. Let’s set it up.');
    await runInit([], options);
    result = await getUserProfile(options);
    if (!result.ok) throw new Error(result.error.message);
  }

  if (!result.data.profile) {
    throw new Error('Coord could not load the local profile after initialization.');
  }
  return result.data.profile;
}

async function ensureParticipantWorktree(
  argv: string[],
  options: ClientOptions,
  profile: LocalUserProfile,
  sessionName: string,
  tracks: Workspace[]
): Promise<{ pointer: WorktreePointer; track: Workspace }> {
  let track = tracks.find((candidate) => candidate.sessionName === sessionName);
  let pointer = readWorktreePointer(options.repoRoot, sessionName, profile.displayName);

  if (!track) {
    const startArgs = [sessionName];
    const project = parseFlag(argv, '--project');
    const base = parseFlag(argv, '--base-ref') ?? parseFlag(argv, '--base');
    if (base) startArgs.push(base);
    if (project) startArgs.push('--project', project);
    await runStart(startArgs, options);

    const refreshed = await listTracks(options);
    if (!refreshed.ok) throw new Error(refreshed.error.message);
    track = refreshed.data.tracks.find((candidate) => candidate.sessionName === sessionName);
    pointer = readWorktreePointer(options.repoRoot, sessionName, profile.displayName);
  } else if (!pointer || !existsSync(pointer.path)) {
    await runTrackJoin([sessionName], options);
    pointer = readWorktreePointer(options.repoRoot, sessionName, profile.displayName);
  }

  if (!track) {
    throw new Error(`Track "${sessionName}" was not available after setup.`);
  }
  if (!pointer || !existsSync(pointer.path)) {
    throw new Error(`Coord could not resolve your worktree for "${sessionName}".`);
  }
  return { pointer, track };
}

async function launchAgent(plan: AgentLaunchPlan): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        process.exitCode = 1;
      } else if (code && code !== 0) {
        process.exitCode = code;
      }
      resolvePromise();
    });
  });
}

export async function runWork(argv: string[], options: ClientOptions): Promise<void> {
  const daemonStarted = await ensureDaemonRunning(options);
  if (daemonStarted) console.log('Started the Coord daemon.');

  const profile = await resolveProfile(options);
  const tracks = await listAvailableTracks(options);

  const sessionName = (await chooseTrack(argv, tracks)).trim();
  if (!sessionName) throw new Error('Track name is required.');

  const { pointer, track } = await ensureParticipantWorktree(
    argv,
    options,
    profile,
    sessionName,
    tracks
  );
  writeActiveTrack(options.repoRoot, track.sessionName);

  console.log(`Ready on "${track.sessionName}" at ${pointer.path}`);
  if (hasFlag(argv, '--no-launch')) return;

  let agent = requestedAgent(argv, profile);
  if (!agent && process.stdin.isTTY) {
    agent = normalizeAgent(await ask('Agent (claude/codex/cursor/ghost/shell)', 'claude'));
  }
  if (!agent) {
    throw new Error('No coding agent was found. Pass `--agent claude`, `--agent codex`, or `--shell`.');
  }

  const command = agentCommand(agent);
  if (!commandExists(command)) {
    throw new Error(
      `${displayAgent(agent)} is not installed or "${command}" is not on PATH. Choose another agent with --agent or use --shell.`
    );
  }

  let claudeMcpConfigPath: string | undefined;
  if (agent === 'claude-code') {
    await installClaudeHook([], options, pointer.path, true);
    claudeMcpConfigPath = writeClaudeMcpConfig(options, track);
  }

  const plan = buildAgentLaunchPlan(agent, pointer, track, options, claudeMcpConfigPath);
  console.log(`Launching ${displayAgent(agent)}…`);
  await launchAgent(plan);
}
