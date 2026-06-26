import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
import { WorkspaceDetails } from './WorkspaceDetails';

describe('WorkspaceDetails', () => {
  it('asks the user to select a workspace before status is loaded', () => {
    render(<WorkspaceDetails />);

    expect(screen.getByText('Select a workspace to inspect participants and branches.')).toBeTruthy();
  });

  it('renders participants, branches, agent, and status', () => {
    render(<WorkspaceDetails status={makeWorkspaceStatus()} />);

    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('ronish')).toBeTruthy();
    expect(screen.getByText('teambridge/billing-refactor/ronish')).toBeTruthy();
    expect(screen.getByText('cursor')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });
});
