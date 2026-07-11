import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { ContextPointerResponse, Participant, WorkspaceEvent } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { participantFirstName } from './participantDisplay';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';

export type TeammateDeltaPanelProps = {
  events?: WorkspaceEvent[];
  participants?: Participant[];
  pointer?: ContextPointerResponse | null;
  config?: TeambridgeClientConfig;
  error?: string;
  avatarRev?: number;
  onMarkSeen?: () => void;
};

const EVENT_TYPE_LABELS: Partial<Record<WorkspaceEvent['type'], string>> = {
  publish: 'published',
  team_ask: 'asked',
  team_reply: 'replied',
  conflict_detected: 'conflicted',
  conflict_resolved: 'resolved conflict',
  checkpoint_created: 'checkpointed'
};

function getEventTypeLabel(type: WorkspaceEvent['type']): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

export function TeammateDeltaPanel({
  events,
  participants = [],
  pointer,
  config,
  error,
  avatarRev,
  onMarkSeen
}: TeammateDeltaPanelProps) {
  const newEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    const lastSeen = pointer?.lastSeenSeq ?? 0;
    return events.filter((e) => e.seq > lastSeen).sort((a, b) => b.seq - a.seq);
  }, [events, pointer]);

  const grouped = useMemo(() => {
    const map = new Map<string, { displayName: string; events: WorkspaceEvent[] }>();
    for (const event of newEvents) {
      const participant = participants.find((p) => p.id === event.actorId);
      const displayName = participant?.displayName ?? event.actorId.replace(/^user_/, '');
      const existing = map.get(displayName) ?? { displayName, events: [] };
      existing.events.push(event);
      map.set(displayName, existing);
    }
    return [...map.values()];
  }, [newEvents, participants]);

  if (error) {
    return (
      <section aria-label="Teammate updates" className="py-2">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!events || newEvents.length === 0) {
    return (
      <section aria-label="Teammate updates" className="py-2">
        <p className="text-xs text-muted-foreground">No new teammate activity.</p>
      </section>
    );
  }

  return (
    <section aria-label="Teammate updates" className="flex flex-col py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="flex items-center justify-between">
          <span>New teammate activity</span>
          {onMarkSeen ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onMarkSeen}
              className="text-[10px]"
            >
              Mark seen
            </Button>
          ) : null}
        </SidebarGroupLabel>
        <div className="flex flex-col gap-3">
          {grouped.map((group, groupIndex) => {
            const avatarUrl = config ? avatarUrlForDisplayName(group.displayName, config, avatarRev) : undefined;
            return (
              <div key={group.displayName} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-2">
                  <ParticipantAvatar avatarUrl={avatarUrl} displayName={group.displayName} size={18} />
                  <span className="text-xs font-medium text-foreground">
                    {participantFirstName(group.displayName)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">({group.events.length} new)</span>
                </div>
                <div className="flex flex-col">
                  {group.events.map((event, i) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min((groupIndex + i) * 0.02, 0.15) }}
                      className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                    >
                      <span className="text-[10px] capitalize">{getEventTypeLabel(event.type)}</span>
                      {event.targetFile ? (
                        <span className="truncate text-[10px] text-muted-foreground/60">{event.targetFile}</span>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SidebarGroup>
    </section>
  );
}
