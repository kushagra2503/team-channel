import type { WorkspaceStatusResponse } from '@teambridge/core';
import { motion } from 'motion/react';
import { SidebarContent } from '@/components/ui/sidebar';
import { WorkspaceDetails } from './WorkspaceDetails';

export type TeamSidebarProps = {
  open: boolean;
  status?: WorkspaceStatusResponse;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  onAvatarRev?: () => void;
};

const TEAM_SIDEBAR_WIDTH = 288; // w-72
const teamSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 };

export function TeamSidebar({
  open,
  status,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev,
  onAvatarRev
}: TeamSidebarProps) {
  return (
    <motion.aside
      data-slot="team-sidebar"
      className="hidden shrink-0 overflow-hidden md:block"
      initial={false}
      animate={{ width: open ? TEAM_SIDEBAR_WIDTH : 0 }}
      transition={teamSpring}
    >
      <div
        className="flex h-[calc(100svh-var(--header-height))] w-72 flex-col border-l bg-sidebar text-sidebar-foreground"
      >
        <SidebarContent>
          <WorkspaceDetails
            status={status}
            error={error}
            daemonBaseUrl={daemonBaseUrl}
            repoRoot={repoRoot}
            avatarRev={avatarRev}
            onAvatarRev={onAvatarRev}
          />
        </SidebarContent>
      </div>
    </motion.aside>
  );
}
