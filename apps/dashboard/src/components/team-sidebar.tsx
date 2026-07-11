import { useMemo, useState } from 'react';
import type {
  Conflict,
  ContextPointerResponse,
  InboxMessage,
  LocalUserProfile,
  RelayStatusResponse,
  VaultCheckpoint,
  WorkspaceEvent,
  WorkspaceStatusResponse
} from '@teambridge/core';
import type { ProjectMember } from '@teambridge/core';
import { motion } from 'motion/react';
import { SidebarContent } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ProjectMemberSidebar } from './ProjectMemberSidebar';
import { TrackParticipantsPanel } from './TrackParticipantsPanel';
import { RelaySyncHealth } from './RelaySyncHealth';
import { EventFeed } from './EventFeed';
import { CheckpointState } from './CheckpointState';
import { InboxPanel } from './InboxPanel';
import { ConflictsPanel } from './ConflictsPanel';
import { TeammateDeltaPanel } from './TeammateDeltaPanel';
import { displayNamesMatch, type PinnedLocalUser } from './participantDisplay';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';

export type TeamSidebarTab = 'team' | 'inbox' | 'conflicts' | 'updates';
export type MembersView = 'all' | 'track' | 'relay';

export type TeamSidebarProps = {
  open: boolean;
  members?: ProjectMember[];
  localUser?: LocalUserProfile | null;
  trackStatus?: WorkspaceStatusResponse;
  trackError?: string;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  localAvatarVersion?: string;
  avatarRev?: number;
  onAvatarRev?: () => void;
  columnIndex?: number;
  staggerKey?: string;
  relayStatus?: RelayStatusResponse;
  relayError?: string;
  events?: WorkspaceEvent[];
  eventsError?: string;
  latestCheckpoint?: VaultCheckpoint;
  inboxMessages?: InboxMessage[];
  inboxError?: string;
  onInboxReply?: (message: InboxMessage) => void;
  conflicts?: Conflict[];
  conflictsError?: string;
  onConflictResolve?: (conflict: Conflict) => void;
  pointer?: ContextPointerResponse | null;
  pointerError?: string;
  onMarkSeen?: () => void;
};

const TEAM_SIDEBAR_WIDTH = 288; // w-72
const teamSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const tabSpring = { type: 'spring' as const, duration: 0.28, bounce: 0.12 };

const TOP_TABS: { id: TeamSidebarTab; label: string }[] = [
  { id: 'team', label: 'Team' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'updates', label: 'Updates' }
];

const MEMBER_TABS: { id: MembersView; label: string }[] = [
  { id: 'all', label: 'All Members' },
  { id: 'track', label: 'This Track' },
  { id: 'relay', label: 'Relay' }
];

function TabBar<T extends string>({
  tabs,
  selected,
  onSelect,
  layoutId,
  ariaLabel
}: {
  tabs: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  layoutId: string;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="grid shrink-0 grid-cols-4 gap-1 p-2">
      {tabs.map((tab) => {
        const isSelected = selected === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'relative rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
              isSelected ? 'text-sidebar-foreground' : 'text-muted-foreground hover:text-sidebar-foreground'
            )}
          >
            {isSelected ? (
              <motion.span
                layoutId={layoutId}
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
      className="grid shrink-0 grid-cols-3 gap-1 p-2"
    >
      {MEMBER_TABS.map((tab) => {
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
  localUser,
  trackStatus,
  trackError,
  error,
  daemonBaseUrl,
  repoRoot,
  localAvatarVersion,
  avatarRev,
  columnIndex,
  staggerKey,
  relayStatus,
  relayError,
  events,
  eventsError,
  latestCheckpoint,
  inboxMessages,
  inboxError,
  onInboxReply,
  conflicts,
  conflictsError,
  onConflictResolve,
  pointer,
  pointerError,
  onMarkSeen
}: TeamSidebarProps) {
  const [tab, setTab] = useState<TeamSidebarTab>('team');
  const [membersView, setMembersView] = useState<MembersView>('all');

  const pinnedLocalUser = useMemo<PinnedLocalUser | null>(() => {
    if (!localUser) return null;
    if (membersView === 'all' || membersView === 'relay') {
      const member = members?.find((m) => displayNamesMatch(m.displayName, localUser.displayName));
      return { displayName: localUser.displayName, status: member?.status ?? 'active' };
    }
    const participant = trackStatus?.participants.find((p) =>
      displayNamesMatch(p.displayName, localUser.displayName)
    );
    return { displayName: localUser.displayName, status: participant?.status ?? 'active' };
  }, [localUser, membersView, members, trackStatus?.participants]);

  const config = useMemo(
    () => ({ daemonBaseUrl, repoRoot }) as TeambridgeClientConfig,
    [daemonBaseUrl, repoRoot]
  );

  return (
    <motion.aside
      data-slot="team-sidebar"
      className="hidden shrink-0 overflow-hidden md:block"
      initial={false}
      animate={{ width: open ? TEAM_SIDEBAR_WIDTH : 0 }}
      transition={teamSpring}
    >
      <div className="flex h-[calc(100svh-var(--header-height))] w-72 flex-col border-l bg-sidebar text-sidebar-foreground">
        <TabBar
          tabs={TOP_TABS}
          selected={tab}
          onSelect={setTab}
          layoutId="team-sidebar-tab-indicator"
          ariaLabel="Team sidebar"
        />
        <SidebarContent className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'team' ? (
            <>
              <MembersViewTabs view={membersView} onViewChange={setMembersView} />
              {membersView === 'all' ? (
                <ProjectMemberSidebar
                  members={members}
                  localUser={pinnedLocalUser}
                  localAvatarVersion={localAvatarVersion}
                  error={error}
                  daemonBaseUrl={daemonBaseUrl}
                  repoRoot={repoRoot}
                  avatarRev={avatarRev}
                  columnIndex={columnIndex}
                  staggerKey={staggerKey}
                />
              ) : membersView === 'track' ? (
                <TrackParticipantsPanel
                  status={trackStatus}
                  localUser={pinnedLocalUser}
                  localAvatarVersion={localAvatarVersion}
                  error={trackError}
                  daemonBaseUrl={daemonBaseUrl}
                  repoRoot={repoRoot}
                  avatarRev={avatarRev}
                  columnIndex={columnIndex}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <RelaySyncHealth status={relayStatus} error={relayError} />
                  <EventFeed
                    events={events}
                    error={eventsError}
                    participants={trackStatus?.participants}
                    config={config}
                    avatarRev={avatarRev}
                  />
                  <CheckpointState latestCheckpoint={latestCheckpoint} />
                </div>
              )}
            </>
          ) : tab === 'inbox' ? (
            <InboxPanel
              messages={inboxMessages}
              localUser={localUser}
              participants={trackStatus?.participants}
              config={config}
              workspaceId={trackStatus?.workspace.id}
              error={inboxError}
              avatarRev={avatarRev}
              onReply={onInboxReply}
            />
          ) : tab === 'conflicts' ? (
            <ConflictsPanel
              conflicts={conflicts}
              config={config}
              workspaceId={trackStatus?.workspace.id}
              error={conflictsError}
              onResolve={onConflictResolve}
            />
          ) : (
            <TeammateDeltaPanel
              events={events}
              participants={trackStatus?.participants}
              pointer={pointer}
              config={config}
              error={pointerError}
              avatarRev={avatarRev}
              onMarkSeen={onMarkSeen}
            />
          )}
        </SidebarContent>
      </div>
    </motion.aside>
  );
}
