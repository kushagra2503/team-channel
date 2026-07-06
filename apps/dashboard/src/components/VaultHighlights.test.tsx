import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeVaultContext } from '../test/factories';
import { createdAt } from '../test/factories';
import { VaultHighlights } from './VaultHighlights';

describe('VaultHighlights', () => {
  it('renders nothing when no context is provided', () => {
    const { container } = render(<VaultHighlights />);

    expect(container.firstChild).toBeNull();
  });

  it('renders included paths, seq, truncated flag, and content preview', () => {
    const context = makeVaultContext({
      content: '--- decisions.md ---\n# Decisions\n- [tb color=#ef4444 assign=ronish] Backend owns invoice state.\n\n--- observations.md ---\n# Observations\n',
      includedPaths: ['decisions.md', 'observations.md']
    });

    render(<VaultHighlights context={context} workspaceId="ws_123" participants={[{ id: 'user_ronish', displayName: 'ronish', workspaceId: 'ws_123', branch: 'main', agent: 'cursor', status: 'active', lastSeenAt: createdAt }]} />);

    expect(screen.getByRole('button', { name: 'Search vault' })).toBeTruthy();
    expect(screen.getByText(/seq/)).toBeTruthy();
    expect(screen.getAllByText('decisions.md').length).toBeGreaterThan(0);
    expect(screen.getByText(/Backend owns invoice state/)).toBeTruthy();
    expect(screen.getByText(/Assigned to/)).toBeTruthy();
  });
});
