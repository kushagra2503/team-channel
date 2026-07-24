import { motion } from 'motion/react';
import type { Participant, WorktreeInfo, WorkspaceStatusResponse } from '@coord/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { openRepoPath, type CoordClientConfig } from '@/api/coordClient';
import { prettyParticipantName, displayNamesMatch, type PinnedLocalUser } from './participantDisplay';
import { columnEnterTransition, COLUMN_ENTER, COLUMN_HIDE } from '@/lib/motion';
import { formatRelativeTime } from '@/lib/relative-time';

export type TrackParticipantsPanelProps = {
  status?: WorkspaceStatusResponse;
  localUser?: PinnedLocalUser | null;
  localAvatarVersion?: string;
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

type MemberRowData = {
  key: string;
  displayName: string;
  status: 'active' | 'idle' | 'offline';
  isYou?: boolean;
  avatarRev?: string;
  branch?: string;
  agent?: string;
  worktreePath?: string;
  lastSeenAt?: string;
};

function MemberRow({
  row,
  avatarUrl,
  index,
  columnIndex,
  config
}: {
  row: MemberRowData;
  avatarUrl?: string;
  index: number;
  columnIndex: number;
  config: CoordClientConfig;
}) {
  const showDot = row.status !== 'offline';
  const meta = [row.agent, row.branch].filter(Boolean).join(' · ');

  const handleOpenWorktree = () => {
    if (!row.worktreePath) return;
    void openRepoPath(config, row.worktreePath);
  };

  return (
    <motion.div
      initial={HIDE}
      animate={ENTER}
      transition={columnEnterTransition(columnIndex, index)}
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <div className="relative shrink-0">
        <ParticipantAvatar avatarUrl={avatarUrl} displayName={row.displayName} size={36} />
        {showDot ? (
          <span
            className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-sidebar ${PRESENCE_DOT[row.status]}`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {prettyParticipantName(row.displayName)}
          {row.isYou ? <span className="text-muted-foreground"> (You)</span> : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{STATUS_LABEL[row.status]}</span>
        {row.lastSeenAt && row.status !== 'active' ? (
          <span className="block truncate text-[11px] text-muted-foreground/70">
            last seen {formatRelativeTime(row.lastSeenAt)}
          </span>
        ) : null}
        {meta ? <span className="block truncate text-[11px] text-muted-foreground/80">{meta}</span> : null}
      </div>
      {row.worktreePath ? (
        <button
          type="button"
          onClick={handleOpenWorktree}
          className="shrink-0 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={row.worktreePath}
        >
          Enter
        </button>
      ) : null}
    </motion.div>
  );
}

function buildMemberRows(
  participants: Participant[],
  worktrees: WorktreeInfo[] = [],
  localUser?: PinnedLocalUser | null,
  localAvatarVersion?: string
): {
  online: MemberRowData[];
  offline: MemberRowData[];
} {
  const worktreeByUserId = new Map(worktrees.map((worktree) => [worktree.userId, worktree]));
  const roster = localUser
    ? participants.filter((p) => !displayNamesMatch(p.displayName, localUser.displayName))
    : participants;

  const online: MemberRowData[] = [];
  const offline: MemberRowData[] = [];

  if (localUser) {
    const matchingParticipant = participants.find((p) => displayNamesMatch(p.displayName, localUser.displayName));
    const youRow: MemberRowData = {
      key: matchingParticipant?.id ?? '__local_user__',
      displayName: localUser.displayName,
      status: localUser.status,
      isYou: true,
      avatarRev: localAvatarVersion,
      branch: matchingParticipant?.branch,
      agent: matchingParticipant?.agent,
      worktreePath: matchingParticipant ? worktreeByUserId.get(matchingParticipant.id)?.path : undefined,
      lastSeenAt: matchingParticipant?.lastSeenAt
    };
    if (localUser.status === 'offline') {
      offline.push(youRow);
    } else {
      online.push(youRow);
    }
  }

  for (const participant of roster) {
    const row: MemberRowData = {
      key: participant.id,
      displayName: participant.displayName,
      status: participant.status,
      branch: participant.branch,
      agent: participant.agent,
      worktreePath: worktreeByUserId.get(participant.id)?.path,
      lastSeenAt: participant.lastSeenAt
    };
    if (participant.status === 'offline') {
      offline.push(row);
    } else {
      online.push(row);
    }
  }

  return { online, offline };
}

export function TrackParticipantsPanel({
  status,
  localUser,
  localAvatarVersion,
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

  const { online, offline } = buildMemberRows(status.participants, status.worktrees, localUser, localAvatarVersion);
  const trackId = status.workspace.id;
  const config = { daemonBaseUrl, repoRoot };
  const urlFor = (row: MemberRowData) =>
    avatarUrlForDisplayName(row.displayName, config, row.avatarRev ?? avatarRev);
  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Track participants" className="flex flex-col gap-1 py-2">
      {online.length === 0 && offline.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No participants on this track yet.</p>
      ) : null}

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((row, i) => (
              <MemberRow
                key={`${trackId}-${row.key}`}
                row={row}
                avatarUrl={urlFor(row)}
                index={i}
                columnIndex={columnIndex}
                config={config}
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
            {offline.map((row, i) => (
              <MemberRow
                key={`${trackId}-${row.key}`}
                row={row}
                avatarUrl={urlFor(row)}
                index={offlineStartIndex + i}
                columnIndex={columnIndex}
                config={config}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
