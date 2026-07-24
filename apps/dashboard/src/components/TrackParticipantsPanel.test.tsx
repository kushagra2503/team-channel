import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus, makeParticipant } from '../test/factories';
import { TrackParticipantsPanel } from './TrackParticipantsPanel';

describe('TrackParticipantsPanel', () => {
  it('shows empty state when no status is provided', () => {
    render(<TrackParticipantsPanel />);

    expect(screen.getByText('Select a track to see participants.')).toBeTruthy();
  });

  it('renders participant rows with name and status', () => {
    render(<TrackParticipantsPanel status={makeWorkspaceStatus()} />);

    expect(screen.getByText('Ronish')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/cursor/)).toBeTruthy();
    expect(screen.getByText(/coord\/billing-refactor\/ronish/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy();
  });

  it('renders relative last-seen time for idle participants with lastSeenAt', () => {
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const status = makeWorkspaceStatus({
      participants: [makeParticipant({ status: 'idle', lastSeenAt: recent })]
    });
    render(<TrackParticipantsPanel status={status} />);

    expect(screen.getByText(/last seen 2m ago/)).toBeTruthy();
  });

  it('renders relative last-seen time for offline participants with lastSeenAt', () => {
    const recent = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const status = makeWorkspaceStatus({
      participants: [makeParticipant({ status: 'offline', lastSeenAt: recent })]
    });
    render(<TrackParticipantsPanel status={status} />);

    expect(screen.getByText(/last seen 3h ago/)).toBeTruthy();
  });

  it('does not render last-seen time when lastSeenAt is absent', () => {
    const status = makeWorkspaceStatus({
      participants: [makeParticipant({ status: 'idle', lastSeenAt: undefined as unknown as string })]
    });
    render(<TrackParticipantsPanel status={status} />);

    expect(screen.queryByText(/last seen/)).toBeNull();
  });

  it('does not render last-seen time for active participants', () => {
    const recent = new Date(Date.now() - 30 * 1000).toISOString();
    const status = makeWorkspaceStatus({
      participants: [makeParticipant({ status: 'active', lastSeenAt: recent })]
    });
    render(<TrackParticipantsPanel status={status} />);

    expect(screen.queryByText(/last seen/)).toBeNull();
  });
});
