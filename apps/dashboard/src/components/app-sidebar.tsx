import * as React from 'react';
import type { Workspace } from '@coord/core';

import { TrackList } from '@/components/TrackList';
import { RepoContextPanel } from '@/components/repo-context-panel';
import type { CoordClientConfig } from '@/api/coordClient';
import {
  Sidebar,
  SidebarContent
} from '@/components/ui/sidebar';

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  tracks: Workspace[];
  selectedTrackId?: string;
  clientConfig: CoordClientConfig;
  error?: string;
  onSelectTrack: (trackId: string) => void;
  columnIndex?: number;
  staggerKey?: string;
};

export function AppSidebar({
  tracks,
  selectedTrackId,
  clientConfig,
  error,
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
    </Sidebar>
  );
}
