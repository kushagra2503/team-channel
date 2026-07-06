import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelaySyncHealth } from './RelaySyncHealth';
import { makeRelayStatus, makeSyncStateEntry } from '@/test/factories';

describe('RelaySyncHealth', () => {
  it('renders Connected badge when configured and logged in', () => {
    render(<RelaySyncHealth status={makeRelayStatus({ configured: true, loggedIn: true, pending: 0 })} />);
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('renders Local only when not configured', () => {
    render(<RelaySyncHealth status={makeRelayStatus({ configured: false, loggedIn: false, sync: [] })} />);
    expect(screen.getByText('Local only')).toBeTruthy();
    expect(screen.queryByText('Sync State')).toBeNull();
  });

  it('renders Not logged in when configured but not logged in', () => {
    render(<RelaySyncHealth status={makeRelayStatus({ configured: true, loggedIn: false })} />);
    expect(screen.getByText('Not logged in')).toBeTruthy();
  });

  it('renders sync state entries with workspace ID and seq', () => {
    render(
      <RelaySyncHealth
        status={makeRelayStatus({
          sync: [makeSyncStateEntry({ workspaceId: 'ws_abc', lastRemoteSeq: 42 })]
        })}
      />
    );
    expect(screen.getByText('ws_abc')).toBeTruthy();
    expect(screen.getByText('seq 42')).toBeTruthy();
  });

  it('shows last error in destructive color', () => {
    render(
      <RelaySyncHealth
        status={makeRelayStatus({
          sync: [makeSyncStateEntry({ lastError: 'Connection refused' })]
        })}
      />
    );
    expect(screen.getByText('Connection refused')).toBeTruthy();
  });

  it('shows pending count in amber when > 0', () => {
    render(<RelaySyncHealth status={makeRelayStatus({ pending: 3 })} />);
    expect(screen.getByText('3 pending')).toBeTruthy();
  });

  it('renders loading placeholder when data is undefined and no error', () => {
    render(<RelaySyncHealth />);
    expect(screen.getByText('Loading relay status…')).toBeTruthy();
  });

  it('renders error message when error prop is set', () => {
    render(<RelaySyncHealth error="Unable to reach daemon" />);
    expect(screen.getByText('Unable to reach daemon')).toBeTruthy();
  });
});
