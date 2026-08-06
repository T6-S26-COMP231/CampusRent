import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import {
  Conversation,
  conversationIdentity,
  toConversationRow,
} from '../models/Conversation';
import { Listing } from '../models/Listing';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

/**
 * US-16.4 — start a conversation.
 *
 * Body: { listing_id, recipient_id }. The initiator is always req.user.id.
 * Full owner/renter authorization and duplicate reuse belong to US-16.5.
 *
 * Empty-conversation note (TAC): US-16 persists the conversation shell only.
 * Message content is intentionally absent until US-17; this endpoint does not
 * invent placeholder messages.
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

    let identity;
    try {
      identity = conversationIdentity(listingId, initiatorId, recipientId);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid conversation participants',
      });
    }

    const conversation = await Conversation.create({
      _id: await nextId('conversations'),
      ...identity,
    });

    return res.status(201).json(toConversationRow(conversation));
  })
);

export default router;
