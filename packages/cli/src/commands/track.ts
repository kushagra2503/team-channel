import type { ApiOk, LocalUserProfile, StartWorkspaceResponse } from '@teambridge/core';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile, joinWorkspace, listProjects, listTracks, startTrack } from '../daemon-client';
import { ask, parseFlag } from '../prompt';
import { assertValidSessionName } from '../lib/naming';
import { prepareParticipantWorktree, rollbackParticipantWorktree } from '../lib/worktree';
import { writeWorktreePointer } from '../lib/pointers';

/**
 * Shared by `track start` and `start` (which additionally creates a worktree
 * for the starter — see commands/start.ts). Resolves the profile/project
 * inputs and registers the track with the daemon; does not touch git.
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
    throw new Error('Run `teambridge init` first to set your name and avatar.');
  }

  let sessionName = parseFlag(argv, '--name') ?? argv.find((arg) => !arg.startsWith('-'));
  let projectId = parseFlag(argv, '--project');
  const baseRef = parseFlag(argv, '--base-ref') ?? parseFlag(argv, '--base') ?? 'HEAD';

  if (!sessionName) {
    sessionName = await ask('Track name (shown in dashboard sidebar, e.g. auth-redesign)');
  }

  if (!sessionName?.trim()) {
    throw new Error('Track name is required.');
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
      throw new Error('Create a project first: `teambridge project create`');
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

export async function runTrackStart(argv: string[], options: ClientOptions): Promise<void> {
  const { started, projectId } = await registerTrackStart(argv, options);

  console.log(`Started track "${started.data.manifest.sessionName}" on project ${projectId}`);
  console.log(`Workspace id: ${started.data.manifest.id}`);
  console.log('Dashboard will show this track under the project sidebar.');
}

export async function runTrackJoin(argv: string[], options: ClientOptions): Promise<void> {
  const profile = await getUserProfile(options);
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!profile.data.profile) {
    throw new Error('Run `teambridge init` first to set your name and avatar.');
  }

  let sessionName = parseFlag(argv, '--name') ?? argv.find((arg) => !arg.startsWith('-'));
  if (!sessionName) {
    sessionName = await ask('Track name to join');
  }
  if (!sessionName?.trim()) {
    throw new Error('Track name is required.');
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
  const track = tracks.data.tracks.find((candidate) => candidate.sessionName === sessionName);
  if (!track) {
    throw new Error(`Track "${sessionName}" not found. Start it first: \`teambridge track start ${sessionName}\`.`);
  }
  if (track.status === 'archived') {
    throw new Error(`Track "${sessionName}" is archived.`);
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
      console.log(`You are already a participant in "${track.sessionName}" as ${displayName}.`);
      console.log(`Worktree: ${worktree.path}`);
      console.log(`Enter it with: cd "${worktree.path}" && claude`);
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
  console.log(`${verb} track "${track.sessionName}" as ${displayName}.`);
  console.log(`Branch:   ${worktree.branch}`);
  console.log(`Worktree: ${worktree.path}`);
  console.log(`Enter it with: cd "${worktree.path}" && claude`);
}
