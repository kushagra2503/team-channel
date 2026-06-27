import { memo } from 'react';
import { motion } from 'motion/react';
import type { ProjectMember } from '@teambridge/core';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { prettyParticipantName, displayNamesMatch, type PinnedLocalUser } from './participantDisplay';
import { columnEnterTransition, COLUMN_ENTER, COLUMN_HIDE } from '@/lib/motion';

export type ProjectMemberSidebarProps = {
  members?: ProjectMember[];
  localUser?: PinnedLocalUser | null;
  localAvatarVersion?: string;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number | string;
  columnIndex?: number;
  staggerKey?: string;
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
};

const MemberRow = memo(function MemberRow({
  row,
  config,
  avatarRev,
  index,
  columnIndex
}: {
  row: MemberRowData;
  config: TeambridgeClientConfig;
  avatarRev?: number | string;
  index: number;
  columnIndex: number;
}) {
  const showDot = row.status !== 'offline';
  const avatarUrl = avatarUrlForDisplayName(row.displayName, config, row.avatarRev ?? avatarRev);

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
      </div>
    </motion.div>
  );
});

function buildMemberRows(
  members: ProjectMember[],
  localUser?: PinnedLocalUser | null,
  localAvatarVersion?: string
): {
  online: MemberRowData[];
  offline: MemberRowData[];
} {
  const roster = localUser
    ? members.filter((m) => !displayNamesMatch(m.displayName, localUser.displayName))
    : members;

  const online: MemberRowData[] = [];
  const offline: MemberRowData[] = [];

  if (localUser) {
    const youRow: MemberRowData = {
      key: '__local_user__',
      displayName: localUser.displayName,
      status: localUser.status,
      isYou: true,
      avatarRev: localAvatarVersion
    };
    if (localUser.status === 'offline') {
      offline.push(youRow);
    } else {
      online.push(youRow);
    }
  }

  for (const member of roster) {
    const row: MemberRowData = {
      key: member.id,
      displayName: member.displayName,
      status: member.status
    };
    if (member.status === 'offline') {
      offline.push(row);
    } else {
      online.push(row);
    }
  }

  return { online, offline };
}

export function ProjectMemberSidebar({
  members = [],
  localUser,
  localAvatarVersion,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev,
  columnIndex = 2,
  staggerKey
}: ProjectMemberSidebarProps) {
  if (error) {
    return (
      <section aria-label="Project team" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  const { online, offline } = buildMemberRows(members, localUser, localAvatarVersion);
  const config: TeambridgeClientConfig = { daemonBaseUrl, repoRoot };
  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Project team" className="flex flex-col py-2">
      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((row, i) => (
              <MemberRow
                key={staggerKey ? `${staggerKey}-${row.key}` : row.key}
                row={row}
                config={config}
                avatarRev={avatarRev}
                index={i}
                columnIndex={columnIndex}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : online.length === 0 && offline.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No project members yet.</p>
      ) : null}

      {offline.length > 0 ? (
        <SidebarGroup key={staggerKey ? `${staggerKey}-offline` : 'offline'} className="py-1">
          <motion.div
            key={staggerKey ? `${staggerKey}-offline-label` : 'offline-label'}
            initial={HIDE}
            animate={ENTER}
            transition={columnEnterTransition(columnIndex, online.length)}
          >
            <SidebarGroupLabel>Offline</SidebarGroupLabel>
          </motion.div>
          <div className="flex flex-col">
            {offline.map((row, i) => (
              <MemberRow
                key={staggerKey ? `${staggerKey}-${row.key}` : row.key}
                row={row}
                config={config}
                avatarRev={avatarRev}
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
