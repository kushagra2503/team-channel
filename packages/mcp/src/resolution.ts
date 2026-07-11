import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { McpResourceContext } from './resources';

export type ResolutionInput = {
  workspaceId?: string;
  sessionName?: string;
  repoRoot?: string;
  baseUrl?: string;
};

export async function resolveWorkspaceContext(input: ResolutionInput): Promise<McpResourceContext> {
  const baseUrl = input.baseUrl ?? process.env.TEAMBRIDGE_DAEMON_URL;

  // 1. Explicit params
  if (input.workspaceId || input.sessionName) {
    return {
      workspaceId: input.workspaceId,
      sessionName: input.sessionName,
      repoRoot: input.repoRoot,
      baseUrl
    };
  }

  // 2. .teambridge/.active fallback
  const repoRoot = input.repoRoot ?? findRepoRoot(process.cwd());
  if (repoRoot) {
    try {
      const content = await readFile(resolve(repoRoot, '.teambridge/.active'), 'utf-8');
      const sessionName = content.trim();
      if (sessionName) {
        return { sessionName, repoRoot, baseUrl };
      }
    } catch {
      // File doesn't exist, fall through
    }
  }

  // 3. No resolution
  throw new Error('Unable to resolve workspace. Provide workspaceId or sessionName, or ensure .teambridge/.active exists.');
}

function findRepoRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(resolve(dir, '.git'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
