import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeVaultContext, makeWorkspace, makeWorkspaceStatus } from './test/factories';

const api = vi.hoisted(() => ({
  getDefaultClientConfig: vi.fn(() => ({})),
  listWorkspaces: vi.fn(),
  getWorkspaceStatus: vi.fn(),
  getVaultContext: vi.fn()
}));

vi.mock('./api/teambridgeClient', () => api);

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getDefaultClientConfig.mockReturnValue({});
  });

  it('loads workspace list, selected workspace status, and vault context', async () => {
    const workspace = makeWorkspace({ baseCommit: 'abc123' });
    api.listWorkspaces.mockResolvedValue({ workspaces: [workspace] });
    api.getWorkspaceStatus.mockResolvedValue(makeWorkspaceStatus({ workspace, lastSeq: 2 }));
    api.getVaultContext.mockResolvedValue({
      context: makeVaultContext()
    });

    render(<App />);

    expect(await screen.findByText('ronish')).toBeTruthy();
    expect(screen.getByText('teambridge/billing-refactor/ronish')).toBeTruthy();
    expect(screen.getAllByText('decisions.md').length).toBeGreaterThan(0);
    expect(screen.getByText(/Backend owns invoice state/)).toBeTruthy();
    expect(api.getWorkspaceStatus).toHaveBeenCalledWith('ws_123', {}, expect.any(AbortSignal));
    expect(api.getVaultContext).toHaveBeenCalledWith('ws_123', {}, expect.any(AbortSignal));
  });

  it('shows daemon connection errors instead of a blank screen', async () => {
    api.listWorkspaces.mockRejectedValue(new Error('Unable to reach local Teambridge daemon.'));

    render(<App />);

    expect(await screen.findByText('Unable to reach local Teambridge daemon.')).toBeTruthy();
  });

  it('shows workspace detail and vault errors independently', async () => {
    const workspace = makeWorkspace();
    api.listWorkspaces.mockResolvedValue({ workspaces: [workspace] });
    api.getWorkspaceStatus.mockRejectedValue(new Error('Workspace status failed.'));
    api.getVaultContext.mockRejectedValue(new Error('Vault context failed.'));

    render(<App />);

    expect(await screen.findByText('Workspace status failed.')).toBeTruthy();
    expect(screen.getByText('Vault context failed.')).toBeTruthy();
  });

  it('clears selected workspace when refresh removes it', async () => {
    const workspace = makeWorkspace();
    api.listWorkspaces.mockResolvedValueOnce({ workspaces: [workspace] }).mockResolvedValueOnce({ workspaces: [] });
    api.getWorkspaceStatus.mockResolvedValue(makeWorkspaceStatus({ workspace }));
    api.getVaultContext.mockResolvedValue({
      context: makeVaultContext()
    });

    render(<App />);

    expect(await screen.findByText('ronish')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('No workspaces found.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Select a workspace to inspect participants and branches.')).toBeTruthy();
    });
  });
});
