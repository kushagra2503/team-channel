import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ClientOptions } from '../daemon-client';

type DaemonState = {
  pid: number;
  port: number;
  repoRoot: string;
  baseUrl: string;
  logPath: string;
  startedAt: string;
};

function stateDir(repoRoot: string): string {
  return join(repoRoot, '.coord', 'daemon');
}

function statePath(repoRoot: string): string {
  return join(stateDir(repoRoot), 'daemon.json');
}

function readState(repoRoot: string): DaemonState | null {
  const path = statePath(repoRoot);
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8')) as DaemonState;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function daemonEntryPoint(): string {
  return resolve(__dirname, '../../../daemon/dist/index.js');
}

function parsePort(argv: string[], fallback: string | undefined): number {
  const index = argv.indexOf('--port');
  const value = index >= 0 ? argv[index + 1] : fallback;
  const port = Number(value ?? 9473);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Daemon port must be a positive integer.');
  }
  return port;
}

async function runDaemonStart(argv: string[], options: ClientOptions): Promise<void> {
  const existing = readState(options.repoRoot);
  if (existing && isProcessAlive(existing.pid)) {
    console.log(`Coord daemon already running on ${existing.baseUrl}`);
    console.log(`PID: ${existing.pid}`);
    console.log(`Log: ${existing.logPath}`);
    return;
  }

  const port = parsePort(argv, process.env.COORD_DAEMON_PORT);
  const baseUrl = `http://127.0.0.1:${port}`;
  const dir = stateDir(options.repoRoot);
  mkdirSync(dir, { recursive: true });

  const logPath = join(dir, 'daemon.log');
  const stdout = openSync(logPath, 'a');
  const stderr = openSync(logPath, 'a');

  const child = spawn(process.execPath, [daemonEntryPoint(), '--port', String(port), '--repo', options.repoRoot], {
    cwd: options.repoRoot,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    env: {
      ...process.env,
      COORD_DAEMON_PORT: String(port),
      COORD_REPO_ROOT: options.repoRoot
    }
  });

  child.unref();
  closeSync(stdout);
  closeSync(stderr);

  const state: DaemonState = {
    pid: child.pid ?? 0,
    port,
    repoRoot: options.repoRoot,
    baseUrl,
    logPath,
    startedAt: new Date().toISOString()
  };
  writeFileSync(statePath(options.repoRoot), `${JSON.stringify(state, null, 2)}\n`);

  console.log(`Started Coord daemon on ${baseUrl}`);
  console.log(`PID: ${state.pid}`);
  console.log(`Log: ${logPath}`);
}

async function runDaemonStatus(options: ClientOptions): Promise<void> {
  const state = readState(options.repoRoot);
  if (!state) {
    console.log('Coord daemon is not managed for this repo yet.');
    process.exitCode = 1;
    return;
  }

  if (!isProcessAlive(state.pid)) {
    console.log(`Coord daemon is stopped. Last PID: ${state.pid}`);
    console.log(`Log: ${state.logPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Coord daemon is running on ${state.baseUrl}`);
  console.log(`PID: ${state.pid}`);
  console.log(`Log: ${state.logPath}`);
}

async function runDaemonStop(options: ClientOptions): Promise<void> {
  const state = readState(options.repoRoot);
  if (!state) {
    console.log('Coord daemon is not managed for this repo yet.');
    return;
  }

  if (isProcessAlive(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    console.log(`Stopped Coord daemon on ${state.baseUrl}`);
  } else {
    console.log(`Coord daemon was already stopped. Last PID: ${state.pid}`);
  }

  rmSync(statePath(options.repoRoot), { force: true });
}

export async function runDaemon(argv: string[], options: ClientOptions): Promise<void> {
  const subcommand = argv[0] ?? 'status';

  if (subcommand === 'start') {
    await runDaemonStart(argv.slice(1), options);
    return;
  }

  if (subcommand === 'status') {
    await runDaemonStatus(options);
    return;
  }

  if (subcommand === 'stop') {
    await runDaemonStop(options);
    return;
  }

  throw new Error('Usage: coord daemon start|status|stop [--port PORT]');
}
