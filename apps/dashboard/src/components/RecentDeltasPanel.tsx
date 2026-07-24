import type { ContextDelta } from '@coord/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { formatRelativeTime } from '@/lib/relative-time';

export type RecentDeltasPanelProps = {
  deltas?: ContextDelta[];
  error?: string;
};

export function RecentDeltasPanel({ deltas, error }: RecentDeltasPanelProps) {
  if (error) {
    return (
      <section aria-label="Recent teammate deltas" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  return (
    <section aria-label="Recent teammate deltas" className="py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Recent Deltas</SidebarGroupLabel>
        {!deltas ? (
          <p className="px-2 text-xs text-muted-foreground">Loading teammate updates...</p>
        ) : deltas.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No recent teammate updates.</p>
        ) : (
          <div className="flex flex-col gap-2 px-2">
            {deltas.map((delta) => (
              <article key={`${delta.seq}-${delta.targetFile}`} className="rounded-lg border bg-background/60 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{delta.author ?? delta.actorId}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">seq {delta.seq}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {delta.targetFile} - {formatRelativeTime(delta.createdAt) || 'recently'}
                </p>
                <p className="mt-1 line-clamp-3 text-muted-foreground">{delta.text.replace(/\s+/g, ' ')}</p>
              </article>
            ))}
          </div>
        )}
      </SidebarGroup>
    </section>
  );
}
