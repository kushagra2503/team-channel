import { useState } from 'react';
import { motion } from 'motion/react';
import type { Participant, WorkspaceEvent, WorkspaceEventType } from '@coord/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { participantFirstName } from './participantDisplay';
import type { CoordClientConfig } from '@/api/coordClient';

export type EventFeedProps = {
  events?: WorkspaceEvent[];
  error?: string;
  participants?: Participant[];
  config?: CoordClientConfig;
  avatarRev?: number;
  maxItems?: number;
};

const EVENT_TYPE_STYLES: Partial<Record<WorkspaceEventType, { label: string; className: string }>> = {
  publish: { label: 'publish', className: 'bg-blue-500/15 text-blue-600' },
  conflict_detected: { label: 'conflict', className: 'bg-red-500/15 text-red-600' },
  conflict_resolved: { label: 'resolved', className: 'bg-emerald-500/15 text-emerald-600' },
  checkpoint_created: { label: 'checkpoint', className: 'bg-emerald-500/15 text-emerald-600' },
  team_ask: { label: 'ask', className: 'bg-amber-500/15 text-amber-600' },
  team_reply: { label: 'reply', className: 'bg-amber-500/15 text-amber-600' },
  vault_patch: { label: 'patch', className: 'bg-muted text-muted-foreground' }
};

function getEventTypeStyle(type: WorkspaceEventType): { label: string; className: string } {
  return EVENT_TYPE_STYLES[type] ?? { label: type, className: 'bg-muted text-muted-foreground' };
}

export function EventFeed({ events, error, participants = [], config, avatarRev, maxItems = 8 }: EventFeedProps) {
  const [showAll, setShowAll] = useState(false);

  if (error) {
    return (
      <section aria-label="Event feed" className="py-2">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!events || events.length === 0) {
    return (
      <section aria-label="Event feed" className="py-2">
        <p className="text-xs text-muted-foreground">No events yet.</p>
      </section>
    );
  }

  const sorted = [...events].sort((a, b) => b.seq - a.seq);
  const visible = showAll ? sorted : sorted.slice(0, maxItems);
  const hasMore = !showAll && sorted.length > maxItems;

  return (
    <section aria-label="Event feed" className="flex flex-col py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Recent Events</SidebarGroupLabel>
        <div className="flex flex-col">
          {visible.map((event, i) => {
            const typeStyle = getEventTypeStyle(event.type);
            const participant = participants.find((p) => p.id === event.actorId);
            const displayName = participant?.displayName ?? event.actorId.replace(/^user_/, '');
            const avatarUrl = config ? avatarUrlForDisplayName(displayName, config, avatarRev) : undefined;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.15) }}
                className="flex items-center gap-2 px-2 py-1 text-xs"
              >
                <span
                  className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', typeStyle.className)}
                >
                  {typeStyle.label}
                </span>
                <ParticipantAvatar
                  avatarUrl={avatarUrl}
                  displayName={displayName}
                  size={16}
                />
                <span className="truncate text-muted-foreground">{participantFirstName(displayName)}</span>
                {event.targetFile ? (
                  <span className="truncate text-[11px] text-muted-foreground/60">{event.targetFile}</span>
                ) : null}
                <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/50">
                  {formatRelativeTime(event.createdAt)}
                </span>
              </motion.div>
            );
          })}
          {hasMore ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Show all ({sorted.length})
            </button>
          ) : null}
        </div>
      </SidebarGroup>
    </section>
  );
}
