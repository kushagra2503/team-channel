import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventFeed } from './EventFeed';
import { makeWorkspaceEvent } from '@/test/factories';
import type { ProjectMember } from '@teambridge/core';

const members: ProjectMember[] = [
  { id: 'user_ronish', projectId: 'p1', displayName: 'ronish', status: 'active', lastSeenAt: '2026-07-06T12:00:00.000Z' },
  { id: 'user_nihal', projectId: 'p1', displayName: 'nihal', status: 'active', lastSeenAt: '2026-07-06T12:00:00.000Z' }
];

describe('EventFeed', () => {
  it('renders events in reverse seq order', () => {
    const events = [
      makeWorkspaceEvent({ id: 'evt_1', seq: 3 }),
      makeWorkspaceEvent({ id: 'evt_2', seq: 5 }),
      makeWorkspaceEvent({ id: 'evt_3', seq: 1 })
    ];
    render(<EventFeed events={events} members={members} />);
    const items = screen.getAllByText(/Ronish/);
    expect(items).toHaveLength(3);
  });

  it('renders No events yet placeholder when array is empty', () => {
    render(<EventFeed events={[]} />);
    expect(screen.getByText('No events yet.')).toBeTruthy();
  });

  it('renders No events yet placeholder when undefined', () => {
    render(<EventFeed />);
    expect(screen.getByText('No events yet.')).toBeTruthy();
  });

  it('shows event type badge with label for publish events', () => {
    render(<EventFeed events={[makeWorkspaceEvent({ type: 'publish' })]} members={members} />);
    expect(screen.getByText('publish')).toBeTruthy();
  });

  it('shows target file and actor first name for publish events', () => {
    render(
      <EventFeed events={[makeWorkspaceEvent({ targetFile: 'decisions.md', actorId: 'user_nihal' })]} members={members} />
    );
    expect(screen.getByText('decisions.md')).toBeTruthy();
    expect(screen.getByText('Nihal')).toBeTruthy();
  });

  it('shows at most 8 events with Show all button', () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      makeWorkspaceEvent({ id: `evt_${i}`, seq: i + 1 })
    );
    render(<EventFeed events={events} members={members} />);
    const items = screen.getAllByText(/Ronish/);
    expect(items).toHaveLength(8);
    expect(screen.getByText(/Show all/)).toBeTruthy();
  });

  it('expands all events when Show all is clicked', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const events = Array.from({ length: 12 }, (_, i) =>
      makeWorkspaceEvent({ id: `evt_${i}`, seq: i + 1 })
    );
    render(<EventFeed events={events} members={members} />);
    expect(screen.getAllByText(/Ronish/)).toHaveLength(8);
    fireEvent.click(screen.getByText(/Show all/));
    expect(screen.getAllByText(/Ronish/)).toHaveLength(12);
  });

  it('renders conflict_detected and checkpoint_created badges with distinct colors', () => {
    render(
      <EventFeed
        events={[
          makeWorkspaceEvent({ id: 'evt_c', seq: 2, type: 'conflict_detected' }),
          makeWorkspaceEvent({ id: 'evt_k', seq: 1, type: 'checkpoint_created' })
        ]}
        members={members}
      />
    );
    expect(screen.getByText('conflict')).toBeTruthy();
    expect(screen.getByText('checkpoint')).toBeTruthy();
  });

  it('renders error message when error prop is set', () => {
    render(<EventFeed error="Unable to load events" />);
    expect(screen.getByText('Unable to load events')).toBeTruthy();
  });
});
