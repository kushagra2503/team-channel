import { motion } from 'motion/react';
import type { VaultCheckpoint } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export type CheckpointStateProps = {
  latestCheckpoint?: VaultCheckpoint;
  className?: string;
};

const ENTER = { opacity: 0, y: 8 };
const ANIMATE = { opacity: 1, y: 0 };

/** Format an ISO timestamp as a short "X ago" string, mirroring sidebar panel copy. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return 'recently';
  }

  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Truncate a checkpoint hash to its first 8 characters for display. */
export function truncateHash(hash: string): string {
  return hash.slice(0, 8);
}

export function CheckpointState({ latestCheckpoint, className }: CheckpointStateProps) {
  if (!latestCheckpoint) {
    return (
      <section aria-label="Checkpoint state" className={cn('py-2', className)}>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Checkpoint</SidebarGroupLabel>
          <motion.div
            initial={ENTER}
            animate={ANIMATE}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="px-2 py-1"
          >
            <p className="text-sm font-medium text-muted-foreground">No checkpoints yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground/80">
              Checkpoints will appear here once the relay builds them
            </p>
          </motion.div>
        </SidebarGroup>
      </section>
    );
  }

  const { seq, createdAt, hash, createdByDeviceId } = latestCheckpoint;
  const deviceId = createdByDeviceId.trim() ? createdByDeviceId : 'Unknown device';

  return (
    <section aria-label="Checkpoint state" className={cn('py-2', className)}>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Checkpoint</SidebarGroupLabel>
        <motion.dl
          initial={ENTER}
          animate={ANIMATE}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="flex flex-col gap-1 px-2 py-1 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Seq</dt>
            <dd className="font-medium tabular-nums">{seq}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-muted-foreground/90">{formatRelativeTime(createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Hash</dt>
            <dd className="font-mono text-[11px] text-muted-foreground/90">{truncateHash(hash)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Device</dt>
            <dd className="truncate text-muted-foreground/90" title={deviceId}>{deviceId}</dd>
          </div>
        </motion.dl>
      </SidebarGroup>
    </section>
  );
}
