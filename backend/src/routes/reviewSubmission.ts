import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { Listing } from '../models/Listing';
import { RentalRequest } from '../models/RentalRequest';
import {
  normalizeReviewComment,
  normalizeReviewRating,
  Review,
  toReviewListItem,
} from '../models/Review';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

const DUPLICATE_REVIEW_ERROR = 'A review for this rental request already exists';

/**
 * US-19.4 / US-19.5 — create-review API with business-rule enforcement.
 *
 * POST /api/reviews
 * Body: { rental_request_id, rating, comment }
 *
 * reviewer_id always comes from req.user.id.
 * listing_id and reviewed_user_id are derived from the RentalRequest + Listing.
 * Client reviewer_id / listing_id / reviewed_user_id are ignored.
 *
 * US-19.5 rules:
 * - rental must be status === 'completed'
 * - authenticated user must be RentalRequest.renter_id
 * - one review per (reviewer, rental_request) — app check + unique index
 * - rating whole number 1–5; comment required non-blank string (trimmed)
 *
 * File name avoids backend/src/routes/reviews.ts, which Iteration 1 verify
 * still treats as a forbidden placeholder path.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { rental_request_id, rating, comment } = req.body as {
      rental_request_id?: unknown;
      rating?: unknown;
      comment?: unknown;
      reviewer_id?: unknown;
      listing_id?: unknown;
      reviewed_user_id?: unknown;
    };

    // Client-supplied identity/relationship fields are ignored — auth + RentalRequest only.

    if (
      rental_request_id === undefined ||
      rental_request_id === null ||
      rental_request_id === ''
    ) {
      return res.status(400).json({ error: 'rental_request_id is required' });
    }
    if (typeof rental_request_id === 'boolean') {
      return res.status(400).json({ error: 'Invalid rental request id' });
    }
    const rentalRequestId = Number(rental_request_id);
    if (!Number.isInteger(rentalRequestId) || rentalRequestId <= 0) {
      return res.status(400).json({ error: 'Invalid rental request id' });
    }

    let normalizedRating;
    let normalizedComment;
    try {
      normalizedRating = normalizeReviewRating(rating);
      normalizedComment = normalizeReviewComment(comment);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid review input',
      });
    }

    const rentalRequest = await RentalRequest.findById(rentalRequestId);
    if (!rentalRequest) {
      return res.status(404).json({ error: 'Rental request not found' });
    }

    if (rentalRequest.status !== 'completed') {
      return res.status(409).json({
        error: 'Reviews are only available after a completed rental',
      });
    }

    const reviewerId = req.user!.id;
    if (rentalRequest.renter_id !== reviewerId) {
      return res.status(403).json({
        error: 'Only the renter for this completed rental may submit a review',
      });
    }

    const existing = await Review.findOne({
      reviewer_id: reviewerId,
      rental_request_id: rentalRequestId,
    })
      .select('_id')
      .lean();
    if (existing) {
      return res.status(409).json({ error: DUPLICATE_REVIEW_ERROR });
    }

    const listing = await Listing.findById(rentalRequest.listing_id).lean();
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listingId = rentalRequest.listing_id;
    const reviewedUserId = listing.owner_id;

    let created;
    try {
      created = await Review.create({
        _id: await nextId('reviews'),
        reviewer_id: reviewerId,
        rental_request_id: rentalRequestId,
        listing_id: listingId,
        reviewed_user_id: reviewedUserId,
        rating: normalizedRating,
        comment: normalizedComment,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'ValidationError' || error.name === 'CastError')
      ) {
        return res.status(400).json({ error: error.message });
      }
      // Unique-index race — same controlled conflict as the application duplicate check.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        return res.status(409).json({ error: DUPLICATE_REVIEW_ERROR });
      }
      throw error;
    }

    const reviewer = await User.findById(reviewerId)
      .select('first_name last_name')
      .lean();

    return res.status(201).json(toReviewListItem(created, reviewer));
  })
);

export default router;
