import { useState } from 'react';
import type { WorkspaceStatusResponse } from '@teambridge/core';
import type { ProjectMember } from '@teambridge/core';
import { motion } from 'motion/react';
import { SidebarContent } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ProjectMemberSidebar } from './ProjectMemberSidebar';
import { TrackParticipantsPanel } from './TrackParticipantsPanel';

export type MembersView = 'all' | 'track';

export type TeamSidebarProps = {
  open: boolean;
  members?: ProjectMember[];
  trackStatus?: WorkspaceStatusResponse;
  trackError?: string;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  avatarRev?: number;
  onAvatarRev?: () => void;
  columnIndex?: number;
  staggerKey?: string;
};

const TEAM_SIDEBAR_WIDTH = 288; // w-72
const teamSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const tabSpring = { type: 'spring' as const, duration: 0.28, bounce: 0.12 };

const TABS: { id: MembersView; label: string }[] = [
  { id: 'all', label: 'All Members' },
  { id: 'track', label: 'This Track' }
];

function MembersViewTabs({
  view,
  onViewChange
}: {
  view: MembersView;
  onViewChange: (view: MembersView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Members view"
      className="grid shrink-0 grid-cols-2 gap-1 p-2"
    >
      {TABS.map((tab) => {
        const selected = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onViewChange(tab.id)}
            className={cn(
              'relative rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              selected ? 'text-sidebar-foreground' : 'text-muted-foreground hover:text-sidebar-foreground'
            )}
          >
            {selected ? (
              <motion.span
                layoutId="members-view-indicator"
                className="absolute inset-0 rounded-md bg-sidebar-accent"
                transition={tabSpring}
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TeamSidebar({
  open,
  members,
  trackStatus,
  trackError,
  error,
  daemonBaseUrl,
  repoRoot,
  avatarRev,
  columnIndex,
  staggerKey
}: TeamSidebarProps) {
  const [view, setView] = useState<MembersView>('all');

  return (
    <motion.aside
      data-slot="team-sidebar"
      className="hidden shrink-0 overflow-hidden md:block"
      initial={false}
      animate={{ width: open ? TEAM_SIDEBAR_WIDTH : 0 }}
      transition={teamSpring}
    >
      <div className="flex h-[calc(100svh-var(--header-height))] w-72 flex-col border-l bg-sidebar text-sidebar-foreground">
        <MembersViewTabs view={view} onViewChange={setView} />
        <SidebarContent className="min-h-0 flex-1 overflow-y-auto">
          {view === 'all' ? (
            <ProjectMemberSidebar
              members={members}
              error={error}
              daemonBaseUrl={daemonBaseUrl}
              repoRoot={repoRoot}
              avatarRev={avatarRev}
              columnIndex={columnIndex}
              staggerKey={staggerKey}
            />
          ) : (
            <TrackParticipantsPanel
              status={trackStatus}
              error={trackError}
              daemonBaseUrl={daemonBaseUrl}
              repoRoot={repoRoot}
              avatarRev={avatarRev}
              columnIndex={columnIndex}
            />
          )}
        </SidebarContent>
      </div>
    </motion.aside>
  );
}
