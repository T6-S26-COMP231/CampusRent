import mongoose, { Schema } from 'mongoose';

/**
 * US-17.3 — Message persistence.
 *
 * One Message belongs to exactly one Conversation (conversation_id).
 * Sender is stored as a user id only — names/emails are joined when needed.
 * Body is stored permanently after trim; blank/whitespace-only bodies are rejected.
 *
 * Participant authorization and the send API belong to later US-17 tasks.
 * Chronological listing uses created_at then _id (stable numeric counter id).
 */

/** Matches the approved US-17.1 frontend design limit. */
export const MESSAGE_MAX_LENGTH = 2000;

export interface MessageDoc {
  _id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: Date;
}

function assertPositiveInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return numeric;
}

/** Normalize and validate message body for persistence. */
export function normalizeMessageBody(raw: unknown): string {
  if (raw == null) {
    throw new Error('Message body is required');
  }
  if (typeof raw !== 'string') {
    throw new Error('Message body must be a string');
  }
  const body = raw.trim();
  if (body.length === 0) {
    throw new Error('Message body cannot be blank');
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Message body cannot exceed ${MESSAGE_MAX_LENGTH} characters`);
  }
  return body;
}

export function assertMessageIdentifiers(
  conversationId: unknown,
  senderId: unknown
): { conversation_id: number; sender_id: number } {
  return {
    conversation_id: assertPositiveInteger(conversationId, 'conversation_id'),
    sender_id: assertPositiveInteger(senderId, 'sender_id'),
  };
}

const messageSchema = new Schema<MessageDoc>(
  {
    _id: { type: Number, required: true },
    conversation_id: { type: Number, required: true, index: true, min: 1 },
    sender_id: { type: Number, required: true, index: true, min: 1 },
    body: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/** Supports US-18-style history queries: conversation + time + stable id. */
messageSchema.index(
  { conversation_id: 1, created_at: 1, _id: 1 },
  { name: 'idx_message_conversation_chronology' }
);

messageSchema.pre('validate', function () {
  const ids = assertMessageIdentifiers(this.conversation_id, this.sender_id);
  this.conversation_id = ids.conversation_id;
  this.sender_id = ids.sender_id;
  this.body = normalizeMessageBody(this.body);
});

export const Message =
  mongoose.models.Message || mongoose.model<MessageDoc>('Message', messageSchema);

/**
 * US-17 send + US-18.3 history API response contract.
 * Frontend Message type expects exactly these fields (ISO created_at).
 * Sender display names are resolved from conversation counterpart data, not here.
 */
export function toMessageRow(message: MessageDoc) {
  return {
    id: message._id,
    conversation_id: message.conversation_id,
    sender_id: message.sender_id,
    body: message.body,
    created_at: message.created_at.toISOString(),
  };
}

/** Deterministic oldest → newest order for a conversation thread. */
export function sortMessagesChronologically(messages: MessageDoc[]): MessageDoc[] {
  return [...messages].sort((a, b) => {
    const aTime = a.created_at.getTime();
    const bTime = b.created_at.getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a._id - b._id;
  });
}
