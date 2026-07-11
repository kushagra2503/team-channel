import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Conflict, ContextDelta, InboxMessage, Project, ProjectMember, LocalUserProfile, RelayStatusResponse, VaultContext, VaultItemAnnotation, Workspace, WorkspaceEvent, WorkspaceStatusResponse } from '@teambridge/core';
import {
  annotateVaultItem,
  getDefaultClientConfig,
  getContextDeltas,
  getProjectMembers,
  getProjectTracks,
  getRelayStatus,
  getVaultContext,
  getWorkspaceEvents,
  getWorkspaceStatus,
  listConflicts,
  listInbox,
  listRelaySessions,
  listProjects,
  replyInbox,
  resolveConflict,
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
import { readCachedLocalIdentity, writeCachedLocalIdentity } from '@/lib/local-profile-cache';

const LAST_PROJECT_KEY = 'tb_last_project';
const PROJECT_REFRESH_MS = 5000;
const TRACK_REFRESH_MS = 3000;

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
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | undefined>();
  const [relayError, setRelayError] = useState<string>();
  const [events, setEvents] = useState<WorkspaceEvent[]>();
  const [eventsError, setEventsError] = useState<string>();
  const [deltas, setDeltas] = useState<ContextDelta[]>();
  const [deltasError, setDeltasError] = useState<string>();
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>();
  const [inboxError, setInboxError] = useState<string>();
  const [conflicts, setConflicts] = useState<Conflict[]>();
  const [conflictsError, setConflictsError] = useState<string>();
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [avatarRev, setAvatarRev] = useState(0);
  const daemonUrl = clientConfig.daemonBaseUrl ?? DEFAULT_DAEMON_BASE_URL;
  const cachedIdentity = useMemo(() => readCachedLocalIdentity(daemonUrl), [daemonUrl]);
  const [localUser, setLocalUser] = useState<LocalUserProfile | null>(() => cachedIdentity?.profile ?? null);
  const [localAvatarVersion, setLocalAvatarVersion] = useState<string | undefined>(
    () => cachedIdentity?.avatarVersion
  );
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

    const loadProjectData = async () => {
      if (!project) {
        try {
          const res = await listProjects(clientConfig, controller.signal);
          cache.setProjects(res.projects);
          const found = res.projects.find((p) => p.id === projectId);
          if (found) {
            setProject(found);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setTracksError(error instanceof Error ? error.message : 'Unable to load project.');
          }
        }
      }

      await Promise.all([
        Promise.allSettled([
          getProjectTracks(projectId, clientConfig, controller.signal),
          listRelaySessions(clientConfig, controller.signal)
        ])
          .then(([localResult, relayResult]) => {
            if (localResult.status === 'rejected') {
              throw localResult.reason;
            }
            const localTracks = localResult.value.tracks;
            const relayTracks = relayResult.status === 'fulfilled'
              ? (relayResult.value?.sessions ?? []).filter((track) => track.projectId === projectId)
              : [];
            const merged = new Map<string, Workspace>();
            for (const track of relayTracks) merged.set(track.id, track);
            for (const track of localTracks) merged.set(track.id, track);
            const nextTracks = [...merged.values()];
            const updated = cache.workspaces.filter((w) => w.projectId !== projectId).concat(nextTracks);
            cache.setWorkspaces(updated);
            setTracks(nextTracks);
            setTracksError(undefined);
            setSelectedTrackIdState((current) => {
              const next = current && nextTracks.some((t) => t.id === current)
                ? current
                : nextTracks[0]?.id;
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
            setLocalUser(res.localUser);
            setLocalAvatarVersion(res.localAvatarVersion);
            writeCachedLocalIdentity(daemonUrl, res.localUser, res.localAvatarVersion);
          })
          .catch(() => { /* non-fatal */ })
      ]);
    };

    void loadProjectData();
    const refreshId = window.setInterval(() => {
      void loadProjectData();
    }, PROJECT_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [projectId, clientConfig, cache, navigate, project, daemonUrl]);

  useEffect(() => {
    if (!selectedTrackId) {
      setWorkspaceStatus(undefined);
      setVaultContext(undefined);
      return;
    }

    const controller = new AbortController();
    setDetailsError(undefined);
    setVaultError(undefined);

    const loadTrackData = async () => {
      await Promise.all([
        getWorkspaceStatus(selectedTrackId, clientConfig, controller.signal)
          .then((response) => {
            cache.setStatus(selectedTrackId, response);
            setWorkspaceStatus(response);
            setDetailsError(undefined);
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
            setVaultError(undefined);
          })
          .catch((error) => {
            if (!controller.signal.aborted) {
              setVaultError(error instanceof Error ? error.message : 'Unable to load vault context.');
            }
          })
      ]);
    };

    void loadTrackData();
    const refreshId = window.setInterval(() => {
      void loadTrackData();
    }, TRACK_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [clientConfig, selectedTrackId, cache]);

  // Poll relay status (repo-level, 5s cadence)
  useEffect(() => {
    const controller = new AbortController();
    setRelayError(undefined);

    const pollRelay = async () => {
      try {
        const status = await getRelayStatus(clientConfig, controller.signal);
        if (!controller.signal.aborted) {
          setRelayStatus(status);
          setRelayError(undefined);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRelayError(error instanceof Error ? error.message : 'Unable to load relay status.');
        }
      }
    };

    void pollRelay();
    const refreshId = window.setInterval(pollRelay, PROJECT_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [clientConfig]);

  // Poll workspace events (track-scoped, 3s cadence)
  useEffect(() => {
    if (!selectedTrackId) {
      setEvents(undefined);
      setEventsError(undefined);
      return;
    }

    const controller = new AbortController();
    setEventsError(undefined);

    const pollEvents = async () => {
      try {
        const res = await getWorkspaceEvents(selectedTrackId, clientConfig, controller.signal);
        if (!controller.signal.aborted) {
          setEvents(res.events);
          setEventsError(undefined);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setEventsError(error instanceof Error ? error.message : 'Unable to load events.');
        }
      }
    };

    void pollEvents();
    const refreshId = window.setInterval(pollEvents, TRACK_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [clientConfig, selectedTrackId]);

  const localParticipantId = useMemo(() => {
    if (!localUser) return undefined;
    return workspaceStatus?.participants.find((participant) =>
      participant.displayName.toLowerCase() === localUser.displayName.toLowerCase()
    )?.id;
  }, [localUser, workspaceStatus?.participants]);

  const refreshInboxAndConflicts = useCallback(async (signal?: AbortSignal) => {
    if (!selectedTrackId) return;
    const [inboxRes, conflictsRes, deltasRes] = await Promise.allSettled([
      listInbox(selectedTrackId, clientConfig, signal),
      listConflicts(selectedTrackId, clientConfig, signal),
      getContextDeltas(selectedTrackId, clientConfig, { limit: 8, excludeActorId: localParticipantId }, signal)
    ]);
    if (signal?.aborted) return;

    if (inboxRes.status === 'fulfilled') {
      setInboxMessages(inboxRes.value.messages);
      setInboxError(undefined);
    } else {
      setInboxError(inboxRes.reason instanceof Error ? inboxRes.reason.message : 'Unable to load inbox.');
    }

    if (conflictsRes.status === 'fulfilled') {
      setConflicts(conflictsRes.value.conflicts);
      setConflictsError(undefined);
    } else {
      setConflictsError(conflictsRes.reason instanceof Error ? conflictsRes.reason.message : 'Unable to load conflicts.');
    }

    if (deltasRes.status === 'fulfilled') {
      setDeltas(deltasRes.value.deltas);
      setDeltasError(undefined);
    } else {
      setDeltasError(deltasRes.reason instanceof Error ? deltasRes.reason.message : 'Unable to load teammate deltas.');
    }
  }, [clientConfig, localParticipantId, selectedTrackId]);

  useEffect(() => {
    if (!selectedTrackId) {
      setInboxMessages(undefined);
      setInboxError(undefined);
      setConflicts(undefined);
      setConflictsError(undefined);
      setDeltas(undefined);
      setDeltasError(undefined);
      return;
    }

    const controller = new AbortController();
    void refreshInboxAndConflicts(controller.signal);
    const refreshId = window.setInterval(() => {
      void refreshInboxAndConflicts(controller.signal);
    }, TRACK_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [refreshInboxAndConflicts, selectedTrackId]);

  const selectedTrack = workspaceStatus?.workspace ?? tracks.find((t) => t.id === selectedTrackId);

  useEffect(() => {
    setHeader({
      variant: 'dashboard',
      project,
      workspace: selectedTrack,
      teamPanelOpen,
      onToggleTeamPanel: toggleTeamPanel,
      relayStatus
    });
  }, [
    project,
    selectedTrack,
    teamPanelOpen,
    toggleTeamPanel,
    relayStatus,
    setHeader
  ]);

  useEffect(() => () => resetHeader(), [resetHeader]);

  useEffect(() => {
    if (!clientConfig.daemonBaseUrl) return;
    const urls: string[] = [];
    if (localUser) {
      urls.push(
        buildDisplayNameAvatarUrl(
          localUser.displayName,
          clientConfig,
          localAvatarVersion ?? avatarRev
        )
      );
    }
    const names = new Set<string>();
    if (localUser) names.add(localUser.displayName);
    for (const member of members) names.add(member.displayName);
    for (const participant of workspaceStatus?.participants ?? []) names.add(participant.displayName);
    for (const displayName of names) {
      if (localUser && displayName === localUser.displayName) continue;
      urls.push(buildDisplayNameAvatarUrl(displayName, clientConfig, avatarRev));
    }
    preloadAvatars(urls);
  }, [members, workspaceStatus?.participants, localUser, localAvatarVersion, clientConfig, avatarRev]);

  const handleVaultAnnotate = useCallback(async (annotation: VaultItemAnnotation) => {
    if (!selectedTrackId) return;
    const response = await annotateVaultItem(selectedTrackId, clientConfig, annotation);
    if (response.context) {
      cache.setVault(selectedTrackId, response.context);
      setVaultContext(response.context);
    }
  }, [selectedTrackId, clientConfig, cache]);

  const handleInboxReply = useCallback(async (messageId: string, text: string) => {
    if (!selectedTrackId) return;
    await replyInbox(selectedTrackId, messageId, clientConfig, { text, actorId: localParticipantId });
    await refreshInboxAndConflicts();
  }, [clientConfig, localParticipantId, refreshInboxAndConflicts, selectedTrackId]);

  const handleResolveConflict = useCallback(async (conflictId: string, resolutionText: string) => {
    if (!selectedTrackId) return;
    await resolveConflict(selectedTrackId, conflictId, clientConfig, { resolutionText, actorId: localParticipantId });
    await refreshInboxAndConflicts();
  }, [clientConfig, localParticipantId, refreshInboxAndConflicts, selectedTrackId]);

  return (
    <>
      <div className="flex shrink-0">
        <AppSidebar
          staggerKey={projectId}
          columnIndex={0}
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          clientConfig={clientConfig}
          error={tracksError}
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
              workspaceId={selectedTrackId}
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
          localUser={localUser}
          localAvatarVersion={localAvatarVersion}
          trackStatus={workspaceStatus}
          trackError={detailsError}
          daemonBaseUrl={clientConfig.daemonBaseUrl}
          repoRoot={clientConfig.repoRoot}
          avatarRev={avatarRev}
          onAvatarRev={() => setAvatarRev((rev) => rev + 1)}
          relayStatus={relayStatus}
          relayError={relayError}
          events={events}
          eventsError={eventsError}
          latestCheckpoint={workspaceStatus?.latestCheckpoint}
          deltas={deltas}
          deltasError={deltasError}
          inboxMessages={inboxMessages}
          inboxError={inboxError}
          conflicts={conflicts}
          conflictsError={conflictsError}
          onReplyInbox={handleInboxReply}
          onResolveConflict={handleResolveConflict}
        />
      </div>
    </>
  );
}
