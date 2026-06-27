import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { IconSettings, IconUsers } from '@tabler/icons-react';
import type { Project, VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { APP_NAME } from '@/lib/branding';
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

const slotTransition = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const ICON_SLOT = 36; // size-9

export function SiteHeader({
  project,
  workspace,
  status,
  context,
  teamPanelOpen = false,
  onToggleTeamPanel,
  onOpenSettings
}: SiteHeaderProps) {
  const { pathname } = useLocation();
  const isProjectsPage = pathname === '/projects';
  const showChrome = !isProjectsPage;

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b bg-background">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <motion.div
          initial={false}
          animate={{ width: showChrome ? ICON_SLOT : 0, opacity: showChrome ? 1 : 0 }}
          transition={slotTransition}
          className="flex shrink-0 items-center justify-center overflow-hidden"
        >
          <SidebarTrigger size="icon-lg" className="size-9 shrink-0 [&_svg]:size-[18px]" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{ width: showChrome ? 1 : 0, marginRight: showChrome ? 8 : 0, opacity: showChrome ? 1 : 0 }}
          transition={slotTransition}
          className="flex shrink-0 items-center overflow-hidden"
        >
          <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-auto" />
        </motion.div>

        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="text-sm">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/projects" />}>{APP_NAME}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {isProjectsPage ? (
              <BreadcrumbItem>
                <BreadcrumbPage className="text-muted-foreground">Projects</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
                </BreadcrumbItem>
                {project ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate font-medium">{project.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
                {workspace ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate text-muted-foreground">
                        {getWorkspaceDisplayName(workspace)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {!isProjectsPage && workspace ? (
              <Badge variant="secondary" className="text-xs">{workspace.baseRef}</Badge>
            ) : null}
            {!isProjectsPage && status ? (
              <Badge variant="outline" className="text-xs">
                {status.participants.length} teammate{status.participants.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {!isProjectsPage && context ? (
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

          <motion.div
            initial={false}
            animate={{ width: showChrome ? ICON_SLOT : 0, opacity: showChrome ? 1 : 0 }}
            transition={slotTransition}
            className="flex shrink-0 items-center justify-center overflow-hidden"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-9 shrink-0 [&_svg]:size-[18px]"
              aria-label="Toggle team panel"
              aria-pressed={teamPanelOpen}
              onClick={onToggleTeamPanel}
            >
              <IconUsers stroke={1.5} />
            </Button>
          </motion.div>
        </div>
      </div>
    </header>
  );
}
