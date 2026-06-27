import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project, ProjectMember, VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';
import {
  getDefaultClientConfig,
  getProjectMembers,
  getProjectTracks,
  getVaultContext,
  getWorkspaceStatus,
  listProjects,
  DEFAULT_DAEMON_BASE_URL,
  type TeambridgeClientConfig
} from '@/api/teambridgeClient';
import { createCache } from '@/lib/cache';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SettingsDialog } from '@/components/settings-dialog';
import { TeamSidebar } from '@/components/team-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VaultHighlights } from '@/components/VaultHighlights';

const LAST_PROJECT_KEY = 'tb_last_project';

function setLastProjectId(id: string): void {
  try { sessionStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* ignore */ }
}

export function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const clientConfig = useMemo<TeambridgeClientConfig>(() => getDefaultClientConfig(), []);

  const cache = useMemo(
    () => createCache(clientConfig.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL),
    [clientConfig.daemonBaseUrl]
  );

  // Project-level state
  const [project, setProject] = useState<Project | undefined>(() =>
    cache.projects.find((p) => p.id === projectId)
  );
  const [members, setMembers] = useState<ProjectMember[]>(() =>
    projectId ? (cache.getProjectMembers(projectId) ?? []) : []
  );
  const [tracks, setTracks] = useState<Workspace[]>(() =>
    projectId ? cache.workspaces.filter((w) => w.projectId === projectId) : []
  );

  // Track-level state
  const [selectedTrackId, setSelectedTrackIdState] = useState<string | undefined>(() => {
    const initial = cache.selectedWorkspaceId;
    return initial && tracks.some((t) => t.id === initial) ? initial : tracks[0]?.id;
  });
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatusResponse | undefined>(
    () => selectedTrackId ? cache.getStatus(selectedTrackId) : undefined
  );
  const [vaultContext, setVaultContext] = useState<VaultContext | undefined>(
    () => selectedTrackId ? cache.getVault(selectedTrackId) : undefined
  );

  const [tracksError, setTracksError] = useState<string>();
  const [detailsError, setDetailsError] = useState<string>();
  const [vaultError, setVaultError] = useState<string>();
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarRev, setAvatarRev] = useState(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Remember this project
  useEffect(() => {
    if (projectId) setLastProjectId(projectId);
  }, [projectId]);

  const setSelectedTrackId = useCallback((id: string | undefined) => {
    setSelectedTrackIdState(id);
    cache.setSelectedWorkspaceId(id);
    if (id) {
      const cached = cache.getStatus(id);
      if (cached) setWorkspaceStatus(cached);
      const cachedVault = cache.getVault(id);
      if (cachedVault) setVaultContext(cachedVault);
    }
  }, [cache]);

  // Load project data
  useEffect(() => {
    if (!projectId) {
      navigate('/', { replace: true });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTracksError(undefined);

    // If project not in cache, fetch all projects to resolve name
    const resolveProject = project
      ? Promise.resolve()
      : listProjects(clientConfig, controller.signal).then((res) => {
          cache.setProjects(res.projects);
          const found = res.projects.find((p) => p.id === projectId);
          if (!found) {
            navigate('/', { replace: true });
            return;
          }
          setProject(found);
        });

    void resolveProject;

    void Promise.all([
      getProjectTracks(projectId, clientConfig, controller.signal)
        .then((res) => {
          const updated = cache.workspaces.filter((w) => w.projectId !== projectId).concat(res.tracks);
          cache.setWorkspaces(updated);
          setTracks(res.tracks);
          setSelectedTrackIdState((current) => {
            const next = current && res.tracks.some((t) => t.id === current)
              ? current
              : res.tracks[0]?.id;
            if (next) cache.setSelectedWorkspaceId(next);
            return next;
          });
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setTracksError(err instanceof Error ? err.message : 'Unable to load tracks.');
          }
        }),

      getProjectMembers(projectId, clientConfig, controller.signal)
        .then((res) => {
          cache.setProjectMembers(projectId, res.members);
          setMembers(res.members);
        })
        .catch(() => { /* non-fatal */ })
    ]);

    return () => controller.abort();
  }, [projectId, clientConfig, cache, navigate, project]);

  // Load track data when selection changes
  useEffect(() => {
    if (!selectedTrackId) {
      setWorkspaceStatus(undefined);
      setVaultContext(undefined);
      return;
    }

    const controller = new AbortController();
    setDetailsError(undefined);
    setVaultError(undefined);

    void Promise.all([
      getWorkspaceStatus(selectedTrackId, clientConfig, controller.signal)
        .then((response) => {
          cache.setStatus(selectedTrackId, response);
          setWorkspaceStatus(response);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setDetailsError(error instanceof Error ? error.message : 'Unable to load track.');
          }
        }),
      getVaultContext(selectedTrackId, clientConfig, controller.signal)
        .then((response) => {
          cache.setVault(selectedTrackId, response.context);
          setVaultContext(response.context);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setVaultError(error instanceof Error ? error.message : 'Unable to load vault context.');
          }
        })
    ]);

    return () => controller.abort();
  }, [clientConfig, selectedTrackId, cache]);

  const selectedTrack = workspaceStatus?.workspace ?? tracks.find((t) => t.id === selectedTrackId);

  return (
    <TooltipProvider>
      <div className="[--header-height:calc(--spacing(14))] select-none">
        <SidebarProvider className="flex min-h-screen flex-col">
          <SiteHeader
            project={project}
            workspace={selectedTrack}
            status={workspaceStatus}
            context={vaultContext}
            teamPanelOpen={teamPanelOpen}
            onToggleTeamPanel={() => setTeamPanelOpen((open) => !open)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className="flex flex-1">
            <AppSidebar
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              error={tracksError}
              onSelectTrack={setSelectedTrackId}
            />
            <SidebarInset>
              <div className="flex flex-1 flex-col select-text">
                <VaultHighlights
                  context={vaultContext}
                  error={vaultError}
                  participants={workspaceStatus?.participants}
                  workspaceId={workspaceStatus?.workspace.id}
                  daemonBaseUrl={clientConfig.daemonBaseUrl}
                  repoRoot={clientConfig.repoRoot}
                  avatarRev={avatarRev}
                />
              </div>
            </SidebarInset>
            <TeamSidebar
              open={teamPanelOpen}
              members={members}
              error={detailsError}
              daemonBaseUrl={clientConfig.daemonBaseUrl}
              repoRoot={clientConfig.repoRoot}
              avatarRev={avatarRev}
              trackId={selectedTrackId}
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
