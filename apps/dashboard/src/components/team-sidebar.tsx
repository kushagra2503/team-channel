import type { WorkspaceStatusResponse } from '@teambridge/core';
import { motion } from 'motion/react';
import { SidebarContent } from '@/components/ui/sidebar';
import { WorkspaceDetails } from './WorkspaceDetails';

export type TeamSidebarProps = {
  open: boolean;
  status?: WorkspaceStatusResponse;
  loading?: boolean;
  error?: string;
};

const TEAM_SIDEBAR_WIDTH = 288; // w-72
const teamSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 };

export function TeamSidebar({ open, status, loading, error }: TeamSidebarProps) {
  return (
    <motion.aside
      data-slot="team-sidebar"
      className="hidden shrink-0 overflow-hidden md:block"
      animate={{ width: open ? TEAM_SIDEBAR_WIDTH : 0 }}
      transition={teamSpring}
    >
      <div
        className="flex h-[calc(100svh-var(--header-height))] w-72 flex-col border-l bg-sidebar text-sidebar-foreground"
      >
        <SidebarContent>
          <WorkspaceDetails status={status} loading={loading} error={error} />
        </SidebarContent>
      </div>
    </motion.aside>
  );
}
