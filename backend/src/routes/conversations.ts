import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import {
  Conversation,
  ConversationDoc,
  ConversationIdentity,
  conversationIdentity,
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
 * US-16.5 — participant authorization and duplicate prevention.
 *
 * Body: { listing_id, recipient_id }. Initiator is always req.user.id.
 *
 * Authorization:
 * - Both participants must be distinct verified registered students.
 * - One participant must be the listing owner.
 * - Non-owner initiator may only message the listing owner (prospective renter).
 * - Listing owner may only message a user who has a rental request for that listing.
 *
 * Duplicates:
 * - Same listing + normalized participant pair returns the existing row (200).
 * - First create returns 201. Concurrent creates catch MongoDB 11000 and return 200.
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
