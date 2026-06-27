import * as React from 'react';
import type { Workspace } from '@teambridge/core';

import { WorkspaceList } from '@/components/WorkspaceList';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter
} from '@/components/ui/sidebar';

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  workspaces: Workspace[];
  selectedWorkspaceId?: string;
  loading?: boolean;
  error?: string;
  daemonBaseUrl?: string;
  repoRoot?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onRefreshWorkspaces: () => void;
};

export function AppSidebar({
  workspaces,
  selectedWorkspaceId,
  loading = false,
  error,
  daemonBaseUrl,
  repoRoot,
  onSelectWorkspace,
  onRefreshWorkspaces,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" {...props}>
      <SidebarContent>
        <WorkspaceList
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          loading={loading}
          error={error}
          onSelect={onSelectWorkspace}
          onRefresh={onRefreshWorkspaces}
        />
      </SidebarContent>

      <SidebarFooter>
        {/* Connection panel commented out for now — kept for later use.
        <details className="px-3 text-xs text-sidebar-foreground/70">
          <summary className="cursor-pointer text-sidebar-foreground">Connection</summary>
          <div className="mt-2 flex flex-col gap-2 break-all">
            <p>
              <span className="block text-sidebar-foreground">Daemon</span>
              <code>{daemonBaseUrl}</code>
            </p>
            {repoRoot ? (
              <p>
                <span className="block text-sidebar-foreground">Repo</span>
                <code>{repoRoot}</code>
              </p>
            ) : null}
          </div>
        </details>
        */}
      </SidebarFooter>
    </Sidebar>
  );
}
