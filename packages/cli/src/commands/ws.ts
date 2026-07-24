import type { ClientOptions } from '../daemon-client';
import { getWorkspaceStatus, listTracks } from '../daemon-client';

async function resolveWorkspaceBySessionName(sessionName: string, options: ClientOptions) {
  const tracks = await listTracks(options);
  if (!tracks.ok) {
    throw new Error(tracks.error.message);
  }
  const track = tracks.data.tracks.find((candidate) => candidate.sessionName === sessionName);
  if (!track) {
    throw new Error(`Session "${sessionName}" not found. Start it first: \`coord start ${sessionName}\`.`);
  }
  return track;
}

function parseSessionName(argv: string[]): string {
  const sessionName = argv.find((arg) => !arg.startsWith('-'));
  if (!sessionName?.trim()) {
    throw new Error('Usage: coord ws show|who|branches <session_name>');
  }
  return sessionName.trim();
}

async function runWsShow(argv: string[], options: ClientOptions): Promise<void> {
  const sessionName = parseSessionName(argv);
  const track = await resolveWorkspaceBySessionName(sessionName, options);
  const status = await getWorkspaceStatus(options, track.id);
  if (!status.ok) {
    throw new Error(status.error.message);
  }

  const { workspace, participants, lastSeq } = status.data;
  console.log(`Session:      ${workspace.sessionName}`);
  console.log(`Workspace id: ${workspace.id}`);
  console.log(`Status:       ${workspace.status}`);
  console.log(`Base commit:  ${workspace.baseCommit}`);
  console.log(`Participants: ${participants.length}`);
  console.log(`Last seq:     ${lastSeq}`);
}

async function runWsWho(argv: string[], options: ClientOptions): Promise<void> {
  const sessionName = parseSessionName(argv);
  const track = await resolveWorkspaceBySessionName(sessionName, options);
  const status = await getWorkspaceStatus(options, track.id);
  if (!status.ok) {
    throw new Error(status.error.message);
  }

  if (status.data.participants.length === 0) {
    console.log('No participants yet.');
    return;
  }
  for (const participant of status.data.participants) {
    console.log(`${participant.displayName}\t${participant.status}\t${participant.agent ?? 'unknown'}`);
  }
}

async function runWsBranches(argv: string[], options: ClientOptions): Promise<void> {
  const sessionName = parseSessionName(argv);
  const track = await resolveWorkspaceBySessionName(sessionName, options);
  const status = await getWorkspaceStatus(options, track.id);
  if (!status.ok) {
    throw new Error(status.error.message);
  }

  if (status.data.participants.length === 0) {
    console.log('No branches yet.');
    return;
  }
  for (const participant of status.data.participants) {
    console.log(`${participant.branch}\t${participant.displayName}`);
  }
}

export async function runWs(argv: string[], options: ClientOptions): Promise<void> {
  const sub = argv[0];
  if (sub === 'show') {
    await runWsShow(argv.slice(1), options);
    return;
  }
  if (sub === 'who') {
    await runWsWho(argv.slice(1), options);
    return;
  }
  if (sub === 'branches') {
    await runWsBranches(argv.slice(1), options);
    return;
  }
  throw new Error('Usage: coord ws show|who|branches <session_name>');
}
