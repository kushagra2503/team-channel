import type { ClientOptions } from '../daemon-client';
import { getUserProfile, initConfig, saveUserProfile } from '../daemon-client';
import { ask, parseFlag } from '../prompt';

export async function runInit(argv: string[], options: ClientOptions): Promise<void> {
  const config = await initConfig(options);
  if (!config.ok) {
    throw new Error(config.error.message);
  }

  const existing = await getUserProfile(options);
  if (existing.ok && existing.data.profile) {
    console.log(`Teambridge already initialized for ${existing.data.profile.displayName}`);
    console.log(`Profile: ${existing.data.profile.displayName}`);
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
  console.log('Flower avatar generated — open the dashboard to see your project roster.');
}
