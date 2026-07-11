import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxPanel } from './InboxPanel';
import { makeInboxMessage, makeParticipant } from '@/test/factories';
import * as teambridgeClient from '@/api/teambridgeClient';

const localUser = {
  schemaVersion: 1 as const,
  firstName: 'Nihal',
  lastName: 'N',
  displayName: 'nihal'
};

const config = { daemonBaseUrl: 'http://127.0.0.1:9473', repoRoot: '/tmp/repo' };

describe('InboxPanel', () => {
  it('renders a list of pending and answered messages', () => {
    const messages = [
      makeInboxMessage({ id: 'msg_1', body: 'Question one', status: 'pending' }),
      makeInboxMessage({ id: 'msg_2', body: 'Answered question', status: 'answered', replyText: 'Yes' })
    ];
    render(<InboxPanel messages={messages} localUser={localUser} config={config} workspaceId="ws_123" />);
    expect(screen.getByText('Question one')).toBeTruthy();
    expect(screen.getByText('Answered question')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('shows a reply input only on pending messages addressed to the local user', () => {
    const messages = [
      makeInboxMessage({ id: 'msg_1', toUserId: 'user_nihal', status: 'pending' }),
      makeInboxMessage({ id: 'msg_2', toUserId: 'user_ronish', status: 'pending' }),
      makeInboxMessage({ id: 'msg_3', toUserId: 'user_nihal', status: 'answered' })
    ];
    const participants = [
      makeParticipant({ id: 'user_nihal', displayName: 'nihal' }),
      makeParticipant({ id: 'user_ronish', displayName: 'ronish' })
    ];
    render(
      <InboxPanel messages={messages} localUser={localUser} participants={participants} config={config} workspaceId="ws_123" />
    );
    const replyButtons = screen.getAllByText('Reply');
    expect(replyButtons).toHaveLength(1);
  });

  it('submits a reply and invokes onReply', async () => {
    const message = makeInboxMessage({ id: 'msg_1', toUserId: 'user_nihal', status: 'pending' });
    const participants = [makeParticipant({ id: 'user_nihal', displayName: 'nihal' })];
    const onReply = vi.fn();
    const replySpy = vi.spyOn(teambridgeClient, 'replyInbox').mockResolvedValue({
      ...message,
      status: 'answered',
      replyText: 'Yes, FTS5 works'
    });

    render(
      <InboxPanel
        messages={[message]}
        localUser={localUser}
        participants={participants}
        config={config}
        workspaceId="ws_123"
        onReply={onReply}
      />
    );

    fireEvent.click(screen.getByText('Reply'));
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'Yes, FTS5 works' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(replySpy).toHaveBeenCalledWith('ws_123', 'msg_1', { text: 'Yes, FTS5 works' }, config);
      expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ status: 'answered', replyText: 'Yes, FTS5 works' }));
    });
  });

  it('renders an empty inbox placeholder', () => {
    render(<InboxPanel messages={[]} localUser={localUser} config={config} workspaceId="ws_123" />);
    expect(screen.getByText('No messages yet.')).toBeTruthy();
  });

  it('renders the error message when error is set', () => {
    render(<InboxPanel error="Unable to load inbox" localUser={localUser} config={config} workspaceId="ws_123" />);
    expect(screen.getByText('Unable to load inbox')).toBeTruthy();
  });
});
