import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
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
const receiveListingImages = upload.array('images', 10);

function uploadedFiles(req: Express.Request): Express.Multer.File[] {
  return (req.files as Express.Multer.File[] | undefined) || [];
}

function removeFiles(files: Express.Multer.File[]) {
  for (const file of files) {
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function getListingImages(listingId: number): { id: number; filename: string }[] {
  return db
    .prepare('SELECT id, filename FROM listing_images WHERE listing_id = ? ORDER BY id')
    .all(listingId) as { id: number; filename: string }[];
}

function formatListing(listing: Record<string, unknown>) {
  const images = getListingImages(listing.id as number);
  const owner = db
    .prepare('SELECT id, first_name, last_name, email, phone FROM users WHERE id = ?')
    .get(listing.owner_id as number) as
    | { id: number; first_name: string; last_name: string; email: string; phone: string }
    | undefined;

  return {
    ...listing,
    images: images.map((image) => ({ url: `/uploads/${image.filename}` })),
    owner: owner
      ? {
          id: owner.id,
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

router.get('/', (req, res) => {
  const { q, category, availability = 'available', page = '1', limit = '6' } = req.query;

  let sql = 'SELECT l.* FROM listings l WHERE 1=1';
  const params: unknown[] = [];

  if (q && typeof q === 'string' && q.trim()) {
    sql += ' AND (l.title LIKE ? OR l.description LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term);
  }

  if (category && typeof category === 'string') {
    if (!isValidCategory(category)) {
      return res.status(400).json({ error: 'Invalid category filter' });
    }
    sql += ' AND l.category = ?';
    params.push(category);
  }

  if (typeof availability !== 'string' || !isValidAvailability(availability)) {
    return res.status(400).json({ error: 'Availability must be available or unavailable' });
  }
  sql += ' AND l.availability = ?';
  params.push(availability);

  const countSql = sql.replace('SELECT l.*', 'SELECT COUNT(*) as total');
  const total = (db.prepare(countSql).get(...params) as { total: number }).total;

  const pageNum = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const limitNum = Math.min(24, Math.max(1, Number.parseInt(String(limit), 10) || 6));
  sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, (pageNum - 1) * limitNum);

  const listings = db.prepare(sql).all(...params);
  res.json({
    listings: listings.map((listing) => formatListing(listing as Record<string, unknown>)),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

router.get('/mine', (req, res) => {
  const listings = db
    .prepare('SELECT * FROM listings WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.user!.id);

  res.json(listings.map((listing) => formatListing(listing as Record<string, unknown>)));
});

router.get('/:id', (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  return res.json(formatListing(listing as Record<string, unknown>));
});

router.post('/', receiveListingImages, (req, res) => {
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

  const result = db
    .prepare(
      `INSERT INTO listings (owner_id, title, category, description, rental_terms, availability)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user!.id,
      title.trim(),
      category,
      description.trim(),
      typeof rental_terms === 'string' ? rental_terms.trim() : '',
      availability
    );

  const listingId = result.lastInsertRowid as number;
  if (files.length) {
    const insertImage = db.prepare(
      'INSERT INTO listing_images (listing_id, filename) VALUES (?, ?)'
    );
    for (const file of files) insertImage.run(listingId, file.filename);
  }

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  return res.status(201).json(formatListing(listing as Record<string, unknown>));
});

router.put('/:id', receiveListingImages, (req, res) => {
  const files = uploadedFiles(req);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id) as
    | { id: number; owner_id: number }
    | undefined;

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

  const currentCount = (
    db.prepare('SELECT COUNT(*) as c FROM listing_images WHERE listing_id = ?').get(listing.id) as {
      c: number;
    }
  ).c;
  if (currentCount + files.length > MAX_IMAGES) {
    removeFiles(files);
    return res.status(400).json({ error: 'A listing can contain a maximum of 5 images' });
  }

  db.prepare(
    `UPDATE listings SET title = ?, category = ?, description = ?,
     rental_terms = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    title.trim(),
    category,
    description.trim(),
    typeof rental_terms === 'string' ? rental_terms.trim() : '',
    listing.id
  );

  if (files.length) {
    const insertImage = db.prepare(
      'INSERT INTO listing_images (listing_id, filename) VALUES (?, ?)'
    );
    for (const file of files) insertImage.run(listing.id, file.filename);
  }

  const updated = db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
  return res.json(formatListing(updated as Record<string, unknown>));
});

router.patch('/:id/availability', (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id) as
    | { id: number; owner_id: number }
    | undefined;

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only listing owners may update availability' });
  }

  const { availability } = req.body as { availability?: string };
  if (typeof availability !== 'string' || !isValidAvailability(availability)) {
    return res.status(400).json({ error: 'Availability must be available or unavailable' });
  }

  db.prepare(
    `UPDATE listings SET availability = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(availability, listing.id);

  const updated = db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
  return res.json(formatListing(updated as Record<string, unknown>));
});

router.delete('/:id/images/:filename', (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id) as
    | { id: number; owner_id: number }
    | undefined;

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only listing owners may remove images' });
  }

  const filename = path.basename(req.params.filename);
  const image = db
    .prepare('SELECT id, filename FROM listing_images WHERE listing_id = ? AND filename = ?')
    .get(listing.id, filename) as { id: number; filename: string } | undefined;

  if (!image) return res.status(404).json({ error: 'Image not found' });

  const filePath = path.join(uploadsDir, image.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM listing_images WHERE id = ?').run(image.id);
  return res.json({ message: 'Image removed successfully' });
});

router.delete('/:id', (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id) as
    | { id: number; owner_id: number }
    | undefined;

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only listing owners may remove listings' });
  }

  const images = db
    .prepare('SELECT filename FROM listing_images WHERE listing_id = ?')
    .all(listing.id) as { filename: string }[];
  for (const image of images) {
    const filePath = path.join(uploadsDir, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM listings WHERE id = ?').run(listing.id);
  return res.json({ message: 'Listing removed successfully' });
});

export default router;
