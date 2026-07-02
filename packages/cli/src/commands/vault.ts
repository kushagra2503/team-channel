import type { ClientOptions } from '../daemon-client';
import { getVaultContext, readVaultFile } from '../daemon-client';
import { resolveCurrentTrack } from '../lib/current-track';

async function runVaultRead(argv: string[], options: ClientOptions): Promise<void> {
  const path = argv.find((arg) => !arg.startsWith('-'));
  if (!path) {
    throw new Error('Usage: teambridge vault read <path>');
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
    `\n[vault context: ${context.includedPaths.length} file(s), truncated=${context.truncated}, lastSeq=${context.lastSeq ?? 0}]`
  );
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
  throw new Error('Usage: teambridge vault read <path>|context');
}
