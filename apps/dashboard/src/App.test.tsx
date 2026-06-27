import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { makeVaultContext, makeWorkspace, makeWorkspaceStatus } from './test/factories';

const api = vi.hoisted(() => ({
  getDefaultClientConfig: vi.fn(() => ({})),
  DEFAULT_DAEMON_BASE_URL: 'http://127.0.0.1:9473',
  listWorkspaces: vi.fn(),
  getWorkspaceStatus: vi.fn(),
  getVaultContext: vi.fn()
}));

vi.mock('./api/teambridgeClient', () => api);

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
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

    expect(await screen.findByText('Ronish')).toBeTruthy();
    expect(screen.queryByText('Online')).toBeNull();
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
    api.listWorkspaces
      .mockResolvedValueOnce({ workspaces: [workspace] })
      .mockResolvedValueOnce({ workspaces: [] });
    api.getWorkspaceStatus.mockResolvedValue(makeWorkspaceStatus({ workspace }));
    api.getVaultContext.mockResolvedValue({
      context: makeVaultContext()
    });

    const { rerender } = render(<App />);

    expect(await screen.findByText('Ronish')).toBeTruthy();
    // Re-mount to simulate a follow-up refresh that returns an empty workspace list.
    rerender(<App key="second" />);

    await waitFor(() => {
      expect(screen.queryByText('Ronish')).toBeNull();
    });
  });
});
