import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
import { WorkspaceDetails } from './WorkspaceDetails';

describe('WorkspaceDetails', () => {
  it('asks the user to select a workspace before status is loaded', () => {
    render(<WorkspaceDetails />);

    expect(screen.getByText('Select a workspace to inspect participants and branches.')).toBeTruthy();
  });

  it('renders member rows with a count and no Online label', () => {
    render(<WorkspaceDetails status={makeWorkspaceStatus()} />);

    expect(screen.getByText('1 Member')).toBeTruthy();
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
    expect(screen.getByText('Ronish')).toBeTruthy();
  });
});
