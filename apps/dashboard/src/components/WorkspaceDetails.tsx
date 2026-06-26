import type { WorkspaceStatusResponse } from '@teambridge/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export type WorkspaceDetailsProps = {
  status?: WorkspaceStatusResponse;
  loading?: boolean;
  error?: string;
};

export function WorkspaceDetails({ status, loading = false, error }: WorkspaceDetailsProps) {
  if (loading) {
    return (
      <Card>
        <section aria-label="Workspace details" className="text-muted-foreground">
          <CardContent>Loading workspace details...</CardContent>
        </section>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <section aria-label="Workspace details">
          <CardContent>
            <p role="alert" className="text-destructive">{error}</p>
          </CardContent>
        </section>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <section aria-label="Workspace details">
          <CardContent className="text-muted-foreground">
            Select a workspace to inspect participants and branches.
          </CardContent>
        </section>
      </Card>
    );
  }

  return (
    <Card>
      <section aria-labelledby="workspace-details-title">
        <CardHeader>
          <CardTitle id="workspace-details-title">Team</CardTitle>
          <CardDescription>Branches currently attached to this session.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            {status.participants.length === 0 ? <p className="text-muted-foreground">No participants found.</p> : null}
            <div className="grid gap-2">
              {status.participants.map((participant) => (
                <article key={participant.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="block text-sm">{participant.displayName}</strong>
                      <span className="text-xs text-muted-foreground">{participant.branch}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{participant.agent ?? 'unknown agent'}</Badge>
                      <Badge variant={participant.status === 'active' ? 'default' : 'outline'}>{participant.status}</Badge>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <Separator />

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">Details</summary>
            <dl className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr]">
              <dt>Workspace ID</dt>
              <dd className="break-all">{status.workspace.id}</dd>
              <dt>Base</dt>
              <dd className="break-all">
                {status.workspace.baseRef} @ {status.workspace.baseCommit}
              </dd>
            </dl>
          </details>
        </CardContent>
      </section>
    </Card>
  );
}
