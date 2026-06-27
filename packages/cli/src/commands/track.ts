import type { ClientOptions } from '../daemon-client';
import { getUserProfile, listProjects, startTrack } from '../daemon-client';
import { ask, parseFlag } from '../prompt';

export async function runTrackStart(argv: string[], options: ClientOptions): Promise<void> {
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

  console.log(`Started track "${started.data.manifest.sessionName}" on project ${projectId}`);
  console.log(`Workspace id: ${started.data.manifest.id}`);
  console.log('Dashboard will show this track under the project sidebar.');
}
