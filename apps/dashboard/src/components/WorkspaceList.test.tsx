import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeWorkspace } from '../test/factories';
import { WorkspaceList } from './WorkspaceList';

describe('WorkspaceList', () => {
  it('renders empty state when there are no workspaces', () => {
    render(<WorkspaceList workspaces={[]} onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('No workspaces found.')).toBeTruthy();
  });

  it('renders workspace session and relay mode', () => {
    render(<WorkspaceList workspaces={[makeWorkspace()]} onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('billing-refactor')).toBeTruthy();
    expect(screen.getByText('local')).toBeTruthy();
  });

  it('does not show empty state while an error is visible', () => {
    render(<WorkspaceList workspaces={[]} error="Daemon unavailable." onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText('Daemon unavailable.')).toBeTruthy();
    expect(screen.queryByText('No workspaces found.')).toBeNull();
  });
});
