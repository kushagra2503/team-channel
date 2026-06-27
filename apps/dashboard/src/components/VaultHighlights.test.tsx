import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeVaultContext } from '../test/factories';
import { VaultHighlights } from './VaultHighlights';

describe('VaultHighlights', () => {
  it('renders nothing when no context is provided', () => {
    const { container } = render(<VaultHighlights />);

    expect(container.firstChild).toBeNull();
  });

  it('renders included paths, seq, truncated flag, and content preview', () => {
    const context = makeVaultContext({
      content: '--- decisions.md ---\n# Decisions\n- Backend owns invoice state.\n\n--- observations.md ---\n# Observations\n',
      includedPaths: ['decisions.md', 'observations.md']
    });

    render(<VaultHighlights context={context} />);

    expect(screen.getAllByText('decisions.md').length).toBeGreaterThan(0);
    expect(screen.getByText('observations.md')).toBeTruthy();
    expect(screen.getByText(/Latest note #/)).toBeTruthy();
    expect(screen.getByText(/Backend owns invoice state/)).toBeTruthy();
  });
});
