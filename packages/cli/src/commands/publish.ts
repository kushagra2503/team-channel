import type { ClientOptions } from '../daemon-client';
import { publishEvent } from '../daemon-client';
import { resolveCurrentTrack } from '../lib/current-track';

export async function runPublish(argv: string[], options: ClientOptions): Promise<void> {
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  const targetFile = positional[0];
  const text = positional[1];

  if (!targetFile || !text) {
    throw new Error('Usage: coord publish <target_file> <text>');
  }
  if (!text.trim()) {
    throw new Error('publish text must not be empty.');
  }

  const track = await resolveCurrentTrack(options);

  const result = await publishEvent(options, track.id, { targetFile, text });
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  console.log(`Published to ${targetFile} (seq ${result.data.event.seq}).`);
}
