import { execFileSync, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MONOREPO_ROOT = join(__dirname, '../..');

export const CLI_BIN = join(MONOREPO_ROOT, 'packages/cli/dist/index.js');
export const DAEMON_BIN = join(MONOREPO_ROOT, 'packages/daemon/dist/index.js');

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on('error', reject);
  });
}

export async function createTempGitRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'coord-it-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'coord-test@local'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Coord Test'], { cwd: dir, stdio: 'ignore' });
  await writeFile(join(dir, 'README.md'), '# coord integration fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

export async function waitForDaemon(baseUrl, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();
      if (response.ok && body.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Daemon at ${baseUrl} did not become healthy within ${timeoutMs}ms`);
}

export async function startTestDaemon(repoRoot) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(
    process.execPath,
    [DAEMON_BIN, '--port', String(port), '--repo', repoRoot],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        COORD_DAEMON_PORT: String(port),
        COORD_REPO_ROOT: repoRoot
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForDaemon(baseUrl);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error instanceof Error ? error.message : error}\n${stderr}`);
  }

  return {
    baseUrl,
    port,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('exit', () => resolve());
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 2_000);
      });
    }
  };
}

export function runCli(args, { repoRoot, baseUrl, cwd }) {
  const env = {
    ...process.env,
    COORD_REPO_ROOT: repoRoot
  };
  if (baseUrl) {
    env.COORD_DAEMON_URL = baseUrl;
  } else {
    delete env.COORD_DAEMON_URL;
  }
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, ...args], {
      cwd: cwd ?? repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error) {
    const execError = error;
    return {
      stdout: execError.stdout?.toString() ?? '',
      stderr: execError.stderr?.toString() ?? '',
      exitCode: execError.status ?? 1
    };
  }
}

export async function apiGet(path, { repoRoot, baseUrl }) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('repoRoot', repoRoot);
  const response = await fetch(url);
  const body = await response.json();
  return { response, body };
}

export async function apiPost(path, body, { repoRoot, baseUrl }) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('repoRoot', repoRoot);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const responseBody = await response.json();
  return { response, body: responseBody };
}

export function pathsEqual(left, right) {
  return realpathSync(left) === realpathSync(right);
}

export async function removeTempDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

export function parseCreatedProjectId(output) {
  const match = output.match(/Created project "[^"]+" \((proj_[^)]+)\)/);
  if (!match) {
    throw new Error(`Could not parse project id from CLI output:\n${output}`);
  }
  return match[1];
}

export function parseStartedWorkspaceId(output) {
  const match = output.match(/Workspace id: (ws_[^\s]+)/);
  if (!match) {
    throw new Error(`Could not parse workspace id from CLI output:\n${output}`);
  }
  return match[1];
}
