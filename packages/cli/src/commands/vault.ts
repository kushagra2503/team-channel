import type { ClientOptions } from '../daemon-client';
import { getVaultContext, readVaultFile, searchVault } from '../daemon-client';
import { resolveCurrentTrack } from '../lib/current-track';

async function runVaultRead(argv: string[], options: ClientOptions): Promise<void> {
  const path = argv.find((arg) => !arg.startsWith('-'));
  if (!path) {
    throw new Error('Usage: coord vault read <path>');
  }

  const track = await resolveCurrentTrack(options);
  const result = await readVaultFile(options, track.id, path);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  process.stdout.write(result.data.file.content);
}

async function runVaultContext(_argv: string[], options: ClientOptions): Promise<void> {
  const track = await resolveCurrentTrack(options);
  const result = await getVaultContext(options, track.id);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  const { context } = result.data;
  process.stdout.write(context.content);
  console.error(
    `[vault context: ${context.includedPaths.length} file(s), truncated=${context.truncated}, lastSeq=${context.lastSeq ?? 0}]`
  );
}

async function runVaultSearch(argv: string[], options: ClientOptions): Promise<void> {
  const query = argv.filter((arg) => !arg.startsWith('-')).join(' ');
  if (!query.trim()) {
    throw new Error('Usage: coord vault search <query>');
  }

  const track = await resolveCurrentTrack(options);
  const result = await searchVault(options, track.id, query);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.results.length === 0) {
    console.log('No matches.');
    return;
  }

  for (const match of result.data.results) {
    console.log(`${match.path}:${match.line}: ${match.text}`);
  }
}

export async function runVault(argv: string[], options: ClientOptions): Promise<void> {
  const sub = argv[0];
  if (sub === 'read') {
    await runVaultRead(argv.slice(1), options);
    return;
  }
  if (sub === 'context') {
    await runVaultContext(argv.slice(1), options);
    return;
  }
  if (sub === 'search') {
    await runVaultSearch(argv.slice(1), options);
    return;
  }
  throw new Error('Usage: coord vault read <path>|context|search <query>');
}
