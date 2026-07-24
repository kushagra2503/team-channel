import type { ClientOptions } from '../daemon-client';
import { createProject, getUserProfile, listProjects, setDefaultProject } from '../daemon-client';
import { ask, parseFlag } from '../prompt';

export async function runProjectCreate(argv: string[], options: ClientOptions): Promise<void> {
  const profile = await getUserProfile(options);
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!profile.data.profile) {
    throw new Error('Run `coord init` first to set your name and avatar.');
  }

  let name = parseFlag(argv, '--name') ?? argv[0];
  let description = parseFlag(argv, '--description') ?? '';

  if (!name) {
    name = await ask('Project name');
  }
  if (!description && process.stdin.isTTY) {
    description = await ask('Project description (optional)', '');
  }

  if (!name?.trim()) {
    throw new Error('Project name is required.');
  }

  const created = await createProject(options, {
    name: name.trim(),
    description: description.trim()
  });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  await setDefaultProject(options, profile.data.profile, created.data.project.id);

  console.log(`Created project "${created.data.project.name}" (${created.data.project.id})`);
  if (created.data.member) {
    console.log(`Added you to the roster as ${created.data.member.displayName}`);
  }
  console.log('Open the dashboard project picker to view tracks once you start one.');
}

export async function runProjectList(_argv: string[], options: ClientOptions): Promise<void> {
  const projects = await listProjects(options);
  if (!projects.ok) {
    throw new Error(projects.error.message);
  }

  if (projects.data.projects.length === 0) {
    console.log('No projects yet. Run `coord project create`.');
    return;
  }

  for (const project of projects.data.projects) {
    console.log(`${project.id}\t${project.name}\t${project.description || '(no description)'}`);
  }
}
