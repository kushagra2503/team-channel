import { motion } from 'motion/react';
import type { Participant, WorkspaceStatusResponse } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { prettyParticipantName } from './participantDisplay';
import { columnEnterTransition, COLUMN_ENTER, COLUMN_HIDE } from '@/lib/motion';

export type TrackParticipantsPanelProps = {
  status?: WorkspaceStatusResponse;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  columnIndex?: number;
};

const PRESENCE_DOT: Record<'active' | 'idle' | 'offline', string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  offline: 'bg-muted-foreground/40'
};

const STATUS_LABEL: Record<'active' | 'idle' | 'offline', string> = {
  active: 'Active',
  idle: 'Idle',
  offline: 'Offline'
};

const ENTER = COLUMN_ENTER;
const HIDE = COLUMN_HIDE;

function MemberRow({
  participant,
  avatarUrl,
  index,
  columnIndex
}: {
  participant: Participant;
  avatarUrl?: string;
  index: number;
  columnIndex: number;
}) {
  const showDot = participant.status !== 'offline';

  return (
    <motion.div
      initial={HIDE}
      animate={ENTER}
      transition={columnEnterTransition(columnIndex, index)}
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
            className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-sidebar ${PRESENCE_DOT[participant.status]}`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {prettyParticipantName(participant.displayName)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {STATUS_LABEL[participant.status]}
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
  avatarRev,
  columnIndex = 2
}: TrackParticipantsPanelProps) {
  if (error) {
    return (
      <section aria-label="Track participants" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section aria-label="Track participants" className="py-2">
        <p className="px-3 text-xs text-muted-foreground">Select a track to see participants.</p>
      </section>
    );
  }

  const online = status.participants.filter((p) => p.status !== 'offline');
  const offline = status.participants.filter((p) => p.status === 'offline');
  const total = status.participants.length;
  const trackId = status.workspace.id;
  const config = { daemonBaseUrl, repoRoot };

  const urlFor = (participant: Participant) =>
    avatarUrlForDisplayName(participant.displayName, config, avatarRev);

  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Track participants" className="flex flex-col gap-1 py-2">
      {total === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No participants on this track yet.</p>
      ) : null}

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((participant, i) => (
              <MemberRow
                key={`${trackId}-${participant.id}`}
                participant={participant}
                avatarUrl={urlFor(participant)}
                index={i}
                columnIndex={columnIndex}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}

      {offline.length > 0 ? (
        <SidebarGroup key={`${trackId}-offline`} className="py-1">
          <motion.div
            key={`${trackId}-offline-label`}
            initial={HIDE}
            animate={ENTER}
            transition={columnEnterTransition(columnIndex, online.length)}
          >
            <SidebarGroupLabel>Offline</SidebarGroupLabel>
          </motion.div>
          <div className="flex flex-col">
            {offline.map((participant, i) => (
              <MemberRow
                key={`${trackId}-${participant.id}`}
                participant={participant}
                avatarUrl={urlFor(participant)}
                index={offlineStartIndex + i}
                columnIndex={columnIndex}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
