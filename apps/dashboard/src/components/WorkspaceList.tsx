import { memo } from 'react';
import type { Workspace } from '@teambridge/core';
import { IconDeviceDesktop } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton
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

function WorkspaceListComponent({
  workspaces,
  selectedWorkspaceId,
  loading = false,
  error,
  onSelect
}: WorkspaceListProps) {
  return (
    <SidebarGroup className="pt-2">
      <span className="sr-only" id="workspace-list-title">
        Workspaces
      </span>
      {/* Refresh affordance commented out for now — keep onRefresh in the API surface.
      <div className="flex items-center justify-between gap-2 px-2">
        <Button type="button" variant="ghost" size="xs" onClick={onRefresh} disabled={loading}>
          Refresh
        </Button>
      </div>
      */}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {loading ? <SidebarMenuSkeleton showIcon /> : null}

      {!error && !loading && workspaces.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">No workspaces found.</p>
      ) : null}

      <SidebarMenu aria-labelledby="workspace-list-title">
        {workspaces.map((workspace) => (
          <SidebarMenuItem key={workspace.id}>
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
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export const WorkspaceList = memo(WorkspaceListComponent);
