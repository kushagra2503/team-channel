import { existsSync } from 'node:fs';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile } from '../daemon-client';
import { readWorktreePointer } from '../lib/pointers';

/**
 * Prints ONLY the resolved worktree path to stdout — nothing else — so it is
 * safe inside `cd "$(coord enter NAME)"` shell substitution. All
 * diagnostics and errors go to stderr via the thrown Error (index.ts logs
 * caught errors to console.error).
 */
export async function runEnter(argv: string[], options: ClientOptions): Promise<void> {
  const sessionName = argv.find((arg) => !arg.startsWith('-'));
  if (!sessionName?.trim()) {
    throw new Error('Usage: coord enter <session_name>');
  }

  const profile = await getUserProfile(options);
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!profile.data.profile) {
    throw new Error('Run `coord init` first to set your name and avatar.');
  }

  const displayName = profile.data.profile.displayName;
  const pointer = readWorktreePointer(options.repoRoot, sessionName.trim(), displayName);
  if (!pointer) {
    throw new Error(
      `No worktree found for "${sessionName}" as ${displayName}. Run \`coord start ${sessionName}\` or \`coord join ${sessionName}\` first.`
    );
  }

  if (!existsSync(pointer.path)) {
    throw new Error(
      `Worktree for "${sessionName}" was recorded at ${pointer.path}, but that path no longer exists on disk.`
    );
  }

  process.stdout.write(`${pointer.path}\n`);
}
