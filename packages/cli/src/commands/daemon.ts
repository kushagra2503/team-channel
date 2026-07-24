import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ClientOptions } from '../daemon-client';

const DEFAULT_DAEMON_PORT = 9473;
const DAEMON_START_TIMEOUT_MS = 5_000;

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
  const port = Number(value ?? DEFAULT_DAEMON_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Daemon port must be a positive integer.');
  }
  return port;
}

function portFromBaseUrl(baseUrl: string | undefined): number {
  if (!baseUrl) return parsePort([], process.env.COORD_DAEMON_PORT);

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid Coord daemon URL: ${baseUrl}`);
  }

  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    throw new Error(
      `Cannot auto-start a remote daemon at ${baseUrl}. Start it separately or unset COORD_DAEMON_URL.`
    );
  }

  return Number(url.port || 80);
}

async function daemonIsHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/health', baseUrl), {
      signal: AbortSignal.timeout(750)
    });
    if (!response.ok) return false;
    const body = await response.json() as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

async function waitForDaemon(baseUrl: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DAEMON_START_TIMEOUT_MS) {
    if (await daemonIsHealthy(baseUrl)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 75));
  }
  throw new Error(`Coord daemon did not become ready at ${baseUrl}. Check .coord/daemon/daemon.log.`);
}

async function startManagedDaemon(
  options: ClientOptions,
  port: number,
  quiet: boolean
): Promise<{ started: boolean; baseUrl: string }> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const existing = readState(options.repoRoot);
  if (existing && isProcessAlive(existing.pid)) {
    if (await daemonIsHealthy(baseUrl)) {
      if (!quiet) {
        console.log(`Coord daemon already running on ${baseUrl}`);
        console.log(`PID: ${existing.pid}`);
        console.log(`Log: ${existing.logPath}`);
      }
      return { started: false, baseUrl };
    }
    throw new Error(
      `A managed Coord daemon is running as PID ${existing.pid}, but ${baseUrl} is not healthy. Check ${existing.logPath}.`
    );
  }

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

  try {
    await waitForDaemon(baseUrl);
  } catch (error) {
    if (state.pid && isProcessAlive(state.pid)) {
      process.kill(state.pid, 'SIGTERM');
    }
    rmSync(statePath(options.repoRoot), { force: true });
    throw error;
  }

  if (!quiet) {
    console.log(`Started Coord daemon on ${baseUrl}`);
    console.log(`PID: ${state.pid}`);
    console.log(`Log: ${logPath}`);
  }
  return { started: true, baseUrl };
}

/**
 * Make normal commands self-starting while preserving explicit remote daemon
 * configurations. Returns true only when this call launched the daemon.
 */
export async function ensureDaemonRunning(options: ClientOptions): Promise<boolean> {
  const configuredBaseUrl = options.baseUrl ?? `http://127.0.0.1:${parsePort([], process.env.COORD_DAEMON_PORT)}`;
  if (await daemonIsHealthy(configuredBaseUrl)) return false;

  const port = portFromBaseUrl(configuredBaseUrl);
  const result = await startManagedDaemon(options, port, true);
  return result.started;
}

async function runDaemonStart(argv: string[], options: ClientOptions): Promise<void> {
  const port = argv.includes('--port')
    ? parsePort(argv, process.env.COORD_DAEMON_PORT)
    : portFromBaseUrl(options.baseUrl);
  await startManagedDaemon(options, port, false);
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
