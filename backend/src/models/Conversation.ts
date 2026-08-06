import mongoose, { Schema } from 'mongoose';

/**
 * US-16.3 — Conversation persistence.
 *
 * One conversation per listing + unordered participant pair (renter/owner).
 * Participant ids are stored in ascending order so A↔B and B↔A collide on the
 * same unique index. Names/emails are not denormalized; join User/Listing when
 * needed.
 *
 * US-17/US-18 may attach Message documents via conversation_id. This model
 * deliberately stores no message payload or history.
 *
 * TAC empty-conversation note (not fully resolved): identity is listing +
 * participants. Message content is US-17. US-16 keeps a conversation shell
 * without inventing placeholder messages pending acceptance review.
 */
export interface ConversationDoc {
  _id: number;
  listing_id: number;
  participant_low_id: number;
  participant_high_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationIdentity {
  listing_id: number;
  participant_low_id: number;
  participant_high_id: number;
}

function assertPositiveInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return numeric;
}

/** Sort two user ids so reversed pairs map to the same identity. */
export function normalizeParticipantIds(
  userIdA: number,
  userIdB: number
): { participant_low_id: number; participant_high_id: number } {
  const a = assertPositiveInteger(userIdA, 'participant id');
  const b = assertPositiveInteger(userIdB, 'participant id');
  if (a === b) {
    throw new Error('Conversation participants must be two different users');
  }
  return a < b
    ? { participant_low_id: a, participant_high_id: b }
    : { participant_low_id: b, participant_high_id: a };
}

/** Build the listing + ordered participant key used for create and duplicate checks. */
export function conversationIdentity(
  listingId: number,
  userIdA: number,
  userIdB: number
): ConversationIdentity {
  const listing_id = assertPositiveInteger(listingId, 'listing_id');
  return {
    listing_id,
    ...normalizeParticipantIds(userIdA, userIdB),
  };
}

export function isConversationParticipant(
  conversation: Pick<ConversationDoc, 'participant_low_id' | 'participant_high_id'>,
  userId: number
): boolean {
  return (
    conversation.participant_low_id === userId ||
    conversation.participant_high_id === userId
  );
}

const conversationSchema = new Schema<ConversationDoc>(
  {
    _id: { type: Number, required: true },
    listing_id: { type: Number, required: true, index: true, min: 1 },
    participant_low_id: { type: Number, required: true, index: true, min: 1 },
    participant_high_id: { type: Number, required: true, index: true, min: 1 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

conversationSchema.index(
  { listing_id: 1, participant_low_id: 1, participant_high_id: 1 },
  { unique: true, name: 'uniq_conversation_listing_participants' }
);

conversationSchema.pre('validate', function () {
  if (
    this.listing_id == null ||
    this.participant_low_id == null ||
    this.participant_high_id == null
  ) {
    throw new Error('Conversation requires listing_id and both participants');
  }

  const identity = conversationIdentity(
    this.listing_id,
    this.participant_low_id,
    this.participant_high_id
  );

  // Normalize if callers supplied participants out of order.
  this.listing_id = identity.listing_id;
  this.participant_low_id = identity.participant_low_id;
  this.participant_high_id = identity.participant_high_id;
});

export const Conversation =
  mongoose.models.Conversation ||
  mongoose.model<ConversationDoc>('Conversation', conversationSchema);

export function toConversationRow(conversation: ConversationDoc) {
  return {
    id: conversation._id,
    listing_id: conversation.listing_id,
    participant_low_id: conversation.participant_low_id,
    participant_high_id: conversation.participant_high_id,
    participant_ids: [
      conversation.participant_low_id,
      conversation.participant_high_id,
    ],
    created_at: conversation.created_at.toISOString(),
    updated_at: conversation.updated_at.toISOString(),
  };
}
