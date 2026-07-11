import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeammateDeltaPanel } from './TeammateDeltaPanel';
import { makeContextPointer, makeParticipant, makeWorkspaceEvent } from '@/test/factories';

const config = { daemonBaseUrl: 'http://127.0.0.1:9473', repoRoot: '/tmp/repo' };
const participants = [
  makeParticipant({ id: 'user_ronish', displayName: 'ronish' }),
  makeParticipant({ id: 'user_nihal', displayName: 'nihal' })
];

describe('TeammateDeltaPanel', () => {
  it('renders events newer than the context pointer', () => {
    const events = [
      makeWorkspaceEvent({ id: 'evt_1', actorId: 'user_ronish', seq: 1, type: 'publish' }),
      makeWorkspaceEvent({ id: 'evt_2', actorId: 'user_nihal', seq: 4, type: 'publish' }),
      makeWorkspaceEvent({ id: 'evt_3', actorId: 'user_ronish', seq: 5, type: 'team_ask' })
    ];
    const pointer = makeContextPointer({ lastSeenSeq: 3 });
    render(<TeammateDeltaPanel events={events} participants={participants} pointer={pointer} config={config} />);
    expect(screen.getByText('Nihal')).toBeTruthy();
    expect(screen.getByText('Ronish')).toBeTruthy();
    expect(screen.getAllByText('published')).toHaveLength(1);
    expect(screen.getByText('asked')).toBeTruthy();
  });

  it('shows an empty placeholder when there are no new events', () => {
    const events = [makeWorkspaceEvent({ seq: 1 })];
    const pointer = makeContextPointer({ lastSeenSeq: 5 });
    render(<TeammateDeltaPanel events={events} participants={participants} pointer={pointer} config={config} />);
    expect(screen.getByText('No new teammate activity.')).toBeTruthy();
  });

  it('invokes onMarkSeen when the button is clicked', () => {
    const events = [makeWorkspaceEvent({ seq: 5 })];
    const pointer = makeContextPointer({ lastSeenSeq: 3 });
    const onMarkSeen = vi.fn();
    render(
      <TeammateDeltaPanel events={events} participants={participants} pointer={pointer} config={config} onMarkSeen={onMarkSeen} />
    );
    fireEvent.click(screen.getByText('Mark seen'));
    expect(onMarkSeen).toHaveBeenCalled();
  });

  it('renders the error message when error is set', () => {
    render(<TeammateDeltaPanel error="Unable to load updates" config={config} />);
    expect(screen.getByText('Unable to load updates')).toBeTruthy();
  });
});
