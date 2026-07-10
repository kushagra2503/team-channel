export type InboxStatus = 'pending' | 'answered' | 'expired' | 'cancelled';

export type InboxMessage = {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  status: InboxStatus;
  body: string;
  replyTo?: string;
  eventId?: string;
  createdAt: string;
  answeredAt?: string;
};

export type AskRequest = {
  to: string;
  text: string;
  wait?: boolean;
};

export type ReplyRequest = {
  messageId: string;
  text: string;
};

export type TeamAskPayload = {
  to: string;
  text: string;
};

export type TeamReplyPayload = {
  replyToMessageId: string;
  text: string;
};

