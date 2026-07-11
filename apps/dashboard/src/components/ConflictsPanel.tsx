import { useState } from 'react';
import { motion } from 'motion/react';
import type { Conflict } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';
import { resolveConflict } from '@/api/teambridgeClient';

export type ConflictsPanelProps = {
  conflicts?: Conflict[];
  config?: TeambridgeClientConfig;
  workspaceId?: string;
  error?: string;
  onResolve?: (conflict: Conflict) => void;
};

const STATUS_STYLES: Record<Conflict['status'], { label: string; className: string }> = {
  open: { label: 'open', className: 'bg-red-500/15 text-red-600' },
  resolved: { label: 'resolved', className: 'bg-emerald-500/15 text-emerald-600' }
};

export function ConflictsPanel({ conflicts, config, workspaceId, error, onResolve }: ConflictsPanelProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Conflicts" className="py-2">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <section aria-label="Conflicts" className="py-2">
        <p className="text-xs text-muted-foreground">No conflicts detected.</p>
      </section>
    );
  }

  const sorted = [...conflicts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleResolve = async (conflictId: string) => {
    if (!resolutionText.trim() || !workspaceId || !config) return;
    setSubmitting(true);
    setResolveError(null);
    try {
      const resolved = await resolveConflict(workspaceId, conflictId, { resolutionText: resolutionText.trim() }, config);
      setResolvingId(null);
      setResolutionText('');
      onResolve?.(resolved);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Unable to resolve conflict');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label="Conflicts" className="flex flex-col py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Conflicts</SidebarGroupLabel>
        <div className="flex flex-col gap-2">
          {sorted.map((conflict, i) => {
            const statusStyle = STATUS_STYLES[conflict.status];
            const isOpen = conflict.status === 'open';

            return (
              <motion.div
                key={conflict.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.15) }}
                className="rounded-md border border-border/50 bg-card p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-[10px]', statusStyle.className)}>
                    {statusStyle.label}
                  </Badge>
                  <span className="font-medium text-foreground">{conflict.summary}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(conflict.createdAt)}
                  </span>
                </div>
                {conflict.affectedPaths && conflict.affectedPaths.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {conflict.affectedPaths.map((path) => (
                      <span key={path} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {path}
                      </span>
                    ))}
                  </div>
                ) : null}
                {conflict.resolutionText ? (
                  <div className="mt-1.5 rounded bg-muted/50 p-1.5">
                    <p className="text-muted-foreground">{conflict.resolutionText}</p>
                  </div>
                ) : null}
                {isOpen ? (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setResolvingId(conflict.id);
                        setResolutionText('');
                        setResolveError(null);
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Resolve
                    </button>
                  </div>
                ) : null}
                {resolvingId === conflict.id ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Input
                      aria-label="Resolution text"
                      placeholder="How was this resolved?"
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleResolve(conflict.id);
                        }
                      }}
                      className="h-7 text-xs"
                    />
                    {resolveError ? <p role="alert" className="text-[10px] text-destructive">{resolveError}</p> : null}
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setResolvingId(null);
                          setResolutionText('');
                          setResolveError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        disabled={!resolutionText.trim() || submitting}
                        onClick={() => handleResolve(conflict.id)}
                      >
                        {submitting ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </SidebarGroup>
    </section>
  );
}
