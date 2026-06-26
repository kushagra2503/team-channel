import { memo } from 'react';
import type { Workspace } from '@teambridge/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type WorkspaceListProps = {
  workspaces: Workspace[];
  selectedWorkspaceId?: string;
  loading?: boolean;
  error?: string;
  onSelect: (workspaceId: string) => void;
  onRefresh: () => void;
};

function WorkspaceListComponent({
  workspaces,
  selectedWorkspaceId,
  loading = false,
  error,
  onSelect,
  onRefresh
}: WorkspaceListProps) {
  return (
    <section aria-labelledby="workspace-list-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="workspace-list-title" className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Sessions
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading sessions...</p> : null}

      {!error && !loading && workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workspaces found.</p>
      ) : null}

      <div className="grid gap-2">
        {workspaces.map((workspace) => (
          <Button
            key={workspace.id}
            type="button"
            variant={workspace.id === selectedWorkspaceId ? 'secondary' : 'ghost'}
            aria-pressed={workspace.id === selectedWorkspaceId}
            className="h-auto w-full justify-start rounded-2xl px-3 py-3 text-left"
            onClick={() => onSelect(workspace.id)}
          >
            <span className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0">
                <strong className="block truncate text-sm">{workspace.sessionName}</strong>
              </span>
              <Badge variant="outline">{workspace.relayMode}</Badge>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

export const WorkspaceList = memo(WorkspaceListComponent);
