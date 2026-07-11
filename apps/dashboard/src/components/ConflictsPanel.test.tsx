import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictsPanel } from './ConflictsPanel';
import { makeConflict } from '@/test/factories';

describe('ConflictsPanel', () => {
  it('renders a list of open and resolved conflicts', () => {
    const conflicts = [
      makeConflict({ id: 'c_1', summary: 'Conflict one', status: 'open' }),
      makeConflict({ id: 'c_2', summary: 'Conflict two', status: 'resolved', resolutionText: 'Merged manually' })
    ];
    render(<ConflictsPanel conflicts={conflicts} />);
    expect(screen.getByText('Conflict one')).toBeTruthy();
    expect(screen.getByText('Conflict two')).toBeTruthy();
    expect(screen.getByText('Merged manually')).toBeTruthy();
    expect(screen.getAllByText('open')).toHaveLength(1);
    expect(screen.getAllByText('resolved')).toHaveLength(1);
  });

  it('shows a resolve input only for open conflicts', () => {
    const conflicts = [
      makeConflict({ id: 'c_1', status: 'open' }),
      makeConflict({ id: 'c_2', status: 'resolved' })
    ];
    render(<ConflictsPanel conflicts={conflicts} onResolve={() => Promise.resolve()} />);
    expect(screen.getAllByText('Resolve')).toHaveLength(1);
  });

  it('submits a resolution and invokes onResolve', async () => {
    const conflict = makeConflict({ id: 'c_1', status: 'open' });
    const onResolve = vi.fn().mockResolvedValue(undefined);

    render(<ConflictsPanel conflicts={[conflict]} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Resolve'));
    fireEvent.change(screen.getByLabelText('Resolution text'), { target: { value: 'Took Alice’s version' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('c_1', 'Took Alice’s version');
    });
  });

  it('renders an empty conflicts placeholder', () => {
    render(<ConflictsPanel conflicts={[]} />);
    expect(screen.getByText('No conflicts detected.')).toBeTruthy();
  });

  it('renders the error message when error is set', () => {
    render(<ConflictsPanel error="Unable to load conflicts" />);
    expect(screen.getByText('Unable to load conflicts')).toBeTruthy();
  });
});
