import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeWorkspace } from '../test/factories';
import { WorkspaceList } from './WorkspaceList';

function renderWorkspaceList(element: ReactElement) {
  return render(
    <TooltipProvider>
      <SidebarProvider>{element}</SidebarProvider>
    </TooltipProvider>
  );
}

describe('WorkspaceList', () => {
  it('renders empty state when there are no workspaces', () => {
    renderWorkspaceList(<WorkspaceList workspaces={[]} onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('No workspaces found.')).toBeTruthy();
  });

  it('renders workspace session and local indicator', () => {
    renderWorkspaceList(<WorkspaceList workspaces={[makeWorkspace()]} onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('Billing refactor')).toBeTruthy();
    expect(screen.getByLabelText('This session is local')).toBeTruthy();
  });

  it('does not show empty state while an error is visible', () => {
    renderWorkspaceList(<WorkspaceList workspaces={[]} error="Daemon unavailable." onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('Daemon unavailable.')).toBeTruthy();
    expect(screen.queryByText('No workspaces found.')).toBeNull();
  });
});
