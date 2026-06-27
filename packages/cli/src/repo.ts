import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export function resolveRepoRoot(cwd: string = process.cwd()): string {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: resolve(cwd),
      encoding: 'utf8'
    }).trim();
    return root;
  } catch {
    throw new Error('Not inside a git repository. Run teambridge from your project repo root.');
  }
}

export function daemonBaseUrl(): string {
  const port = process.env.TEAMBRIDGE_DAEMON_PORT ?? '9473';
  return process.env.TEAMBRIDGE_DAEMON_URL ?? `http://127.0.0.1:${port}`;
}
