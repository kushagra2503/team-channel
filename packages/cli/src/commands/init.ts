import type { RelayMode } from '@teambridge/core';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile, initConfig, saveUserProfile } from '../daemon-client';
import { ask, parseFlag } from '../prompt';

/**
 * Accept a few friendly spellings for the relay mode so users don't have to
 * remember the exact contract value (`local` | `supabase`).
 */
function normalizeRelayMode(value: string): RelayMode {
  const v = value.trim().toLowerCase();
  if (v === 'local' || v === 'off' || v === 'none') {
    return 'local';
  }
  if (v === 'supabase' || v === 'relay' || v === 'remote' || v === 'on') {
    return 'supabase';
  }
  throw new Error(`Unknown relay mode "${value}". Use "local" or "supabase".`);
}

async function resolveRelayMode(argv: string[]): Promise<RelayMode | undefined> {
  const flag = parseFlag(argv, '--relay') ?? parseFlag(argv, '--relay-mode');
  if (flag) {
    return normalizeRelayMode(flag);
  }
  // Only prompt interactively; in CI / hook / piped contexts leave it unset so
  // the daemon keeps whatever the repo config already has (default `local`).
  if (process.stdin.isTTY) {
    const answer = await ask('Relay mode (local/supabase)', 'local');
    return normalizeRelayMode(answer);
  }
  return undefined;
}

export async function runInit(argv: string[], options: ClientOptions): Promise<void> {
  const relayMode = await resolveRelayMode(argv);

  const config = await initConfig(options, { relayMode });
  if (!config.ok) {
    throw new Error(config.error.message);
  }
  const effectiveRelayMode = config.data.config.defaultRelayMode;
  if (config.data.updated) {
    console.log(`Relay mode set to ${effectiveRelayMode}.`);
  }

  const existing = await getUserProfile(options);
  if (existing.ok && existing.data.profile) {
    console.log(`Teambridge already initialized for ${existing.data.profile.displayName}`);
    console.log(`Profile: ${existing.data.profile.displayName}`);
    console.log(`Relay mode: ${effectiveRelayMode}`);
    return;
  }

  let firstName = parseFlag(argv, '--first-name');
  let lastName = parseFlag(argv, '--last-name');

  if (!firstName) {
    firstName = await ask('First name');
  }
  if (!lastName) {
    lastName = await ask('Last name');
  }

  if (!firstName.trim() || !lastName.trim()) {
    throw new Error('First name and last name are required.');
  }

  const agentFlag = parseFlag(argv, '--agent');
  const allowedAgents = ['claude-code', 'cursor', 'codex', 'ghost', 'unknown'] as const;
  const defaultAgent = agentFlag && (allowedAgents as readonly string[]).includes(agentFlag)
    ? (agentFlag as (typeof allowedAgents)[number])
    : undefined;

  const saved = await saveUserProfile(options, {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    defaultAgent
  });

  if (!saved.ok) {
    throw new Error(saved.error.message);
  }

  console.log(`Initialized Teambridge for ${saved.data.profile.displayName}`);
  console.log(`Config: ${options.repoRoot}/.teambridge/config.json`);
  console.log(`Profile: ${saved.data.path}`);
  console.log(`Relay mode: ${effectiveRelayMode}`);
  console.log('Flower avatar generated — open the dashboard to see your project roster.');
}
