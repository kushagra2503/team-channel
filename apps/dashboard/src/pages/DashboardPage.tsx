import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project, ProjectMember, VaultContext, VaultItemAnnotation, Workspace, WorkspaceStatusResponse } from '@teambridge/core';
import {
  annotateVaultItem,
  getDefaultClientConfig,
  getProjectMembers,
  getProjectTracks,
  getVaultContext,
  getWorkspaceStatus,
  listProjects,
  DEFAULT_DAEMON_BASE_URL,
  type TeambridgeClientConfig
} from '@/api/teambridgeClient';
import { useAppShell } from '@/components/app-shell-context';
import { createCache } from '@/lib/cache';
import { AppSidebar } from '@/components/app-sidebar';
import { TeamSidebar } from '@/components/team-sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import { VaultHighlights } from '@/components/VaultHighlights';
import { buildDisplayNameAvatarUrl } from '@/api/teambridgeClient';
import { preloadAvatars } from '@/lib/avatar-cache';

const LAST_PROJECT_KEY = 'tb_last_project';

function setLastProjectId(id: string): void {
  try { sessionStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* ignore */ }
}

export function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { setHeader, resetHeader } = useAppShell();
  const clientConfig = useMemo<TeambridgeClientConfig>(() => getDefaultClientConfig(), []);

  const cache = useMemo(
    () => createCache(clientConfig.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL),
    [clientConfig.daemonBaseUrl]
  );

  const [project, setProject] = useState<Project | undefined>(() =>
    cache.projects.find((p) => p.id === projectId)
  );
  const [members, setMembers] = useState<ProjectMember[]>(() =>
    projectId ? (cache.getProjectMembers(projectId) ?? []) : []
  );
  const [tracks, setTracks] = useState<Workspace[]>(() =>
    projectId ? cache.workspaces.filter((w) => w.projectId === projectId) : []
  );

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
  const [avatarRev, setAvatarRev] = useState(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const toggleTeamPanel = useCallback(() => {
    setTeamPanelOpen((open) => !open);
  }, []);

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

  useEffect(() => {
    if (!projectId) {
      navigate('/projects', { replace: true });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTracksError(undefined);

    if (!project) {
      void listProjects(clientConfig, controller.signal).then((res) => {
        cache.setProjects(res.projects);
        const found = res.projects.find((p) => p.id === projectId);
        if (!found) {
          navigate('/projects', { replace: true });
          return;
        }
        setProject(found);
      });
    }

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

  useEffect(() => {
    setHeader({
      variant: 'dashboard',
      project,
      workspace: selectedTrack,
      teamPanelOpen,
      onToggleTeamPanel: toggleTeamPanel
    });
  }, [
    project,
    selectedTrack,
    teamPanelOpen,
    toggleTeamPanel,
    setHeader
  ]);

  useEffect(() => () => resetHeader(), [resetHeader]);

  useEffect(() => {
    if (!clientConfig.daemonBaseUrl) return;
    const names = new Set<string>();
    for (const member of members) names.add(member.displayName);
    for (const participant of workspaceStatus?.participants ?? []) names.add(participant.displayName);
    preloadAvatars(
      [...names].map((displayName) => buildDisplayNameAvatarUrl(displayName, clientConfig, avatarRev))
    );
  }, [members, workspaceStatus?.participants, clientConfig, avatarRev]);

  const handleVaultAnnotate = useCallback(async (annotation: VaultItemAnnotation) => {
    if (!selectedTrackId) return;
    const response = await annotateVaultItem(selectedTrackId, clientConfig, annotation);
    if (response.context) {
      cache.setVault(selectedTrackId, response.context);
      setVaultContext(response.context);
    }
  }, [selectedTrackId, clientConfig, cache]);

  return (
    <>
      <div className="flex shrink-0">
        <AppSidebar
          staggerKey={projectId}
          columnIndex={0}
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          clientConfig={clientConfig}
          trackStatus={workspaceStatus}
          trackError={detailsError}
          error={tracksError}
          avatarRev={avatarRev}
          onSelectTrack={setSelectedTrackId}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarInset>
          <div className="flex flex-1 flex-col select-text">
            <VaultHighlights
              staggerKey={projectId}
              columnIndex={1}
              context={vaultContext}
              error={vaultError}
              participants={workspaceStatus?.participants}
              daemonBaseUrl={clientConfig.daemonBaseUrl}
              repoRoot={clientConfig.repoRoot}
              avatarRev={avatarRev}
              onAnnotate={handleVaultAnnotate}
            />
          </div>
        </SidebarInset>
      </div>
      <div className="flex shrink-0">
        <TeamSidebar
          staggerKey={projectId}
          columnIndex={2}
          open={teamPanelOpen}
          members={members}
          daemonBaseUrl={clientConfig.daemonBaseUrl}
          repoRoot={clientConfig.repoRoot}
          avatarRev={avatarRev}
          onAvatarRev={() => setAvatarRev((rev) => rev + 1)}
        />
      </div>
    </>
  );
}
