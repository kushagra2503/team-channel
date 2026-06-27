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

export type TrackListProps = {
  tracks: Workspace[];
  selectedTrackId?: string;
  error?: string;
  onSelect: (trackId: string) => void;
};

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 4 } as const;

function TrackListComponent({ tracks, selectedTrackId, error, onSelect }: TrackListProps) {
  return (
    <SidebarGroup className="pt-2">
      <span className="sr-only" id="track-list-title">Tracks</span>

      {error ? <p role="alert" className="px-3 text-xs text-destructive">{error}</p> : null}

      <SidebarMenu aria-labelledby="track-list-title">
        {tracks.map((track, i) => (
          <motion.div
            key={track.id}
            initial={HIDE}
            animate={ENTER}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
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
