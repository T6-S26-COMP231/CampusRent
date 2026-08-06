import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { Listing } from '../models/Listing';
import { RentalRequest, RentalRequestDoc, toRequestRow } from '../models/RentalRequest';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

async function enrichRequest(request: RentalRequestDoc) {
  const listing = await Listing.findById(request.listing_id).lean();
  const renter = await User.findById(request.renter_id).lean();
  const owner = listing ? await User.findById(listing.owner_id).lean() : null;

  return {
    ...toRequestRow(request),
    listing: listing
      ? {
          id: listing._id,
          title: listing.title,
          category: listing.category,
          owner_id: listing.owner_id,
        }
      : null,
    renter: renter
      ? {
          id: renter._id,
          first_name: renter.first_name,
          last_name: renter.last_name,
          email: renter.email,
          phone: renter.phone,
        }
      : null,
    owner: owner
      ? {
          id: owner._id,
          first_name: owner.first_name,
          last_name: owner.last_name,
          email: owner.email,
          phone: owner.phone,
        }
      : null,
  };
}

router.get(
  '/incoming',
  asyncHandler(async (req, res) => {
    const ownedListings = await Listing.find({ owner_id: req.user!.id }).select('_id').lean();
    const listingIds = ownedListings.map((listing) => listing._id);
    const requests = await RentalRequest.find({ listing_id: { $in: listingIds } }).sort({
      created_at: -1,
    });

    return res.json(await Promise.all(requests.map((request) => enrichRequest(request))));
  })
);

/**
 * US-15 — authenticated renter dashboard: current and past requests for the caller only.
 */
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const requests = await RentalRequest.find({ renter_id: req.user!.id }).sort({
      created_at: -1,
    });

    return res.json(await Promise.all(requests.map((request) => enrichRequest(request))));
  })
);

/**
 * Minimal renter-visible status for a single listing (US-13/US-14/US-15).
 */
router.get(
  '/mine/listing/:listingId',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const request = await RentalRequest.findOne({
      listing_id: listingId,
      renter_id: req.user!.id,
    }).sort({ created_at: -1 });

    return res.json(request ? await enrichRequest(request) : null);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { listing_id, start_date, end_date } = req.body as {
      listing_id?: number;
      start_date?: string;
      end_date?: string;
    };

    const listingId = Number(listing_id);
    if (!Number.isInteger(listingId) || listingId <= 0 || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: 'Listing, start date, and end date are required' });
    }

    const start = new Date(`${start_date}T00:00:00`);
    const end = new Date(`${end_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Rental dates are invalid' });
    }
    if (start < today) {
      return res.status(400).json({ error: 'Start date cannot be in the past' });
    }
    if (end <= start) {
      return res.status(400).json({ error: 'End date must be after the start date' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.availability !== 'available') {
      return res.status(400).json({ error: 'This item is not available for rental' });
    }
    if (listing.owner_id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot request your own listing' });
    }

    const existing = await RentalRequest.findOne({
      listing_id: listingId,
      renter_id: req.user!.id,
      status: 'pending',
    }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ error: 'You already have a pending request for this listing' });
    }

    const request = await RentalRequest.create({
      _id: await nextId('rental_requests'),
      listing_id: listingId,
      renter_id: req.user!.id,
      start_date,
      end_date,
      status: 'pending',
    });

    return res.status(201).json(await enrichRequest(request));
  })
);

router.patch(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const request = await RentalRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    const listing = await Listing.findById(request.listing_id);
    if (!listing || listing.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only the listing owner may approve this request' });
    }
    if (listing.availability !== 'available') {
      return res.status(400).json({ error: 'The item is no longer available' });
    }

    request.status = 'accepted';
    request.updated_at = new Date();
    await request.save();

    listing.availability = 'unavailable';
    listing.updated_at = new Date();
    await listing.save();

    return res.json(await enrichRequest(request));
  })
);

router.patch(
  '/:id/decline',
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const request = await RentalRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be declined' });
    }

    const listing = await Listing.findById(request.listing_id);
    if (!listing || listing.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only the listing owner may decline this request' });
    }

    request.status = 'declined';
    request.updated_at = new Date();
    await request.save();

    return res.json(await enrichRequest(request));
  })
);

router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const request = await RentalRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.renter_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only the requesting renter may cancel this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    request.status = 'cancelled';
    request.updated_at = new Date();
    await request.save();

    return res.json(await enrichRequest(request));
  })
);

/**
 * Completion authorization (assumption documented for US-15):
 * Either the requesting renter or the listing owner may mark an Accepted rental Completed.
 * Completing restores listing availability so the item can be rented again.
 */
router.patch(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const request = await RentalRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted requests can be completed' });
    }

    const listing = await Listing.findById(request.listing_id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const isRenter = request.renter_id === req.user!.id;
    const isOwner = listing.owner_id === req.user!.id;
    if (!isRenter && !isOwner) {
      return res.status(403).json({
        error: 'Only the renter or listing owner may complete this rental',
      });
    }

    request.status = 'completed';
    request.updated_at = new Date();
    await request.save();

    listing.availability = 'available';
    listing.updated_at = new Date();
    await listing.save();

    return res.json(await enrichRequest(request));
  })
);

export default router;
