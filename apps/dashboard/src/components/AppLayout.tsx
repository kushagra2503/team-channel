import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getDefaultClientConfig } from '@/api/teambridgeClient';
import { AppShellProvider, useAppShell } from '@/components/app-shell-context';
import { SiteHeader } from '@/components/site-header';
import { SettingsDialog } from '@/components/settings-dialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

function AppLayoutFrame() {
  const { header } = useAppShell();
  const config = useMemo(() => getDefaultClientConfig(), []);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <TooltipProvider>
      <SidebarProvider className="flex min-h-svh flex-col bg-background [--header-height:3.5rem]">
        <SiteHeader
          project={header.project}
          workspace={header.workspace}
          status={header.status}
          context={header.context}
          teamPanelOpen={header.teamPanelOpen}
          onToggleTeamPanel={header.onToggleTeamPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex min-h-0 flex-1 select-none">
          <Outlet />
        </div>
      </SidebarProvider>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} config={config} />
    </TooltipProvider>
  );
}

export function AppLayout() {
  return (
    <AppShellProvider>
      <AppLayoutFrame />
    </AppShellProvider>
  );
}
