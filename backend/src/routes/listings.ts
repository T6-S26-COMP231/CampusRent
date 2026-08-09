import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { Listing, ListingDoc, toListingRow } from '../models/Listing';
import { Review, toReviewListItem } from '../models/Review';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { removeListingDocument } from '../utils/listingRemoval';
import {
  isValidAvailability,
  isValidCategory,
  LISTING_CATEGORIES,
} from '../utils/validation';

const router = Router();
const MAX_IMAGES = 5;

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(extension) && allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
    }
  },
});

// Accept enough files to return a clear validation message for the six-image test.
// The handler still enforces the Iteration 1 maximum of five images.
// JSON-only requests (no multipart body) skip multer so express.json() fields remain available.
const receiveListingImages: express.RequestHandler = (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  return upload.array('images', 10)(req, res, next);
};

function uploadedFiles(req: Express.Request): Express.Multer.File[] {
  return (req.files as Express.Multer.File[] | undefined) || [];
}

function removeFiles(files: Express.Multer.File[]) {
  for (const file of files) {
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function formatListing(listing: ListingDoc) {
  const owner = await User.findById(listing.owner_id).lean();

  return {
    ...toListingRow(listing),
    images: listing.images.map((image) => ({ url: `/uploads/${image.filename}` })),
    owner: owner
      ? {
          id: owner._id,
          first_name: owner.first_name,
          last_name: owner.last_name,
          email: owner.email,
          phone: owner.phone,
        }
      : null,
    contact_hidden: false,
  };
}

// US-04 through US-13 are Registered Student User stories. Every listing route
// is therefore restricted to an authenticated, verified student. Administrators
// use only the separate /api/admin verification routes in Iteration 1.
router.use(authenticate, requireVerifiedStudent);

router.get('/categories', (_req, res) => {
  res.json(LISTING_CATEGORIES);
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, category, availability = 'available', page = '1', limit = '6' } = req.query;

    if (typeof availability !== 'string' || !isValidAvailability(availability)) {
      return res.status(400).json({ error: 'Availability must be available or unavailable' });
    }

    const filter: Record<string, unknown> = { availability };

    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }

    if (category && typeof category === 'string') {
      if (!isValidCategory(category)) {
        return res.status(400).json({ error: 'Invalid category filter' });
      }
      filter.category = category;
    }

    const pageNum = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const limitNum = Math.min(24, Math.max(1, Number.parseInt(String(limit), 10) || 6));
    const total = await Listing.countDocuments(filter);
    const listings = await Listing.find(filter)
      .sort({ created_at: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.json({
      listings: await Promise.all(listings.map((listing) => formatListing(listing))),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  })
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const listings = await Listing.find({ owner_id: req.user!.id }).sort({ created_at: -1 });
    return res.json(await Promise.all(listings.map((listing) => formatListing(listing))));
  })
);

/**
 * US-19.4 — list reviews for a listing (ListingDetailPage).
 * Newest first. Does not fabricate reviews or compute aggregates.
 * Registered before /:id so "reviews" is not parsed as a listing id.
 */
router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId).select('_id').lean();
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const reviews = await Review.find({ listing_id: listingId })
      .sort({ created_at: -1, _id: -1 })
      .lean();

    const reviewerIds = [...new Set(reviews.map((review) => review.reviewer_id))];
    const reviewers = await User.find({ _id: { $in: reviewerIds } })
      .select('_id first_name last_name')
      .lean();
    const reviewerById = new Map(reviewers.map((user) => [user._id, user]));

    return res.json(
      reviews.map((review) =>
        toReviewListItem(review, reviewerById.get(review.reviewer_id) ?? null)
      )
    );
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    return res.json(await formatListing(listing));
  })
);

