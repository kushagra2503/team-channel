import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
import { TrackParticipantsPanel } from './TrackParticipantsPanel';

describe('TrackParticipantsPanel', () => {
  it('shows empty state when no status is provided', () => {
    render(<TrackParticipantsPanel />);

    expect(screen.getByText('Select a track to see participants.')).toBeTruthy();
  });

  it('renders participant rows with branch', () => {
    render(<TrackParticipantsPanel status={makeWorkspaceStatus()} />);

    expect(screen.getByText('Ronish')).toBeTruthy();
    expect(screen.getByText('teambridge/billing-refactor/ronish')).toBeTruthy();
  });
});
