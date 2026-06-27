import { memo } from 'react';
import { motion } from 'motion/react';
import type { Workspace } from '@teambridge/core';
import { IconDeviceDesktop } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getWorkspaceDisplayName } from './workspaceDisplay';
import { columnEnterTransition, COLUMN_ENTER, COLUMN_HIDE } from '@/lib/motion';

export type TrackListProps = {
  tracks: Workspace[];
  selectedTrackId?: string;
  error?: string;
  onSelect: (trackId: string) => void;
  columnIndex?: number;
  staggerKey?: string;
};

function TrackListComponent({ tracks, selectedTrackId, error, onSelect, columnIndex = 0, staggerKey }: TrackListProps) {
  return (
    <SidebarGroup className="pt-2">
      <span className="sr-only" id="track-list-title">Tracks</span>

      {error ? <p role="alert" className="px-3 text-xs text-destructive">{error}</p> : null}

      <SidebarMenu aria-labelledby="track-list-title">
        {tracks.map((track, i) => (
          <motion.div
            key={staggerKey ? `${staggerKey}-${track.id}` : track.id}
            initial={COLUMN_HIDE}
            animate={COLUMN_ENTER}
            transition={columnEnterTransition(columnIndex, i)}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={track.id === selectedTrackId}
                tooltip={getWorkspaceDisplayName(track)}
                render={<button type="button" />}
                onClick={() => onSelect(track.id)}
              >
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{getWorkspaceDisplayName(track)}</span>
                </span>
              </SidebarMenuButton>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-label="This track is local"
                      tabIndex={0}
                      className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
                    />
                  }
                >
                  <IconDeviceDesktop className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">This track is local</TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </motion.div>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export const TrackList = memo(TrackListComponent);
