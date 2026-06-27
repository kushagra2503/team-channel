import type { ProjectMember } from '@teambridge/core';
import { motion } from 'motion/react';
import { SidebarContent } from '@/components/ui/sidebar';
import { ProjectMemberSidebar } from './ProjectMemberSidebar';

export type TeamSidebarProps = {
  open: boolean;
  members?: ProjectMember[];
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  /** Workspace ID of the currently selected track for avatar lookups */
  trackId?: string;
  onAvatarRev?: () => void;
};

const TEAM_SIDEBAR_WIDTH = 288; // w-72
const teamSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 };

export function TeamSidebar({
  open,
  members,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev,
  trackId
}: TeamSidebarProps) {
  return (
    <motion.aside
      data-slot="team-sidebar"
      className="hidden shrink-0 overflow-hidden md:block"
      initial={false}
      animate={{ width: open ? TEAM_SIDEBAR_WIDTH : 0 }}
      transition={teamSpring}
    >
      <div className="flex h-[calc(100svh-var(--header-height))] w-72 flex-col border-l bg-sidebar text-sidebar-foreground">
        <SidebarContent>
          <ProjectMemberSidebar
            members={members}
            error={error}
            daemonBaseUrl={daemonBaseUrl}
            repoRoot={repoRoot}
            avatarRev={avatarRev}
            trackId={trackId}
          />
        </SidebarContent>
      </div>
    </motion.aside>
  );
}
