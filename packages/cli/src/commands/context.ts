import type { Participant, PublishEventPayload, WorkspaceEvent } from '@coord/core';
import type { ClientOptions } from '../daemon-client';
import { getUserProfile, getVaultContext, getWorkspaceStatus, listEvents } from '../daemon-client';
import { currentSessionNameFromBranch, resolveCurrentTrack } from '../lib/current-track';
import { readContextPointer, writeContextPointer } from '../lib/context-pointer';
import { hasFlag } from '../prompt';

type DeltaEntry = {
  seq: number;
  targetFile: string;
  author?: string;
  text: string;
};

/**
 * The daemon's `vault context` is a stable, dumb concatenation of the flat
 * vault files (Phase 1 contract). This is the "smarter compact context"
 * (Phase 3, Kushagra): drop empty files, strip the per-file `# Title` header,
 * and dedupe identical bullet lines so an agent's window isn't spent on
 * boilerplate. It never invents content — it only prunes and reshapes what the
 * daemon already returned.
 */
export function compactVaultContext(raw: string): string {
  const sections = raw.split(/\n*--- (.+?) ---\n/).filter((part) => part.length > 0);
  const out: string[] = [];

  // After splitting, entries alternate: [fileName, body, fileName, body, ...].
  for (let i = 0; i < sections.length - 1; i += 2) {
    const file = sections[i].trim();
    const body = sections[i + 1] ?? '';

    const seen = new Set<string>();
    const kept: string[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed.trim()) continue;
      // Drop the file's own markdown title (e.g. "# Decisions").
      if (/^#\s/.test(trimmed.trim())) continue;
      const key = trimmed.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(trimmed);
    }

    if (kept.length === 0) continue; // empty vault file — omit entirely
    out.push(`### ${file}`);
    out.push(...kept);
    out.push('');
  }

  return out.join('\n').trimEnd();
}

function participantsById(participants: Participant[]): Map<string, Participant> {
  return new Map(participants.map((p) => [p.id, p]));
}

function toDelta(event: WorkspaceEvent, byId: Map<string, Participant>): DeltaEntry | null {
  if (event.type !== 'publish' || !event.targetFile) return null;
  const payload = event.payload as PublishEventPayload | undefined;
  const text = payload?.text?.trim();
  if (!text) return null;
  return {
    seq: event.seq,
    targetFile: event.targetFile,
    author: byId.get(event.actorId)?.displayName,
    text
  };
}

function renderDeltaLines(deltas: DeltaEntry[]): string[] {
  // Most recent first — freshest teammate updates lead.
  return [...deltas]
    .sort((a, b) => b.seq - a.seq)
    .map((d) => `- [${d.targetFile}]${d.author ? ` (${d.author})` : ''} ${d.text.replace(/\n+/g, ' ')}`);
}

export async function runContext(argv: string[], options: ClientOptions): Promise<void> {
  const asJson = hasFlag(argv, '--json');
  const peek = hasFlag(argv, '--peek');
  const deltasOnly = hasFlag(argv, '--deltas-only');
  const full = hasFlag(argv, '--full');

  const track = await resolveCurrentTrack(options);
  const sessionName = currentSessionNameFromBranch() ?? track.sessionName;

  const profile = await getUserProfile(options);
  const displayName = profile.ok && profile.data.profile ? profile.data.profile.displayName : 'local';

  const [contextResult, eventsResult, statusResult] = await Promise.all([
    getVaultContext(options, track.id),
    listEvents(options, track.id),
    getWorkspaceStatus(options, track.id)
  ]);
  if (!contextResult.ok) throw new Error(contextResult.error.message);
  if (!eventsResult.ok) throw new Error(eventsResult.error.message);

  const participants = statusResult.ok ? statusResult.data.participants : [];
  const byId = participantsById(participants);

  const pointer = readContextPointer(options.repoRoot, sessionName, displayName);
  const lastSeenSeq = pointer?.lastSeenSeq ?? 0;

  const events = eventsResult.data.events;
  const latestSeq = events.reduce((max, event) => Math.max(max, event.seq), 0);
  const deltas = events
    .filter((event) => event.seq > lastSeenSeq)
    .map((event) => toDelta(event, byId))
    .filter((entry): entry is DeltaEntry => entry !== null);

  const compacted = full ? contextResult.data.context.content : compactVaultContext(contextResult.data.context.content);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          sessionName,
          workspaceId: track.id,
          lastSeenSeq,
          latestSeq,
          truncated: contextResult.data.context.truncated,
          context: deltasOnly ? undefined : compacted,
          deltas
        },
        null,
        2
      )}\n`
    );
  } else {
    const out: string[] = [`# Coord context — ${sessionName}`];

    if (!deltasOnly) {
      out.push('', '## Shared vault context');
      out.push(compacted || '_(vault is empty so far)_');
    }

    out.push('', `## New since you last looked (seq ${lastSeenSeq} → ${latestSeq})`);
    if (deltas.length === 0) {
      out.push('_No new updates since your last context pull._');
    } else {
      out.push(...renderDeltaLines(deltas));
    }

    process.stdout.write(`${out.join('\n')}\n`);
  }

  if (!peek && latestSeq > lastSeenSeq) {
    writeContextPointer(options.repoRoot, {
      workspaceId: track.id,
      sessionName,
      displayName,
      lastSeenSeq: latestSeq,
      updatedAt: new Date().toISOString()
    });
  }

  console.error(
    `[context: ${deltas.length} new update(s), lastSeen ${lastSeenSeq}→${peek ? lastSeenSeq : latestSeq}, truncated=${contextResult.data.context.truncated}]`
  );
}
