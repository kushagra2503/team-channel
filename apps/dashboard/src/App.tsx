import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';
import {
  getDefaultClientConfig,
  getVaultContext,
  getWorkspaceStatus,
  listWorkspaces,
  DEFAULT_DAEMON_BASE_URL,
  type TeambridgeClientConfig
} from './api/teambridgeClient';
import { createCache } from './lib/cache';
import { AppSidebar } from './components/app-sidebar';
import { SiteHeader } from './components/site-header';
import { SettingsDialog } from './components/settings-dialog';
import { TeamSidebar } from './components/team-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VaultHighlights } from './components/VaultHighlights';

export function App() {
  const clientConfig = useMemo<TeambridgeClientConfig>(() => getDefaultClientConfig(), []);

  const cache = useMemo(
    () => createCache(clientConfig.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL),
    [clientConfig.daemonBaseUrl]
  );

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => cache.workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | undefined>(
    () => cache.selectedWorkspaceId ?? cache.workspaces[0]?.id
  );
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatusResponse | undefined>(
    () => selectedWorkspaceId ? cache.getStatus(selectedWorkspaceId) : undefined
  );
  const [vaultContext, setVaultContext] = useState<VaultContext | undefined>(
    () => selectedWorkspaceId ? cache.getVault(selectedWorkspaceId) : undefined
  );

  const [workspacesError, setWorkspacesError] = useState<string>();
  const [detailsError, setDetailsError] = useState<string>();
  const [vaultError, setVaultError] = useState<string>();
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarRev, setAvatarRev] = useState(0);
  const workspacesAbortRef = useRef<AbortController | undefined>(undefined);

  const setSelectedWorkspaceId = useCallback((id: string | undefined) => {
    setSelectedWorkspaceIdState(id);
    cache.setSelectedWorkspaceId(id);
    if (id) {
      const cached = cache.getStatus(id);
      if (cached) setWorkspaceStatus(cached);
      const cachedVault = cache.getVault(id);
      if (cachedVault) setVaultContext(cachedVault);
    }
  }, [cache]);

  const loadWorkspaces = useCallback(async () => {
    workspacesAbortRef.current?.abort();
    const controller = new AbortController();
    workspacesAbortRef.current = controller;
    setWorkspacesError(undefined);

    try {
      const response = await listWorkspaces(clientConfig, controller.signal);
      cache.setWorkspaces(response.workspaces);
      setWorkspaces(response.workspaces);
      setSelectedWorkspaceIdState((current) => {
        const next = (current && response.workspaces.some((w) => w.id === current))
          ? current
          : response.workspaces[0]?.id;
        if (next) cache.setSelectedWorkspaceId(next);
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setWorkspacesError(error instanceof Error ? error.message : 'Unable to reach local Teambridge daemon.');
    }
  }, [clientConfig, cache]);

  useEffect(() => {
    void loadWorkspaces();
    return () => workspacesAbortRef.current?.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspaceStatus(undefined);
      setVaultContext(undefined);
      return;
    }

    const controller = new AbortController();
    setDetailsError(undefined);
    setVaultError(undefined);

    void Promise.all([
      getWorkspaceStatus(selectedWorkspaceId, clientConfig, controller.signal)
        .then((response) => {
          cache.setStatus(selectedWorkspaceId, response);
          setWorkspaceStatus(response);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setDetailsError(error instanceof Error ? error.message : 'Unable to load workspace.');
          }
        }),
      getVaultContext(selectedWorkspaceId, clientConfig, controller.signal)
        .then((response) => {
          cache.setVault(selectedWorkspaceId, response.context);
          setVaultContext(response.context);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setVaultError(error instanceof Error ? error.message : 'Unable to load vault context.');
          }
        })
    ]);

    return () => controller.abort();
  }, [clientConfig, selectedWorkspaceId, cache]);

  const selectedWorkspace = workspaceStatus?.workspace ?? workspaces.find((w) => w.id === selectedWorkspaceId);

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
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className="flex flex-1">
            <AppSidebar
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              loading={false}
              error={workspacesError}
              daemonBaseUrl={clientConfig.daemonBaseUrl}
              repoRoot={clientConfig.repoRoot}
              onSelectWorkspace={setSelectedWorkspaceId}
              onRefreshWorkspaces={loadWorkspaces}
            />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-5 p-4 select-text sm:p-6">
                <VaultHighlights context={vaultContext} error={vaultError} />
              </div>
            </SidebarInset>
            <TeamSidebar
              open={teamPanelOpen}
              status={workspaceStatus}
              error={detailsError}
              daemonBaseUrl={clientConfig.daemonBaseUrl}
              repoRoot={clientConfig.repoRoot}
              avatarRev={avatarRev}
              onAvatarRev={() => setAvatarRev((rev) => rev + 1)}
            />
          </div>
        </SidebarProvider>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={clientConfig}
      />
    </TooltipProvider>
  );
}
