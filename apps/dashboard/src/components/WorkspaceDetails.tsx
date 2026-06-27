import { motion } from 'motion/react';
import type { Participant, WorkspaceStatusResponse } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import {
  participantActivity,
  prettyParticipantName
} from './participantDisplay';

export type WorkspaceDetailsProps = {
  status?: WorkspaceStatusResponse;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  onAvatarRev?: () => void;
};

const PRESENCE_DOT: Record<'active' | 'idle' | 'offline', string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  offline: 'bg-muted-foreground/40'
};

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 5 } as const;
function MemberRow({ participant, avatarUrl, index }: { participant: Participant; avatarUrl?: string; index: number }) {
  const activity = participantActivity(participant);
  const showDot = activity.tone === 'active' || activity.tone === 'idle';

  return (
    <motion.div
      initial={HIDE}
      animate={ENTER}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1], delay: index * 0.04 }}
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <div className="relative shrink-0">
        <ParticipantAvatar
          avatarUrl={avatarUrl}
          displayName={participant.displayName}
          size={36}
        />
        {showDot ? (
          <span
            className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-sidebar ${PRESENCE_DOT[activity.tone]}`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{prettyParticipantName(participant.displayName)}</span>
        <span className="block truncate text-xs text-muted-foreground">{activity.label}</span>
      </div>
    </motion.div>
  );
}

export function WorkspaceDetails({
  status,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev
}: WorkspaceDetailsProps) {
  if (error) {
    return (
      <section aria-label="Workspace details" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!status) return null;

  const online = status.participants.filter((p) => p.status !== 'offline');
  const offline = status.participants.filter((p) => p.status === 'offline');
  const total = status.participants.length;
  const config = { daemonBaseUrl, repoRoot };

  const urlFor = (participant: Participant) =>
    avatarUrlForDisplayName(participant.displayName, config, avatarRev);

  // Online group starts at index 0; offline group starts after
  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Workspace details" className="flex flex-col gap-1 py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="tabular-nums">
          {total} {total === 1 ? 'Member' : 'Members'}
        </SidebarGroupLabel>
      </SidebarGroup>

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((participant, i) => (
              <MemberRow key={participant.id} participant={participant} avatarUrl={urlFor(participant)} index={i} />
            ))}
          </div>
        </SidebarGroup>
      ) : null}

      {offline.length > 0 ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Offline</SidebarGroupLabel>
          <div className="flex flex-col">
            {offline.map((participant, i) => (
              <MemberRow key={participant.id} participant={participant} avatarUrl={urlFor(participant)} index={offlineStartIndex + i} />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
