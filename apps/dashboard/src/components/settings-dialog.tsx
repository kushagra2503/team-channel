import { useState } from 'react';
import { IconBug } from '@tabler/icons-react';
import type { CoordClientConfig } from '@/api/coordClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider
} from '@/components/ui/sidebar';
import { DevPfpPanel } from './dev-pfp-panel';

export type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CoordClientConfig;
};

type SettingsPage = 'dev';

const PAGES: { id: SettingsPage; label: string; description: string }[] = [
  { id: 'dev', label: 'Dev', description: 'Experimental tools and generators.' }
];

export function SettingsDialog({ open, onOpenChange, config }: SettingsDialogProps) {
  const [page, setPage] = useState<SettingsPage>('dev');
  const active = PAGES.find((p) => p.id === page) ?? PAGES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>{active.description}</DialogDescription>
        </DialogHeader>

        <SidebarProvider className="h-[34rem] min-h-0 w-full">
          <Sidebar collapsible="none" className="border-r">
            <SidebarHeader className="px-4 py-4 text-sm font-medium">Settings</SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={page === 'dev'} onClick={() => setPage('dev')}>
                      <IconBug />
                      <span>Dev</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <SidebarInset className="flex flex-col">
            <div className="flex flex-col gap-1 border-b px-6 py-4">
              <span className="text-sm font-medium">{active.label}</span>
              <span className="text-xs text-muted-foreground">{active.description}</span>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {page === 'dev' ? <DevPfpPanel config={config} /> : null}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
