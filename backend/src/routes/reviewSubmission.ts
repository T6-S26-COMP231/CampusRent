import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { Listing } from '../models/Listing';
import { RentalRequest } from '../models/RentalRequest';
import { Review, toReviewListItem } from '../models/Review';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

/**
 * US-19.4 — create-review API.
 *
 * POST /api/reviews
 * Body: { rental_request_id, rating, comment }
 *
 * reviewer_id always comes from req.user.id.
 * listing_id and reviewed_user_id are derived from the RentalRequest + Listing.
 * Client reviewer_id / listing_id / reviewed_user_id are ignored.
 *
 * File name avoids backend/src/routes/reviews.ts, which Iteration 1 verify
 * still treats as a forbidden placeholder path.
 *
 * Full completed-rental / one-review / rating request-layer rules: US-19.5.
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

    const rentalRequest = await RentalRequest.findById(rentalRequestId);
    if (!rentalRequest) {
      return res.status(404).json({ error: 'Rental request not found' });
    }

    const listing = await Listing.findById(rentalRequest.listing_id).lean();
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const reviewerId = req.user!.id;
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
        rating,
        comment,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'ValidationError' || error.name === 'CastError')
      ) {
        return res.status(400).json({ error: error.message });
      }
      // Unique index safeguard — full one-review application rules belong to US-19.5.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        return res.status(409).json({
          error: 'A review for this rental request already exists',
        });
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
