import { useState } from 'react';
import type { InboxMessage } from '@teambridge/core';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type InboxPanelProps = {
  messages?: InboxMessage[];
  error?: string;
  onReply?: (messageId: string, text: string) => Promise<void>;
};

export function InboxPanel({ messages, error, onReply }: InboxPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-label="Inbox" className="p-3">
        <p role="alert" className="text-xs text-destructive">{error}</p>
      </section>
    );
  }

  return (
    <section aria-label="Inbox" className="py-2">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Inbox</SidebarGroupLabel>
        {!messages ? (
          <p className="px-2 text-xs text-muted-foreground">Loading inbox…</p>
        ) : messages.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No inbox messages.</p>
        ) : (
          <div className="flex flex-col gap-2 px-2">
            {messages.map((message) => {
              const canReply = message.status === 'pending' && !message.replyTo && onReply;
              return (
                <div key={message.id} className="rounded-lg border bg-background/60 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{message.status}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{message.id}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{message.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {message.replyTo ? `reply to ${message.replyTo}` : `${message.fromUserId} -> ${message.toUserId}`}
                  </p>
                  {canReply ? (
                    <form
                      className="mt-2 flex gap-1"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const text = drafts[message.id]?.trim();
                        if (!text) return;
                        setBusy(message.id);
                        try {
                          await onReply(message.id, text);
                          setDrafts((current) => ({ ...current, [message.id]: '' }));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Input
                        value={drafts[message.id] ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                        placeholder="Reply…"
                        className="h-7 text-xs"
                      />
                      <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={busy === message.id}>
                        Reply
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SidebarGroup>
    </section>
  );
}
