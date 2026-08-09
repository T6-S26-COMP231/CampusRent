/**
 * US-01.3 — public limited guest listing previews.
 *
 * GET /api/guest/listings — no authenticate / requireVerifiedStudent.
 * Returns only approved preview fields. Does not weaken /api/listings.
 */
import { Router } from 'express';
import { Listing } from '../models/Listing';
import { asyncHandler } from '../utils/asyncHandler';
import {
  buildGuestListingFilter,
  toGuestListingPreview,
} from '../utils/guestListingPreview';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { filter, error } = buildGuestListingFilter({
      q: req.query.q,
      category: req.query.category,
    });
    if (error) {
      return res.status(400).json({ error });
    }

    const listings = await Listing.find(filter).sort({ created_at: -1 });
    return res.status(200).json({
      listings: listings.map((listing) => toGuestListingPreview(listing)),
    });
  })
);

export default router;
