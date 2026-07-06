import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventFeed } from './EventFeed';
import { makeWorkspaceEvent } from '@/test/factories';

describe('EventFeed', () => {
  it('renders events in reverse seq order', () => {
    const events = [
      makeWorkspaceEvent({ id: 'evt_1', seq: 3 }),
      makeWorkspaceEvent({ id: 'evt_2', seq: 5 }),
      makeWorkspaceEvent({ id: 'evt_3', seq: 1 })
    ];
    render(<EventFeed events={events} />);
    const items = screen.getAllByText(/user_ronish/);
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
    render(<EventFeed events={[makeWorkspaceEvent({ type: 'publish' })]} />);
    expect(screen.getByText('publish')).toBeTruthy();
  });

  it('shows target file and actor for publish events', () => {
    render(
      <EventFeed events={[makeWorkspaceEvent({ targetFile: 'decisions.md', actorId: 'user_nihal' })]} />
    );
    expect(screen.getByText('decisions.md')).toBeTruthy();
    expect(screen.getByText('user_nihal')).toBeTruthy();
  });

  it('shows at most 20 events', () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      makeWorkspaceEvent({ id: `evt_${i}`, seq: i + 1 })
    );
    render(<EventFeed events={events} />);
    const items = screen.getAllByText(/user_ronish/);
    expect(items).toHaveLength(20);
  });

  it('renders conflict_detected and checkpoint_created badges with distinct colors', () => {
    render(
      <EventFeed
        events={[
          makeWorkspaceEvent({ id: 'evt_c', seq: 2, type: 'conflict_detected' }),
          makeWorkspaceEvent({ id: 'evt_k', seq: 1, type: 'checkpoint_created' })
        ]}
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
