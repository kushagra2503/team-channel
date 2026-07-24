import type { ApiOk, LocalUserProfile, StartWorkspaceResponse } from '@coord/core';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile, joinWorkspace, listProjects, listRelaySessions, listTracks, startTrack } from '../daemon-client';
import { ask, parseFlag } from '../prompt';
import { assertValidSessionName } from '../lib/naming';
import { prepareParticipantWorktree, rollbackParticipantWorktree } from '../lib/worktree';
import { writeWorktreePointer } from '../lib/pointers';

function positionalArgs(argv: string[], flagsWithValues: Set<string>): string[] {
  const result: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (flagsWithValues.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) {
      result.push(arg);
    }
  }
  return result;
}

/**
 * Shared by `start` and the internal registration flow. Resolves the
 * profile/project inputs and registers the session with the daemon.
 */
export async function registerTrackStart(
  argv: string[],
  options: ClientOptions
): Promise<{ profile: LocalUserProfile; projectId: string | undefined; started: ApiOk<StartWorkspaceResponse> }> {
  const profile = await getUserProfile(options);
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!profile.data.profile) {
    throw new Error('Run `coord init` first to set your name and avatar.');
  }

  const positionals = positionalArgs(argv, new Set(['--name', '--project', '--base-ref', '--base']));
  let sessionName = parseFlag(argv, '--name') ?? positionals[0];
  let projectId = parseFlag(argv, '--project');
  const baseRef = parseFlag(argv, '--base-ref') ?? parseFlag(argv, '--base') ?? positionals[1] ?? 'HEAD';

  if (!sessionName) {
    sessionName = await ask('Session name (shown in dashboard sidebar, e.g. auth-redesign)');
  }

  if (!sessionName?.trim()) {
    throw new Error('Session name is required.');
  }

  if (!projectId) {
    projectId = profile.data.profile.defaultProjectId ?? undefined;
  }

  if (!projectId) {
    const projects = await listProjects(options);
    if (!projects.ok) {
      throw new Error(projects.error.message);
    }
    if (projects.data.projects.length === 1) {
      projectId = projects.data.projects[0].id;
    } else if (projects.data.projects.length > 1) {
      console.log('Projects:');
      for (const project of projects.data.projects) {
        console.log(`  ${project.id}\t${project.name}`);
      }
      const picked = await ask('Project id for this track');
      projectId = picked.trim() || undefined;
    } else {
      throw new Error('Create a project first: `coord project create`');
    }
  }

  const started = await startTrack(options, {
    sessionName: sessionName.trim(),
    projectId,
    baseRef,
    displayName: profile.data.profile.displayName,
    agent: profile.data.profile.defaultAgent
  });

  if (!started.ok) {
    throw new Error(started.error.message);
  }

  return { profile: profile.data.profile, projectId, started };
}

export async function runTrackJoin(argv: string[], options: ClientOptions): Promise<void> {
  const profile = await getUserProfile(options);
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!profile.data.profile) {
    throw new Error('Run `coord init` first to set your name and avatar.');
  }

  const positionals = positionalArgs(argv, new Set(['--name', '--as']));
  let sessionName = parseFlag(argv, '--name') ?? positionals[0];
  if (!sessionName) {
    sessionName = await ask('Session name to join');
  }
  if (!sessionName?.trim()) {
    throw new Error('Session name is required.');
  }
  sessionName = sessionName.trim();
  assertValidSessionName(sessionName);

  const displayName = parseFlag(argv, '--as') ?? profile.data.profile.displayName;
  const agent = profile.data.profile.defaultAgent;

  // Resolve the track authoritatively to get its frozen baseCommit + id.
  const tracks = await listTracks(options);
  if (!tracks.ok) {
    throw new Error(tracks.error.message);
  }
  let track = tracks.data.tracks.find((candidate) => candidate.sessionName === sessionName);
  if (!track) {
    const remote = await listRelaySessions(options);
    if (remote.ok) {
      track = remote.data.sessions.find((candidate) => candidate.sessionName === sessionName);
    }
  }
  if (!track) {
    throw new Error(`Session "${sessionName}" not found. Start it first or run \`coord sessions\` after \`coord login\`.`);
  }
  if (track.status === 'archived') {
    throw new Error(`Session "${sessionName}" is archived.`);
  }

  // Git-first: create the isolated worktree before registering with the daemon,
  // so the daemon never records a row for a worktree that failed to materialize.
  const worktree = prepareParticipantWorktree({
    repoRoot: options.repoRoot,
    sessionName: track.sessionName,
    displayName,
    baseCommit: track.baseCommit
  });

  const joined = await joinWorkspace(options, {
    sessionName: track.sessionName,
    displayName,
    agent,
    worktreePath: worktree.path
  });

  if (!joined.ok) {
    // Duplicate display name on this track: the worktree may be legitimate prior
    // work, so surface it and do NOT roll back (daemon ask #5 is only partial).
    if (/unique constraint failed:\s*participants/i.test(joined.error.message)) {
      writeWorktreePointer(options.repoRoot, {
        workspaceId: track.id,
        sessionName: track.sessionName,
        displayName,
        path: worktree.path,
        branch: worktree.branch,
        baseCommit: track.baseCommit,
        role: 'joiner'
      });
      console.log(`You are already a participant in session "${track.sessionName}" as ${displayName}.`);
      console.log(`Worktree: ${worktree.path}`);
      console.log(`Continue with: coord work ${track.sessionName}`);
      return;
    }
    // Otherwise roll back only what we created this run.
    if (worktree.created) {
      rollbackParticipantWorktree({ repoRoot: options.repoRoot, path: worktree.path, branch: worktree.branch });
    }
    throw new Error(joined.error.message);
  }

  writeWorktreePointer(options.repoRoot, {
    workspaceId: track.id,
    sessionName: track.sessionName,
    displayName,
    path: worktree.path,
    branch: worktree.branch,
    baseCommit: track.baseCommit,
    role: 'joiner'
  });

  const verb = worktree.reused ? 'Re-attached to' : 'Joined';
  console.log(`${verb} session "${track.sessionName}" as ${displayName}.`);
  console.log(`Branch:   ${worktree.branch}`);
  console.log(`Worktree: ${worktree.path}`);
  console.log(`Continue with: coord work ${track.sessionName}`);
}
