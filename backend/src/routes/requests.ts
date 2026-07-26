import { Router } from 'express';
import db from '../db';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

function enrichRequest(row: Record<string, unknown>) {
  const listing = db
    .prepare('SELECT id, title, category, owner_id FROM listings WHERE id = ?')
    .get(row.listing_id);
  const renter = db
    .prepare('SELECT id, first_name, last_name, email, phone FROM users WHERE id = ?')
    .get(row.renter_id);
  const owner = listing
    ? db
        .prepare('SELECT id, first_name, last_name, email, phone FROM users WHERE id = ?')
        .get((listing as { owner_id: number }).owner_id)
    : null;

  return { ...row, listing, renter, owner };
}

router.get('/incoming', (req, res) => {
  const requests = db
    .prepare(
      `SELECT rr.* FROM rental_requests rr
       JOIN listings l ON l.id = rr.listing_id
       WHERE l.owner_id = ? ORDER BY rr.created_at DESC`
    )
    .all(req.user!.id);

  return res.json(
    requests.map((request) => enrichRequest(request as Record<string, unknown>))
  );
});

/**
 * Minimal renter-visible status required by US-13. This is intentionally scoped
 * to one listing and does not implement the full Iteration 2 request-tracking
 * dashboard, cancellation, decline, or completed-rental workflow from US-14/15.
 */
router.get('/mine/listing/:listingId', (req, res) => {
  const listingId = Number(req.params.listingId);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: 'Invalid listing id' });
  }

  const request = db
    .prepare(
      'SELECT * FROM rental_requests WHERE listing_id = ? AND renter_id = ? ORDER BY created_at DESC'
    )
    .get(listingId, req.user!.id);

  return res.json(request ? enrichRequest(request as Record<string, unknown>) : null);
});

router.post('/', (req, res) => {
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

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as
    | { id: number; owner_id: number; availability: string }
    | undefined;

  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.availability !== 'available') {
    return res.status(400).json({ error: 'This item is not available for rental' });
  }
  if (listing.owner_id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot request your own listing' });
  }

  const existing = db
    .prepare(
      `SELECT id FROM rental_requests
       WHERE listing_id = ? AND renter_id = ? AND status = 'pending'`
    )
    .get(listingId, req.user!.id);
  if (existing) {
    return res
      .status(409)
      .json({ error: 'You already have a pending request for this listing' });
  }

  const result = db
    .prepare(
      `INSERT INTO rental_requests (listing_id, renter_id, start_date, end_date)
       VALUES (?, ?, ?, ?)`
    )
    .run(listingId, req.user!.id, start_date, end_date);

  const request = db
    .prepare('SELECT * FROM rental_requests WHERE id = ?')
    .get(result.lastInsertRowid);
  return res.status(201).json(enrichRequest(request as Record<string, unknown>));
});

router.patch('/:id/approve', (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  const request = db.prepare('SELECT * FROM rental_requests WHERE id = ?').get(requestId) as
    | { id: number; listing_id: number; status: string }
    | undefined;

  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be approved' });
  }

  const listing = db
    .prepare('SELECT owner_id, availability FROM listings WHERE id = ?')
    .get(request.listing_id) as
    | { owner_id: number; availability: string }
    | undefined;

  if (!listing || listing.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Only the listing owner may approve this request' });
  }
  if (listing.availability !== 'available') {
    return res.status(400).json({ error: 'The item is no longer available' });
  }

  db.prepare(
    `UPDATE rental_requests SET status = 'accepted', updated_at = datetime('now') WHERE id = ?`
  ).run(request.id);
  db.prepare(
    `UPDATE listings SET availability = ?, updated_at = datetime('now') WHERE id = ?`
  ).run('unavailable', request.listing_id);

  const updated = db.prepare('SELECT * FROM rental_requests WHERE id = ?').get(request.id);
  return res.json(enrichRequest(updated as Record<string, unknown>));
});

export default router;
