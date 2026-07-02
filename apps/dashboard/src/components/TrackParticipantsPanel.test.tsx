import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
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
    expect(screen.getByText(/teambridge\/billing-refactor\/ronish/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy();
  });
});