router.post(
  '/',
  receiveListingImages,
  asyncHandler(async (req, res) => {
    const files = uploadedFiles(req);
    const { title, category, description, rental_terms, availability } = req.body as {
      title?: string;
      category?: string;
      description?: string;
      rental_terms?: string;
      availability?: string;
    };

    if (files.length > MAX_IMAGES) {
      removeFiles(files);
      return res.status(400).json({ error: 'A listing can contain a maximum of 5 images' });
    }
    if (typeof title !== 'string' || !title.trim()) {
      removeFiles(files);
      return res.status(400).json({ error: 'Title is required' });
    }
    if (typeof category !== 'string' || !isValidCategory(category)) {
      removeFiles(files);
      return res.status(400).json({ error: 'Valid category is required' });
    }
    if (typeof description !== 'string' || !description.trim()) {
      removeFiles(files);
      return res.status(400).json({ error: 'Description is required' });
    }
    if (typeof availability !== 'string' || !isValidAvailability(availability)) {
      removeFiles(files);
      return res.status(400).json({ error: 'Availability is required' });
    }

    try {
      const listingId = await nextId('listings');
      const images = [];
      for (const file of files) {
        images.push({ id: await nextId('listing_images'), filename: file.filename });
      }

      const listing = await Listing.create({
        _id: listingId,
        owner_id: req.user!.id,
        title: title.trim(),
        category,
        description: description.trim(),
        rental_terms: typeof rental_terms === 'string' ? rental_terms.trim() : '',
        availability,
        images,
      });

      return res.status(201).json(await formatListing(listing));
    } catch (error) {
      removeFiles(files);
      throw error;
    }
  })
);

router.put(
  '/:id',
  receiveListingImages,
  asyncHandler(async (req, res) => {
    const files = uploadedFiles(req);
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      removeFiles(files);
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      removeFiles(files);
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing.owner_id !== req.user!.id) {
      removeFiles(files);
      return res.status(403).json({ error: 'Only listing owners may edit listings' });
    }

    const { title, category, description, rental_terms } = req.body as {
      title?: string;
      category?: string;
      description?: string;
      rental_terms?: string;
    };

    if (typeof title !== 'string' || !title.trim()) {
      removeFiles(files);
      return res.status(400).json({ error: 'Title is required' });
    }
    if (typeof category !== 'string' || !isValidCategory(category)) {
      removeFiles(files);
      return res.status(400).json({ error: 'Valid category is required' });
    }
    if (typeof description !== 'string' || !description.trim()) {
      removeFiles(files);
      return res.status(400).json({ error: 'Description is required' });
    }

    if (listing.images.length + files.length > MAX_IMAGES) {
      removeFiles(files);
      return res.status(400).json({ error: 'A listing can contain a maximum of 5 images' });
    }

    try {
      listing.title = title.trim();
      listing.category = category;
      listing.description = description.trim();
      listing.rental_terms = typeof rental_terms === 'string' ? rental_terms.trim() : '';
      listing.updated_at = new Date();

      for (const file of files) {
        listing.images.push({ id: await nextId('listing_images'), filename: file.filename });
      }

      await listing.save();
      return res.json(await formatListing(listing));
    } catch (error) {
      removeFiles(files);
      throw error;
    }
  })
);

router.patch(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only listing owners may update availability' });
    }

    const { availability } = req.body as { availability?: string };
    if (typeof availability !== 'string' || !isValidAvailability(availability)) {
      return res.status(400).json({ error: 'Availability must be available or unavailable' });
    }

    listing.availability = availability;
    listing.updated_at = new Date();
    await listing.save();

    return res.json(await formatListing(listing));
  })
);

router.delete(
  '/:id/images/:filename',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only listing owners may remove images' });
    }

    const rawFilename = req.params.filename;
    const filename = path.basename(Array.isArray(rawFilename) ? rawFilename[0] : rawFilename);
    const image = listing.images.find((item: { filename: string }) => item.filename === filename);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const filePath = path.join(uploadsDir, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    listing.images = listing.images.filter(
      (item: { filename: string }) => item.filename !== filename
    );
    listing.updated_at = new Date();
    await listing.save();

    return res.json({ message: 'Image removed successfully' });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Only listing owners may remove listings' });
    }

    await removeListingDocument(listing);

    return res.json({ message: 'Listing removed successfully' });
  })
);

export default router;
