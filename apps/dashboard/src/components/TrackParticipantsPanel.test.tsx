import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
import { TrackParticipantsPanel } from './TrackParticipantsPanel';

describe('TrackParticipantsPanel', () => {
  it('renders nothing when no status is provided', () => {
    const { container } = render(<TrackParticipantsPanel />);

    expect(container.firstChild).toBeNull();
  });

  it('renders participant rows with branch and track label', () => {
    render(<TrackParticipantsPanel status={makeWorkspaceStatus()} />);

    expect(screen.getByText('1 on this track')).toBeTruthy();
    expect(screen.getByText('Ronish')).toBeTruthy();
    expect(screen.getByText('teambridge/billing-refactor/ronish')).toBeTruthy();
  });
});
