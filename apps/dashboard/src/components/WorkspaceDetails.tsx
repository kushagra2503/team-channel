import type { Participant, WorkspaceStatusResponse } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import {
  avatarColor,
  participantActivity,
  participantInitials,
  prettyParticipantName
} from './participantDisplay';

export type WorkspaceDetailsProps = {
  status?: WorkspaceStatusResponse;
  loading?: boolean;
  error?: string;
};

const PRESENCE_DOT: Record<'active' | 'idle' | 'offline', string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  offline: 'bg-muted-foreground/40'
};

function MemberRow({ participant }: { participant: Participant }) {
  const activity = participantActivity(participant);
  const showDot = activity.tone === 'active' || activity.tone === 'idle';

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <div className="relative shrink-0">
        <div
          className="flex size-9 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: avatarColor(participant.id) }}
        >
          {participantInitials(participant.displayName)}
        </div>
        {showDot ? (
          <span
            className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-sidebar ${PRESENCE_DOT[activity.tone]}`}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{prettyParticipantName(participant.displayName)}</span>
        <span className="block truncate text-xs text-muted-foreground">{activity.label}</span>
      </div>
    </div>
  );
}

export function WorkspaceDetails({ status, loading = false, error }: WorkspaceDetailsProps) {
  if (loading) {
    return (
      <section aria-label="Workspace details" className="p-3 text-sm text-muted-foreground">
        Loading workspace details...
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Workspace details" className="p-3">
        <p role="alert" className="text-destructive">{error}</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section aria-label="Workspace details" className="p-3 text-sm text-muted-foreground">
        Select a workspace to inspect participants and branches.
      </section>
    );
  }

  const online = status.participants.filter((participant) => participant.status !== 'offline');
  const offline = status.participants.filter((participant) => participant.status === 'offline');
  const total = status.participants.length;

  return (
    <section aria-label="Workspace details" className="flex flex-col gap-1 py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="tabular-nums">
          {total} {total === 1 ? 'Member' : 'Members'}
        </SidebarGroupLabel>
      </SidebarGroup>

      {online.length > 0 ? (
        <SidebarGroup className="py-1">
          <div className="flex flex-col">
            {online.map((participant) => (
              <MemberRow key={participant.id} participant={participant} />
            ))}
          </div>
        </SidebarGroup>
      ) : null}

      {offline.length > 0 ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Offline</SidebarGroupLabel>
          <div className="flex flex-col">
            {offline.map((participant) => (
              <MemberRow key={participant.id} participant={participant} />
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
