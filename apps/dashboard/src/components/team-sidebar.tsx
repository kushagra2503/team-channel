import type { WorkspaceStatusResponse } from '@teambridge/core';
import { SidebarContent } from '@/components/ui/sidebar';
import { WorkspaceDetails } from './WorkspaceDetails';

export type TeamSidebarProps = {
  open: boolean;
  status?: WorkspaceStatusResponse;
  loading?: boolean;
  error?: string;
};

export function TeamSidebar({ open, status, loading, error }: TeamSidebarProps) {
  if (!open) {
    return null;
  }

  return (
    <aside
      data-slot="team-sidebar"
      className="hidden h-[calc(100svh-var(--header-height))] w-72 shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground md:flex"
    >
      <SidebarContent>
        <WorkspaceDetails status={status} loading={loading} error={error} />
      </SidebarContent>
    </aside>
  );
}
