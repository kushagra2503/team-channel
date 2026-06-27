import { useState } from 'react';
import { motion } from 'motion/react';
import type { ProjectMember } from '@teambridge/core';
import { buildAvatarUrl } from '@/api/teambridgeClient';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { avatarColor, participantInitials, prettyParticipantName } from './participantDisplay';

export type ProjectMemberSidebarProps = {
  members?: ProjectMember[];
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  /** Workspace ID of any track in the project for avatar lookups */
  trackId?: string;
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

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 5 } as const;

function MemberRow({
  member,
  config,
  trackId,
  avatarRev,
  index
}: {
  member: ProjectMember;
  config: TeambridgeClientConfig;
  trackId?: string;
  avatarRev?: number;
  index: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const showDot = member.status !== 'offline';
  const avatarUrl = trackId && config.daemonBaseUrl
    ? buildAvatarUrl(trackId, member.id, config, avatarRev)
    : undefined;

  return (
    <motion.div
      initial={HIDE}
      animate={ENTER}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1], delay: index * 0.04 }}
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <div className="relative shrink-0">
        <div
          className="flex size-9 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: avatarColor(member.id) }}
        >
          {participantInitials(member.displayName)}
        </div>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className="absolute inset-0 size-9 rounded-full [image-rendering:pixelated] transition-opacity duration-200"
            style={{ opacity: imgLoaded ? 1 : 0 }}
          />
        ) : null}
        {showDot ? (
          <span
            className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-sidebar ${PRESENCE_DOT[member.status]}`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{prettyParticipantName(member.displayName)}</span>
        <span className="block truncate text-xs text-muted-foreground">{STATUS_LABEL[member.status]}</span>
      </div>
    </motion.div>
  );
}

export function ProjectMemberSidebar({
  members = [],
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev,
  trackId
}: ProjectMemberSidebarProps) {
  if (error) {
    return (
      <section aria-label="Team members" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  const online = members.filter((m) => m.status !== 'offline');
  const offline = members.filter((m) => m.status === 'offline');
  const total = members.length;
  const config: TeambridgeClientConfig = { daemonBaseUrl, repoRoot };
  const offlineStartIndex = online.length + 1;

  return (
    <section aria-label="Team members" className="flex flex-col gap-1 py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="tabular-nums">
          {total} {total === 1 ? 'Member' : 'Members'}
        </SidebarGroupLabel>
      </SidebarGroup>

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((member, i) => (
              <MemberRow
                key={member.id}
                member={member}
                config={config}
                trackId={trackId}
                avatarRev={avatarRev}
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
            {offline.map((member, i) => (
              <MemberRow
                key={member.id}
                member={member}
                config={config}
                trackId={trackId}
                avatarRev={avatarRev}
                index={offlineStartIndex + i}
              />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
