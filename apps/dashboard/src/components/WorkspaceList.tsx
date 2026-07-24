import { memo } from 'react';
import { motion } from 'motion/react';
import type { Workspace } from '@coord/core';
import { IconDeviceDesktop } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getWorkspaceDisplayName } from './workspaceDisplay';

export type WorkspaceListProps = {
  workspaces: Workspace[];
  selectedWorkspaceId?: string;
  loading?: boolean;
  error?: string;
  onSelect: (workspaceId: string) => void;
  onRefresh?: () => void;
};

const ENTER = { opacity: 1, y: 0 } as const;
const HIDE = { opacity: 0, y: 4 } as const;
function WorkspaceListComponent({
  workspaces,
  selectedWorkspaceId,
  error,
  onSelect
}: WorkspaceListProps) {
  return (
    <SidebarGroup className="pt-2">
      <span className="sr-only" id="workspace-list-title">Workspaces</span>

      {error ? <p role="alert" className="px-3 text-xs text-destructive">{error}</p> : null}

      <SidebarMenu aria-labelledby="workspace-list-title">
        {workspaces.map((workspace, i) => (
          <motion.div
            key={workspace.id}
            initial={HIDE}
            animate={ENTER}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={workspace.id === selectedWorkspaceId}
                tooltip={getWorkspaceDisplayName(workspace)}
                render={<button type="button" />}
                onClick={() => onSelect(workspace.id)}
              >
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{getWorkspaceDisplayName(workspace)}</span>
                </span>
              </SidebarMenuButton>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-label="This session is local"
                      tabIndex={0}
                      className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
                    />
                  }
                >
                  <IconDeviceDesktop className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">This session is local</TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </motion.div>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export const WorkspaceList = memo(WorkspaceListComponent);
