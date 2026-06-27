import * as React from 'react';
import type { Workspace, WorkspaceStatusResponse } from '@teambridge/core';

import { TrackList } from '@/components/TrackList';
import { RepoContextPanel } from '@/components/repo-context-panel';
import { TrackParticipantsPanel } from '@/components/TrackParticipantsPanel';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter
} from '@/components/ui/sidebar';

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  tracks: Workspace[];
  selectedTrackId?: string;
  clientConfig: TeambridgeClientConfig;
  trackStatus?: WorkspaceStatusResponse;
  trackError?: string;
  error?: string;
  avatarRev?: number;
  onSelectTrack: (trackId: string) => void;
  columnIndex?: number;
  staggerKey?: string;
};

export function AppSidebar({
  tracks,
  selectedTrackId,
  clientConfig,
  trackStatus,
  trackError,
  error,
  avatarRev,
  onSelectTrack,
  columnIndex,
  staggerKey,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" {...props}>
      <RepoContextPanel workspaceId={selectedTrackId} clientConfig={clientConfig} />
      <SidebarContent>
        <TrackList
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          error={error}
          onSelect={onSelectTrack}
          columnIndex={columnIndex}
          staggerKey={staggerKey}
        />
      </SidebarContent>

      <SidebarFooter className="p-0">
        <TrackParticipantsPanel
          status={trackStatus}
          error={trackError}
          daemonBaseUrl={clientConfig.daemonBaseUrl}
          repoRoot={clientConfig.repoRoot}
          avatarRev={avatarRev}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
