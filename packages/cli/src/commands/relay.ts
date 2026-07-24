import type { ClientOptions } from '../daemon-client';
import {
  getRelayAuthStatus,
  getRelayStatus,
  listRelaySessions,
  loginRelay,
  syncRelay
} from '../daemon-client';

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

export async function runLogin(argv: string[], options: ClientOptions): Promise<void> {
  const email = valueAfter(argv, '--email') ?? process.env.COORD_EMAIL;
  const password = valueAfter(argv, '--password') ?? process.env.COORD_PASSWORD;

  if (!email || !password) {
    throw new Error('Usage: coord login --email EMAIL --password PASSWORD');
  }

  const result = await loginRelay(options, { email, password });
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  console.log(`Logged in to Coord relay as ${result.data.email ?? result.data.userId}`);
  console.log(`Relay: ${result.data.relayUrl}`);
}

export async function runRelayStatus(_argv: string[], options: ClientOptions): Promise<void> {
  const auth = await getRelayAuthStatus(options);
  const relay = await getRelayStatus(options);

  if (!auth.ok) {
    throw new Error(auth.error.message);
  }
  if (!relay.ok) {
    throw new Error(relay.error.message);
  }

  console.log(`Relay configured: ${relay.data.configured ? 'yes' : 'no'}`);
  console.log(`Logged in: ${auth.data.loggedIn ? 'yes' : 'no'}`);
  if (auth.data.email || auth.data.userId) {
    console.log(`User: ${auth.data.email ?? auth.data.userId}`);
  }
  console.log(`Pending events: ${relay.data.pending}`);
}

export async function runSessions(_argv: string[], options: ClientOptions): Promise<void> {
  const result = await listRelaySessions(options);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.sessions.length === 0) {
    console.log('No remote sessions found for this repo.');
    return;
  }

  console.log('Remote sessions:');
  for (const session of result.data.sessions) {
    console.log(`  - ${session.sessionName} (${session.id})`);
    console.log(`    base: ${session.baseRef} @ ${session.baseCommit.slice(0, 12)}`);
  }
}

export async function runSync(_argv: string[], options: ClientOptions): Promise<void> {
  const result = await syncRelay(options);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  console.log(`Sync complete. Pushed ${result.data.pushed}, pulled ${result.data.pulled}.`);
}
