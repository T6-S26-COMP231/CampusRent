import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import {
  Conversation,
  ConversationDoc,
  ConversationIdentity,
  conversationIdentity,
  isConversationParticipant,
  toConversationRow,
} from '../models/Conversation';
import { Listing } from '../models/Listing';
import { RentalRequest } from '../models/RentalRequest';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

async function findConversationByIdentity(identity: ConversationIdentity) {
  return Conversation.findOne(identity);
}

/**
 * Enrich for the messaging dashboard.
 * No Message documents — preview stays empty until US-17. The frontend shows
 * the truthful “No messages yet” label when latest_message_preview is null.
 */
async function enrichConversation(conversation: ConversationDoc, viewerId: number) {
  const listing = await Listing.findById(conversation.listing_id).lean();
  const counterpartId =
    conversation.participant_low_id === viewerId
      ? conversation.participant_high_id
      : conversation.participant_low_id;
  const counterpart = await User.findById(counterpartId).lean();

  return {
    ...toConversationRow(conversation),
    listing: listing
      ? {
          id: listing._id,
          title: listing.title,
        }
      : null,
    counterpart: counterpart
      ? {
          id: counterpart._id,
          first_name: counterpart.first_name,
          last_name: counterpart.last_name,
        }
      : null,
    latest_message_preview: null as string | null,
  };
}

/**
 * US-16.6 — list conversations for the authenticated participant only.
 * Sorted newest updated first. Empty-conversation shell assumption unchanged:
 * identity is listing + participants; message content belongs to US-17.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const viewerId = req.user!.id;
    const conversations = await Conversation.find({
      $or: [{ participant_low_id: viewerId }, { participant_high_id: viewerId }],
    }).sort({ updated_at: -1, created_at: -1 });

    return res.json(
      await Promise.all(
        conversations.map((conversation) => enrichConversation(conversation, viewerId))
      )
    );
  })
);

/**
 * US-16.6 — open a single conversation shell. Participants only.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!isConversationParticipant(conversation, req.user!.id)) {
      return res.status(403).json({ error: 'Only conversation participants may view this conversation' });
    }

    return res.json(await enrichConversation(conversation, req.user!.id));
  })
);

/**
 * US-16.5 — participant authorization and duplicate prevention.
 *
 * Body: { listing_id, recipient_id }. Initiator is always req.user.id.
 *
 * Empty-conversation assumption (TAC ambiguity, not fully resolved):
 * US-16 identifies a conversation by listing + participants only. Message content
 * belongs to US-17. This endpoint still creates a conversation shell without
 * inventing placeholder messages; acceptance review should confirm that
 * interpretation against the TAC “empty conversations are not allowed” rule.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { listing_id, recipient_id } = req.body as {
      listing_id?: unknown;
      recipient_id?: unknown;
    };

    if (listing_id === undefined || listing_id === null || listing_id === '') {
      return res.status(400).json({ error: 'listing_id is required' });
    }
    if (recipient_id === undefined || recipient_id === null || recipient_id === '') {
      return res.status(400).json({ error: 'recipient_id is required' });
    }

    const listingId = Number(listing_id);
    const recipientId = Number(recipient_id);

    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'listing_id must be a positive integer' });
    }
    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      return res.status(400).json({ error: 'recipient_id must be a positive integer' });
    }

    const initiatorId = req.user!.id;
    if (recipientId === initiatorId) {
      return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
    }

    const listing = await Listing.findById(listingId).lean();
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const recipient = await User.findById(recipientId).lean();
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    if (recipient.role !== 'student' || recipient.verification_status !== 'verified') {
      return res.status(403).json({
        error: 'Conversations may only be started with verified registered students',
      });
    }
    if (recipient.status === 'suspended') {
      return res.status(403).json({ error: 'Recipient account is not available' });
    }

    const isOwnerInitiator = listing.owner_id === initiatorId;
    const isOwnerRecipient = listing.owner_id === recipientId;

    if (isOwnerInitiator) {
      const renterRequest = await RentalRequest.findOne({
        listing_id: listingId,
        renter_id: recipientId,
      })
        .select('_id')
        .lean();

      if (!renterRequest) {
        return res.status(403).json({
          error:
            'Listing owners may only start conversations with users who requested this listing',
        });
      }
    } else if (!isOwnerRecipient) {
      return res.status(403).json({
        error: 'Non-owners may only start a conversation with the listing owner',
      });
    }

    let identity: ConversationIdentity;
    try {
      identity = conversationIdentity(listingId, initiatorId, recipientId);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid conversation participants',
      });
    }

    const existing = await findConversationByIdentity(identity);
    if (existing) {
      return res.status(200).json(toConversationRow(existing));
    }

    try {
      const created = await Conversation.create({
        _id: await nextId('conversations'),
        ...identity,
      });
      return res.status(201).json(toConversationRow(created));
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const raced = await findConversationByIdentity(identity);
      if (!raced) {
        throw error;
      }
      return res.status(200).json(toConversationRow(raced as ConversationDoc));
    }
  })
);

export default router;
