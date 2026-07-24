import type { Participant } from '@coord/core';
import { avatarNameSlug } from '@coord/core';
import type { ClientOptions } from '../daemon-client';
import { askInbox, detectConflicts, getUserProfile, getWorkspaceStatus, listConflicts, listInbox, replyInbox, resolveConflict } from '../daemon-client';
import { currentParticipantSlugFromBranch, resolveCurrentTrack } from '../lib/current-track';

function positional(argv: string[]): string[] {
  return argv.filter((arg) => !arg.startsWith('-'));
}

async function localParticipant(options: ClientOptions, workspaceId: string): Promise<Participant | undefined> {
  const [profile, status] = await Promise.all([
    getUserProfile(options),
    getWorkspaceStatus(options, workspaceId)
  ]);
  if (!status.ok) return undefined;
  const branchSlug = currentParticipantSlugFromBranch();
  if (branchSlug) {
    const branchParticipant = status.data.participants.find((participant) => avatarNameSlug(participant.displayName) === branchSlug);
    if (branchParticipant) return branchParticipant;
  }
  if (!profile.ok || !profile.data.profile) return undefined;
  const displayName = profile.data.profile.displayName.toLowerCase();
  return status.data.participants.find((participant) => participant.displayName.toLowerCase() === displayName);
}

export async function runAsk(argv: string[], options: ClientOptions): Promise<void> {
  const args = positional(argv);
  const to = args[0];
  const text = args.slice(1).join(' ');
  if (!to || !text.trim()) {
    throw new Error('Usage: coord ask <participant> <question>');
  }

  const track = await resolveCurrentTrack(options);
  const actor = await localParticipant(options, track.id);
  const result = await askInbox(options, track.id, { to, text, actorId: actor?.id });
  if (!result.ok) throw new Error(result.error.message);
  console.log(`Asked ${to} (${result.data.message.id}, seq ${result.data.event.seq}).`);
}

export async function runInbox(argv: string[], options: ClientOptions): Promise<void> {
  const pendingOnly = !argv.includes('--all');
  const track = await resolveCurrentTrack(options);
  const result = await listInbox(options, track.id, pendingOnly ? 'pending' : undefined);
  if (!result.ok) throw new Error(result.error.message);

  if (result.data.messages.length === 0) {
    console.log(pendingOnly ? 'No pending inbox messages.' : 'Inbox is empty.');
    return;
  }

  for (const message of result.data.messages) {
    const direction = message.replyTo ? `reply to ${message.replyTo}` : `${message.fromUserId} -> ${message.toUserId}`;
    console.log(`${message.id}\t${message.status}\t${direction}\t${message.body}`);
  }
}

export async function runReply(argv: string[], options: ClientOptions): Promise<void> {
  const args = positional(argv);
  const messageId = args[0];
  const text = args.slice(1).join(' ');
  if (!messageId || !text.trim()) {
    throw new Error('Usage: coord reply <message_id> <answer>');
  }

  const track = await resolveCurrentTrack(options);
  const actor = await localParticipant(options, track.id);
  const result = await replyInbox(options, track.id, messageId, { text, actorId: actor?.id });
  if (!result.ok) throw new Error(result.error.message);
  console.log(`Replied to ${messageId} (${result.data.message.id}, seq ${result.data.event.seq}).`);
}

export async function runConflicts(argv: string[], options: ClientOptions): Promise<void> {
  const sub = argv[0];
  const track = await resolveCurrentTrack(options);

  if (sub === 'resolve') {
    const args = positional(argv.slice(1));
    const conflictId = args[0];
    const resolutionText = args.slice(1).join(' ');
    if (!conflictId || !resolutionText.trim()) {
      throw new Error('Usage: coord conflicts resolve <conflict_id> <resolution>');
    }
    const actor = await localParticipant(options, track.id);
    const result = await resolveConflict(options, track.id, conflictId, { resolutionText, actorId: actor?.id });
    if (!result.ok) throw new Error(result.error.message);
    console.log(`Resolved ${result.data.conflict.id} (seq ${result.data.event.seq}).`);
    return;
  }

  if (sub === 'detect') {
    const result = await detectConflicts(options, track.id);
    if (!result.ok) throw new Error(result.error.message);
    console.log(`Detected ${result.data.events.length} new conflict event(s).`);
    return;
  }

  const result = await listConflicts(options, track.id, sub === '--open' ? 'open' : undefined);
  if (!result.ok) throw new Error(result.error.message);
  if (result.data.conflicts.length === 0) {
    console.log('No conflicts.');
    return;
  }
  for (const conflict of result.data.conflicts) {
    console.log(`${conflict.id}\t${conflict.status}\t${conflict.kind}\t${conflict.summary}`);
  }
}
