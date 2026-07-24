import { motion } from 'motion/react';
import type { RelayStatusResponse } from '@coord/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';

export type RelaySyncHealthProps = {
  status?: RelayStatusResponse;
  error?: string;
};

const BADGE_STYLES: Record<string, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-500/15 text-emerald-600' },
  'not-logged-in': { label: 'Not logged in', className: 'bg-amber-500/15 text-amber-600' },
  'local-only': { label: 'Local only', className: 'bg-muted text-muted-foreground' }
};

function getBadgeStyle(status: RelayStatusResponse): { label: string; className: string } {
  if (!status.configured) return BADGE_STYLES['local-only'];
  if (!status.loggedIn) return BADGE_STYLES['not-logged-in'];
  return BADGE_STYLES.connected;
}

function syncTimeLabel(iso: string | null): string {
  return formatRelativeTime(iso) || 'Never';
}

export function RelaySyncHealth({ status, error }: RelaySyncHealthProps) {
  if (error) {
    return (
      <section aria-label="Relay sync health" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section aria-label="Relay sync health" className="py-2">
        <p className="text-xs text-muted-foreground">Loading relay status…</p>
      </section>
    );
  }

  const badge = getBadgeStyle(status);
  const showSyncList = status.configured && status.sync.length > 0;

  return (
    <section aria-label="Relay sync health" className="flex flex-col py-2">
      <div className="flex items-center gap-2 px-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', badge.className)}>
          {badge.label}
        </span>
        {status.pending > 0 ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">
            {status.pending} pending
          </span>
        ) : null}
      </div>

      {showSyncList ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Sync State</SidebarGroupLabel>
          <div className="flex flex-col">
            {status.sync.map((entry, i) => (
              <motion.div
                key={entry.workspaceId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-2 px-2 py-1 text-xs"
              >
                <span className="truncate text-muted-foreground">{entry.workspaceId}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground/60">
                  seq {entry.lastRemoteSeq}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[11px]',
                    entry.relayStatus === 'online' && 'text-emerald-600',
                    entry.relayStatus === 'offline' && 'text-red-500',
                    entry.relayStatus === 'error' && 'text-red-500',
                    entry.relayStatus === 'queued' && 'text-amber-600',
                    !['online', 'offline', 'error', 'queued'].includes(entry.relayStatus) && 'text-muted-foreground/60'
                  )}
                >
                  {entry.relayStatus}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/50">
                  {syncTimeLabel(entry.lastSyncedAt)}
                </span>
                {entry.lastError ? (
                  <span className="truncate text-[11px] text-destructive">{entry.lastError}</span>
                ) : null}
              </motion.div>
            ))}
          </div>
        </SidebarGroup>
      ) : null}
    </section>
  );
}
