import { motion } from 'motion/react';
import type { Participant, WorkspaceStatusResponse } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import {
  participantActivity,
  prettyParticipantName
} from './participantDisplay';

export type TrackParticipantsPanelProps = {
  status?: WorkspaceStatusResponse;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
};

const PRESENCE_DOT: Record<'active' | 'idle' | 'offline', string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  offline: 'bg-muted-foreground/40'
};

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 5 } as const;

function MemberRow({
  participant,
  avatarUrl,
  index
}: {
  participant: Participant;
  avatarUrl?: string;
  index: number;
}) {
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
        <span className="block truncate text-sm font-medium">
          {prettyParticipantName(participant.displayName)}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {participant.branch}
        </span>
      </div>
    </motion.div>
  );
}

export function TrackParticipantsPanel({
  status,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev
}: TrackParticipantsPanelProps) {
  if (error) {
    return (
      <section aria-label="Track participants" className="p-3">
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

  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Track participants" className="flex flex-col gap-1 border-t border-sidebar-border py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="tabular-nums">
          {total === 0
            ? 'On this track'
            : `${total} on this track`}
        </SidebarGroupLabel>
      </SidebarGroup>

      {total === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No participants yet.</p>
      ) : null}

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((participant, i) => (
              <MemberRow
                key={participant.id}
                participant={participant}
                avatarUrl={urlFor(participant)}
                index={i}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}

      {offline.length > 0 ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Offline</SidebarGroupLabel>
          <div className="flex flex-col">
            {offline.map((participant, i) => (
              <MemberRow
                key={participant.id}
                participant={participant}
                avatarUrl={urlFor(participant)}
                index={offlineStartIndex + i}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
