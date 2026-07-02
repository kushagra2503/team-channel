import type { ClientOptions } from '../daemon-client';
import { getUserProfile, listProjects, listTracks } from '../daemon-client';

export async function runStatus(_argv: string[], options: ClientOptions): Promise<void> {
  const profile = await getUserProfile(options);
  const projects = await listProjects(options);
  const tracks = await listTracks(options);

  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  if (!projects.ok) {
    throw new Error(projects.error.message);
  }
  if (!tracks.ok) {
    throw new Error(tracks.error.message);
  }

  console.log(`Repo: ${options.repoRoot}`);

  if (profile.data.profile) {
    console.log(`You: ${profile.data.profile.displayName}`);
    if (profile.data.profile.defaultProjectId) {
      console.log(`Default project: ${profile.data.profile.defaultProjectId}`);
    }
  } else {
    console.log('You: (not initialized — run teambridge init)');
  }

  console.log(`Projects: ${projects.data.projects.length}`);
  for (const project of projects.data.projects) {
    console.log(`  - ${project.name} (${project.id})`);
  }

  console.log(`Tracks: ${tracks.data.tracks.length}`);
  for (const track of tracks.data.tracks) {
    console.log(`  - ${track.sessionName}${track.projectId ? ` → ${track.projectId}` : ''}`);
  }
}
