import { useState } from 'react';
import type { Conflict } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ConflictsPanelProps = {
  conflicts?: Conflict[];
  error?: string;
  onResolve?: (conflictId: string, resolutionText: string) => Promise<void>;
};

export function ConflictsPanel({ conflicts, error, onResolve }: ConflictsPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Conflicts" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  return (
    <section aria-label="Conflicts" className="py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Conflicts</SidebarGroupLabel>
        {!conflicts ? (
          <p className="px-2 text-xs text-muted-foreground">Loading conflicts…</p>
        ) : conflicts.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No conflicts.</p>
        ) : (
          <div className="flex flex-col gap-2 px-2">
            {conflicts.map((conflict) => {
              const canResolve = conflict.status === 'open' && onResolve;
              return (
                <div key={conflict.id} className="rounded-lg border bg-background/60 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={conflict.status === 'open' ? 'font-medium text-red-500' : 'font-medium text-emerald-600'}>
                      {conflict.status}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{conflict.id}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{conflict.summary}</p>
                  {conflict.affectedPaths?.length ? (
                    <p className="mt-1 text-[10px] text-muted-foreground/70">{conflict.affectedPaths.join(', ')}</p>
                  ) : null}
                  {canResolve ? (
                    <form
                      className="mt-2 flex gap-1"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const text = drafts[conflict.id]?.trim();
                        if (!text) return;
                        setBusy(conflict.id);
                        try {
                          await onResolve(conflict.id, text);
                          setDrafts((current) => ({ ...current, [conflict.id]: '' }));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Input
                        value={drafts[conflict.id] ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [conflict.id]: event.target.value }))}
                        placeholder="Resolution…"
                        className="h-7 text-xs"
                      />
                      <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={busy === conflict.id}>
                        Resolve
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SidebarGroup>
    </section>
  );
}
