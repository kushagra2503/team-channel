import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';
import {
  getDefaultClientConfig,
  getVaultContext,
  getWorkspaceStatus,
  listWorkspaces,
  type TeambridgeClientConfig
} from './api/teambridgeClient';
import { AppSidebar } from './components/app-sidebar';
import { SiteHeader } from './components/site-header';
import { TeamSidebar } from './components/team-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VaultHighlights } from './components/VaultHighlights';

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
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
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
    <TooltipProvider>
      <div className="[--header-height:calc(--spacing(14))] select-none">
        <SidebarProvider className="flex min-h-screen flex-col">
          <SiteHeader
            workspace={selectedWorkspace}
            status={workspaceStatus}
            context={vaultContext}
            teamPanelOpen={teamPanelOpen}
            onToggleTeamPanel={() => setTeamPanelOpen((open) => !open)}
          />
          <div className="flex flex-1">
            <AppSidebar
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              loading={workspacesLoading}
              error={workspacesError}
              daemonBaseUrl={clientConfig.daemonBaseUrl}
              repoRoot={clientConfig.repoRoot}
              onSelectWorkspace={setSelectedWorkspaceId}
              onRefreshWorkspaces={loadWorkspaces}
            />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-5 p-4 select-text sm:p-6">
                <VaultHighlights context={vaultContext} loading={detailsLoading} error={vaultError} />
              </div>
            </SidebarInset>
            <TeamSidebar
              open={teamPanelOpen}
              status={workspaceStatus}
              loading={detailsLoading}
              error={detailsError}
            />
          </div>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
