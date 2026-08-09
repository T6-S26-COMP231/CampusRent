/**
 * US-01.3 / US-01.4 — public limited guest listing previews.
 *
 * GET /api/guest/listings — no authenticate / requireVerifiedStudent.
 * Responses use the guest allow-list serializer only.
 * Does not weaken /api/listings or other registered-student routes.
 * Does not implement US-02 guest item details.
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
      // Safe client validation only — never Mongo internals or listing payloads.
      return res.status(400).json({ error });
    }

    const listings = await Listing.find(filter).sort({ created_at: -1 });
    // Allow-list construction per row — never formatListing.
    return res.status(200).json({
      listings: listings.map((listing) => toGuestListingPreview(listing)),
    });
  })
);

export default router;
