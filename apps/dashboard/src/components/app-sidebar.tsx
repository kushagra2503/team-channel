import * as React from 'react';
import type { Workspace } from '@teambridge/core';

import { TrackList } from '@/components/TrackList';
import { RepoContextPanel } from '@/components/repo-context-panel';
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

      <SidebarFooter>
        {/* Connection panel commented out for now — kept for later use.
        <details className="px-3 text-xs text-sidebar-foreground/70">
          <summary className="cursor-pointer text-sidebar-foreground">Connection</summary>
          ...
        </details>
        */}
      </SidebarFooter>
    </Sidebar>
  );
}
