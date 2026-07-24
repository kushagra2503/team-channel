import type { Participant, ParticipantStatus } from '@coord/core';
import { normalizeDisplayName } from '@/lib/avatar-identity';

export type PinnedLocalUser = {
  displayName: string;
  status: ParticipantStatus;
};

export type ActivityTone = 'active' | 'idle' | 'offline';

export type ParticipantActivity = {
  label: string;
  tone: ActivityTone;
};

const ACTIVITIES = [
  'editing src/api/billing.ts',
  'running pnpm test',
  'reviewing PR #128',
  'merging main',
  'writing observations.md',
  'debugging checkout flow',
  'refactoring vault.ts',
  'shaping the design system',
  'wiring up webhooks',
  'reindexing search docs'
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function normalizeParticipantName(name: string): string {
  return normalizeDisplayName(name);
}

export function displayNamesMatch(a: string, b: string): boolean {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

export function prettyParticipantName(raw: string): string {
  const words = normalizeParticipantName(raw).split(' ').filter(Boolean);
  if (words.length === 0) {
    return raw;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** First name only for compact chips — handles slug-style display names (ronish-patel → Ronish). */
export function participantFirstName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '?';
  }

  if (/\s/.test(trimmed)) {
    const first = trimmed.split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  const segment = trimmed.split(/[-_]+/)[0];
  if (!segment) {
    return '?';
  }

  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

export function participantInitials(raw: string): string {
  const words = prettyParticipantName(raw).split(' ');
  const first = words[0]?.charAt(0) ?? '';
  const second = words[1]?.charAt(0) ?? '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
}

export function avatarColor(seed: string): string {
  const hue = hashString(seed) % 360;
  return `hsl(${hue} 55% 45%)`;
}

function relativeLastSeen(lastSeenAt: string): string {
  const then = new Date(lastSeenAt).getTime();
  if (Number.isNaN(then)) {
    return 'last seen recently';
  }

  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return 'last seen just now';
  }

  if (minutes < 60) {
    return `last seen ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `last seen ${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `last seen ${days}d ago`;
}

export function participantActivity(participant: Pick<Participant, 'id' | 'status' | 'lastSeenAt'>): ParticipantActivity {
  if (participant.status === 'offline') {
    return { label: relativeLastSeen(participant.lastSeenAt), tone: 'offline' };
  }

  if (participant.status === 'idle') {
    return { label: 'idling', tone: 'idle' };
  }

  const index = hashString(participant.id) % ACTIVITIES.length;
  return { label: ACTIVITIES[index], tone: 'active' };
}
