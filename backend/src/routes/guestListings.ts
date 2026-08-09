/**
 * US-01.3 / US-01.4 — public limited guest listing previews.
 * US-02.3 / US-02.4 — public guest basic item details.
 *
 * GET /api/guest/listings — no authenticate / requireVerifiedStudent.
 * GET /api/guest/listings/:id — no authenticate / requireVerifiedStudent.
 * Responses use dedicated guest allow-list serializers only.
 * Unavailable listings remain viewable with availability = unavailable.
 * Errors stay safe (no owner/contact, Mongo internals, or stack traces).
 * Does not weaken /api/listings or other registered-student routes.
 * Frontend guest details wiring belongs to #200.
 */
import { Router } from 'express';
import { Listing } from '../models/Listing';
import { asyncHandler } from '../utils/asyncHandler';
import {
  buildGuestListingFilter,
  toGuestListingPreview,
} from '../utils/guestListingPreview';
import {
  guestItemDetailsKeysMatchAllowList,
  toGuestItemDetails,
} from '../utils/guestItemDetails';

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

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    // Load only fields needed for the guest details allow-list — never owner.
    const listing = await Listing.findById(listingId)
      .select('_id title category description availability')
      .lean();
    if (!listing) {
      // Safe client message only — never listing/owner payloads.
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Allow-list construction — never formatListing. Unavailable stays 200.
    const details = toGuestItemDetails(listing);
    if (!guestItemDetailsKeysMatchAllowList(details)) {
      return res.status(500).json({ error: 'Unable to load item details.' });
    }
    return res.status(200).json({ listing: details });
  })
);

export default router;
