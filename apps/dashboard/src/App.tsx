import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';
import {
  getDefaultClientConfig,
  getVaultContext,
  getWorkspaceStatus,
  listWorkspaces,
  type TeambridgeClientConfig
} from './api/teambridgeClient';
import { Badge } from '@/components/ui/badge';
import { VaultHighlights } from './components/VaultHighlights';
import { WorkspaceDetails } from './components/WorkspaceDetails';
import { WorkspaceList } from './components/WorkspaceList';

export function App() {
  const clientConfig = useMemo<TeambridgeClientConfig>(() => getDefaultClientConfig(), []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatusResponse>();
  const [vaultContext, setVaultContext] = useState<VaultContext>();
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string>();
  const [detailsError, setDetailsError] = useState<string>();
  const [vaultError, setVaultError] = useState<string>();
  const workspacesAbortRef = useRef<AbortController | undefined>(undefined);

  const loadWorkspaces = useCallback(async () => {
    workspacesAbortRef.current?.abort();
    const controller = new AbortController();
    workspacesAbortRef.current = controller;
    setWorkspacesLoading(true);
    setWorkspacesError(undefined);

    try {
      const response = await listWorkspaces(clientConfig, controller.signal);
      setWorkspaces(response.workspaces);
      setSelectedWorkspaceId((current) => {
        if (current && response.workspaces.some((workspace) => workspace.id === current)) {
          return current;
        }

        return response.workspaces[0]?.id;
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setWorkspacesError(error instanceof Error ? error.message : 'Unable to reach local Teambridge daemon.');
    } finally {
      if (!controller.signal.aborted) {
        setWorkspacesLoading(false);
      }
    }
  }, [clientConfig]);

  useEffect(() => {
    void loadWorkspaces();
    return () => workspacesAbortRef.current?.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspaceStatus(undefined);
      setVaultContext(undefined);
      setDetailsError(undefined);
      setVaultError(undefined);
      return;
    }

    const controller = new AbortController();
    setDetailsLoading(true);
    setDetailsError(undefined);
    setVaultError(undefined);
    setWorkspaceStatus(undefined);
    setVaultContext(undefined);

    void Promise.all([
      getWorkspaceStatus(selectedWorkspaceId, clientConfig, controller.signal)
        .then((response) => setWorkspaceStatus(response))
        .catch((error) => {
          if (!controller.signal.aborted) {
            setDetailsError(error instanceof Error ? error.message : 'Unable to load workspace.');
          }
        }),
      getVaultContext(selectedWorkspaceId, clientConfig, controller.signal)
        .then((response) => setVaultContext(response.context))
        .catch((error) => {
          if (!controller.signal.aborted) {
            setVaultError(error instanceof Error ? error.message : 'Unable to load vault context.');
          }
        })
    ]).finally(() => {
      if (!controller.signal.aborted) {
        setDetailsLoading(false);
      }
    });

    return () => controller.abort();
  }, [clientConfig, selectedWorkspaceId]);

  const selectedWorkspace = workspaceStatus?.workspace ?? workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-8 border-b border-border/80 bg-card/40 px-4 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
              tb
            </div>
            <div>
              <div className="font-heading text-base font-medium">Teambridge</div>
              <div className="text-xs text-muted-foreground">local workspace</div>
            </div>
          </div>
          <Badge variant="outline">local</Badge>
        </div>

        <WorkspaceList
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          loading={workspacesLoading}
          error={workspacesError}
          onSelect={setSelectedWorkspaceId}
          onRefresh={loadWorkspaces}
        />

        <details className="mt-auto text-xs text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Connection</summary>
          <div className="mt-3 space-y-2 break-all">
            <p>
              <span className="block text-foreground">Daemon</span>
              <code>{clientConfig.daemonBaseUrl}</code>
            </p>
            {clientConfig.repoRoot ? (
              <p>
                <span className="block text-foreground">Repo</span>
                <code>{clientConfig.repoRoot}</code>
              </p>
            ) : null}
          </div>
        </details>
      </aside>

      <section className="min-w-0 px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-medium tracking-tight">
              {selectedWorkspace?.sessionName ?? 'No workspace'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {selectedWorkspace ? <Badge variant="secondary">{selectedWorkspace.baseRef}</Badge> : null}
              {workspaceStatus ? (
                <Badge variant="outline">
                  {workspaceStatus.participants.length} teammate{workspaceStatus.participants.length === 1 ? '' : 's'}
                </Badge>
              ) : null}
              {vaultContext ? <Badge variant="outline">note #{vaultContext.lastSeq ?? 0}</Badge> : null}
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <VaultHighlights context={vaultContext} loading={detailsLoading} error={vaultError} />
          <WorkspaceDetails status={workspaceStatus} loading={detailsLoading} error={detailsError} />
        </div>
      </section>
    </main>
  );
}
