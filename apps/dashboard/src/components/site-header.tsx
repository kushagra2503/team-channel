import { IconSettings, IconUsers } from '@tabler/icons-react';
import type { Project, VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { getWorkspaceDisplayName } from './workspaceDisplay';

export type SiteHeaderProps = {
  project?: Project;
  workspace?: Workspace;
  status?: WorkspaceStatusResponse;
  context?: VaultContext;
  teamPanelOpen?: boolean;
  onToggleTeamPanel?: () => void;
  onOpenSettings?: () => void;
};

export function SiteHeader({
  project,
  workspace,
  status,
  context,
  teamPanelOpen = false,
  onToggleTeamPanel,
  onOpenSettings
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <SidebarTrigger size="icon-lg" className="size-9 [&_svg]:size-[18px]" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />

        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="text-sm">
            {project ? (
              <>
                <BreadcrumbItem className="hidden sm:block">
                  <BreadcrumbPage className="font-medium">{project.name}</BreadcrumbPage>
                </BreadcrumbItem>
                {workspace ? (
                  <>
                    <BreadcrumbSeparator className="hidden sm:block" />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate text-muted-foreground">
                        {getWorkspaceDisplayName(workspace)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </>
            ) : (
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-medium">{getWorkspaceDisplayName(workspace)}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {workspace ? (
              <Badge variant="secondary" className="text-xs">{workspace.baseRef}</Badge>
            ) : null}
            {status ? (
              <Badge variant="outline" className="text-xs">
                {status.participants.length} teammate{status.participants.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {context ? (
              <Badge variant="outline" className="text-xs">note #{context.lastSeq ?? 0}</Badge>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-9 [&_svg]:size-[18px]"
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            <IconSettings stroke={1.5} />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-9 [&_svg]:size-[18px]"
            aria-label="Toggle team panel"
            aria-pressed={teamPanelOpen}
            onClick={onToggleTeamPanel}
          >
            <IconUsers stroke={1.5} />
          </Button>
        </div>
      </div>
    </header>
  );
}
