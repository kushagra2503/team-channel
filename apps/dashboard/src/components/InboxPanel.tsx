import { useState } from 'react';
import { motion } from 'motion/react';
import type { InboxMessage, LocalUserProfile, Participant } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relative-time';
import { ParticipantAvatar } from '@/components/participant-avatar';
import { avatarUrlForDisplayName } from '@/components/member-avatar';
import { participantFirstName } from './participantDisplay';
import type { TeambridgeClientConfig } from '@/api/teambridgeClient';

export type InboxPanelProps = {
  messages?: InboxMessage[];
  localUser?: LocalUserProfile | null;
  participants?: Participant[];
  config?: TeambridgeClientConfig;
  error?: string;
  avatarRev?: number;
  onReply?: (messageId: string, text: string) => Promise<void>;
};

const STATUS_STYLES: Record<InboxMessage['status'], { label: string; className: string }> = {
  pending: { label: 'pending', className: 'bg-amber-500/15 text-amber-600' },
  answered: { label: 'answered', className: 'bg-emerald-500/15 text-emerald-600' },
  expired: { label: 'expired', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'cancelled', className: 'bg-muted text-muted-foreground' }
};

function getParticipant(participants: Participant[] = [], userId: string): Participant | undefined {
  return participants.find((p) => p.id === userId);
}

export function InboxPanel({
  messages,
  localUser,
  participants = [],
  config,
  error,
  avatarRev,
  onReply
}: InboxPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Inbox" className="py-2">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <section aria-label="Inbox" className="py-2">
        <p className="text-xs text-muted-foreground">No messages yet.</p>
      </section>
    );
  }

  const sorted = [...messages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleReply = async (messageId: string) => {
    const text = drafts[messageId]?.trim();
    if (!text || !onReply) return;
    setBusy(messageId);
    setReplyError(null);
    try {
      await onReply(messageId, text);
      setDrafts((current) => ({ ...current, [messageId]: '' }));
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Unable to send reply');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Inbox" className="flex flex-col py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Inbox</SidebarGroupLabel>
        <div className="flex flex-col gap-2">
          {sorted.map((message, i) => {
            const statusStyle = STATUS_STYLES[message.status];
            const fromParticipant = getParticipant(participants, message.fromUserId);
            const toParticipant = getParticipant(participants, message.toUserId);
            const fromName = fromParticipant?.displayName ?? message.fromUserId.replace(/^user_/, '');
            const toName = toParticipant?.displayName ?? message.toUserId.replace(/^user_/, '');
            const avatarUrl = config ? avatarUrlForDisplayName(fromName, config, avatarRev) : undefined;
            const isRecipient = localUser?.displayName === toName;
            const canReply = message.status === 'pending' && isRecipient && onReply;
            const isReplying = busy === message.id || drafts[message.id] !== undefined;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.15) }}
                className="rounded-md border border-border/50 bg-card p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <ParticipantAvatar avatarUrl={avatarUrl} displayName={fromName} size={16} />
                  <span className="font-medium text-foreground">{participantFirstName(fromName)}</span>
                  <span className="text-muted-foreground">asked</span>
                  <span className="font-medium text-foreground">{participantFirstName(toName)}</span>
                  <Badge variant="outline" className={cn('ml-auto text-[10px]', statusStyle.className)}>
                    {statusStyle.label}
                  </Badge>
                </div>
                <p className="mt-1.5 text-foreground/90">{message.body}</p>
                {message.status === 'answered' && message.replyText ? (
                  <div className="mt-1.5 rounded bg-muted/50 p-1.5">
                    <p className="text-muted-foreground">{message.replyText}</p>
                  </div>
                ) : null}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(message.createdAt)}
                  </span>
                  {canReply ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDrafts((current) => ({ ...current, [message.id]: '' }));
                        setReplyError(null);
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Reply
                    </button>
                  ) : null}
                </div>
                {isReplying ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Input
                      aria-label="Reply text"
                      placeholder="Write a reply…"
                      value={drafts[message.id] ?? ''}
                      onChange={(e) => setDrafts((current) => ({ ...current, [message.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReply(message.id);
                        }
                      }}
                      className="h-7 text-xs"
                    />
                    {replyError && busy === message.id ? (
                      <p role="alert" className="text-[10px] text-destructive">{replyError}</p>
                    ) : null}
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setDrafts((current) => {
                            const next = { ...current };
                            delete next[message.id];
                            return next;
                          });
                          setReplyError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        disabled={!drafts[message.id]?.trim() || busy === message.id}
                        onClick={() => handleReply(message.id)}
                      >
                        {busy === message.id ? 'Sending…' : 'Send'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </SidebarGroup>
    </section>
  );
}
