import { motion } from 'motion/react';
import type { WorkspaceEvent, WorkspaceEventType } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';

export type EventFeedProps = {
  events?: WorkspaceEvent[];
  error?: string;
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

export function EventFeed({ events, error, maxItems = 20 }: EventFeedProps) {
  if (error) {
    return (
      <section aria-label="Event feed" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!events || events.length === 0) {
    return (
      <section aria-label="Event feed" className="py-2">
        <p className="px-3 text-xs text-muted-foreground">No events yet.</p>
      </section>
    );
  }

  const sorted = [...events].sort((a, b) => b.seq - a.seq).slice(0, maxItems);

  return (
    <section aria-label="Event feed" className="flex flex-col gap-1 py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Recent Events</SidebarGroupLabel>
        <div className="flex flex-col gap-1 px-2">
          {sorted.map((event, i) => {
            const typeStyle = getEventTypeStyle(event.type);
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-md px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', typeStyle.className)}
                  >
                    {typeStyle.label}
                  </span>
                  <span className="truncate text-muted-foreground">{event.actorId}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
                {event.targetFile ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{event.targetFile}</p>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </SidebarGroup>
    </section>
  );
}
