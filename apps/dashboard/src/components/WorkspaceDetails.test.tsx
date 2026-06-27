import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStatus } from '../test/factories';
import { WorkspaceDetails } from './WorkspaceDetails';

describe('WorkspaceDetails', () => {
  it('renders nothing when no status is provided', () => {
    const { container } = render(<WorkspaceDetails />);

    expect(container.firstChild).toBeNull();
  });

  it('renders member rows with a count and no Online label', () => {
    render(<WorkspaceDetails status={makeWorkspaceStatus()} />);

    expect(screen.getByText('1 Member')).toBeTruthy();
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
    expect(screen.getByText('Ronish')).toBeTruthy();
  });
});
