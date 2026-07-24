import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { IconSettings, IconUsers } from '@tabler/icons-react';
import type { Project, RelayStatusResponse, Workspace } from '@coord/core';

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
  teamPanelOpen?: boolean;
  onToggleTeamPanel?: () => void;
  onOpenSettings?: () => void;
  relayStatus?: RelayStatusResponse;
};

const slotTransition = { type: 'spring' as const, duration: 0.3, bounce: 0 };
const ICON_SLOT = 36; // size-9

type BadgeState = { label: string; color: string };

function computeSyncBadge(status: RelayStatusResponse | undefined): BadgeState | null {
  if (!status) return null;
  if (!status.configured) return { label: 'Local', color: 'bg-muted text-muted-foreground' };
  if (!status.loggedIn) return { label: 'Not logged in', color: 'bg-amber-500/15 text-amber-600' };
  const hasError = status.sync.some((s) => s.relayStatus === 'error');
  if (hasError) return { label: 'Error', color: 'bg-red-500/15 text-red-600' };
  const hasOffline = status.sync.some((s) => s.relayStatus === 'offline');
  if (hasOffline) return { label: 'Offline', color: 'bg-red-500/15 text-red-600' };
  if (status.pending > 0) return { label: `Pending ${status.pending}`, color: 'bg-amber-500/15 text-amber-600' };
  return { label: 'Synced', color: 'bg-emerald-500/15 text-emerald-600' };
}

export function SiteHeader({
  project,
  workspace,
  teamPanelOpen = false,
  onToggleTeamPanel,
  onOpenSettings,
  relayStatus
}: SiteHeaderProps) {
  const { pathname } = useLocation();
  const isProjectsPage = pathname === '/projects';
  const showChrome = !isProjectsPage;
  const syncBadge = computeSyncBadge(relayStatus);

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
            {syncBadge ? (
              <span
                role="status"
                aria-live="polite"
                aria-label={`Relay sync status: ${syncBadge.label}`}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${syncBadge.color}`}
              >
                {syncBadge.label}
              </span>
            ) : null}
            {!isProjectsPage && workspace ? (
              <Badge variant="secondary" className="text-xs">{workspace.baseRef}</Badge>
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
