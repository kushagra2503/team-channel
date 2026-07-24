import { basename } from 'node:path';
import type { RelayMode } from '@coord/core';
import type { ClientOptions } from '../daemon-client';
import {
  createProject,
  getUserProfile,
  initConfig,
  listProjects,
  saveUserProfile,
  setDefaultProject
} from '../daemon-client';
import { ask, hasFlag, parseFlag } from '../prompt';
import { detectDefaultAgent, displayAgent, normalizeAgent } from '../lib/agent';
import { ensureDaemonRunning } from './daemon';

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

async function resolveRelayMode(
  argv: string[],
  promptWhenMissing: boolean
): Promise<RelayMode | undefined> {
  const flag = parseFlag(argv, '--relay') ?? parseFlag(argv, '--relay-mode');
  if (flag) {
    return normalizeRelayMode(flag);
  }
  // Only prompt interactively; in CI / hook / piped contexts leave it unset so
  // the daemon keeps whatever the repo config already has (default `local`).
  if (promptWhenMissing && process.stdin.isTTY) {
    const answer = await ask('Relay mode (local/supabase)', 'local');
    return normalizeRelayMode(answer);
  }
  return undefined;
}

export async function runInit(argv: string[], options: ClientOptions): Promise<void> {
  const daemonStarted = await ensureDaemonRunning(options);
  if (daemonStarted) {
    console.log('Started the Coord daemon.');
  }

  const existing = await getUserProfile(options);
  if (!existing.ok) {
    throw new Error(existing.error.message);
  }

  // First-time setup offers the relay choice. Re-running init is a repair
  // operation and preserves the existing mode unless --relay is explicit.
  const relayMode = await resolveRelayMode(argv, !existing.data.profile);

  const config = await initConfig(options, { relayMode });
  if (!config.ok) {
    throw new Error(config.error.message);
  }
  const effectiveRelayMode = config.data.config.defaultRelayMode;
  if (config.data.updated) {
    console.log(`Relay mode set to ${effectiveRelayMode}.`);
  }

  let profile = existing.data.profile;
  // Re-running init is safe: identity flags only seed a new profile. Existing
  // names are changed through the profile API rather than surprising users
  // during routine setup repair.
  let firstName = profile?.firstName ?? parseFlag(argv, '--first-name');
  let lastName = profile?.lastName ?? parseFlag(argv, '--last-name');

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
  let defaultAgent = profile?.defaultAgent;
  if (agentFlag) {
    const normalized = normalizeAgent(agentFlag);
    if (normalized === 'shell') {
      throw new Error('A shell cannot be saved as the default coding agent.');
    }
    defaultAgent = normalized;
  } else if (!profile && process.stdin.isTTY) {
    const detected = detectDefaultAgent();
    const answer = await ask(
      'Default agent (claude/codex/cursor/ghost)',
      detected ?? 'claude-code'
    );
    const normalized = normalizeAgent(answer);
    if (normalized === 'shell') {
      throw new Error('A shell cannot be saved as the default coding agent.');
    }
    defaultAgent = normalized;
  }

  if (!profile || firstName !== profile.firstName || lastName !== profile.lastName || defaultAgent !== profile.defaultAgent) {
    const saved = await saveUserProfile(options, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      defaultAgent,
      defaultProjectId: profile?.defaultProjectId
    });

    if (!saved.ok) {
      throw new Error(saved.error.message);
    }
    profile = saved.data.profile;
    console.log(`${existing.data.profile ? 'Updated' : 'Initialized'} Coord for ${profile.displayName}`);
    console.log(`Profile: ${saved.data.path}`);
  } else {
    console.log(`Coord already initialized for ${profile.displayName}`);
  }

  console.log(`Config: ${options.repoRoot}/.coord/config.json`);
  console.log(`Relay mode: ${effectiveRelayMode}`);
  if (profile.defaultAgent && profile.defaultAgent !== 'unknown') {
    console.log(`Default agent: ${displayAgent(profile.defaultAgent)}`);
  }

  if (!hasFlag(argv, '--no-project')) {
    const projects = await listProjects(options);
    if (!projects.ok) {
      throw new Error(projects.error.message);
    }

    if (projects.data.projects.length === 0) {
      const projectName = (parseFlag(argv, '--project-name') ?? basename(options.repoRoot)).trim();
      const created = await createProject(options, { name: projectName });
      if (!created.ok) {
        throw new Error(created.error.message);
      }
      const updated = await setDefaultProject(options, profile, created.data.project.id);
      if (!updated.ok) {
        throw new Error(updated.error.message);
      }
      profile = updated.data.profile;
      console.log(`Created project "${created.data.project.name}" (${created.data.project.id})`);
    } else if (!profile.defaultProjectId && projects.data.projects.length === 1) {
      const project = projects.data.projects[0];
      const updated = await setDefaultProject(options, profile, project.id);
      if (!updated.ok) {
        throw new Error(updated.error.message);
      }
      profile = updated.data.profile;
      console.log(`Using project "${project.name}" (${project.id})`);
    }
  }

  console.log('Coord is ready.');
  console.log('Next: coord work <track>');
}
