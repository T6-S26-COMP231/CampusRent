/**
 * One-time, optional migration from the legacy local JSON store to MongoDB.
 *
 * Usage (never runs during normal startup):
 *   npm run migrate:store --prefix backend
 *
 * Behaviour:
 * - Reads backend/data/store.json (or CAMPUSRENT_STORE_JSON path)
 * - Inserts only missing users, listings, and rental requests
 * - Does not overwrite existing MongoDB documents
 * - Does not delete anything from MongoDB or the JSON file
 */
import path from 'path';
import fs from 'fs';
import '../src/config/env';
import { connectDatabase, disconnectDatabase } from '../src/db/connection';
import { Counter } from '../src/models/Counter';
import { Listing } from '../src/models/Listing';
import { RentalRequest } from '../src/models/RentalRequest';
import { User } from '../src/models/User';

interface LegacyStore {
  users?: Array<{
    id: number;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role: 'student' | 'admin';
    verification_status: 'pending' | 'verified' | 'rejected';
    status: 'active' | 'suspended';
    created_at?: string;
  }>;
  listings?: Array<{
    id: number;
    owner_id: number;
    title: string;
    category: string;
    description: string;
    rental_terms?: string;
    availability: 'available' | 'unavailable';
    created_at?: string;
    updated_at?: string;
  }>;
  listing_images?: Array<{
    id: number;
    listing_id: number;
    filename: string;
  }>;
  rental_requests?: Array<{
    id: number;
    listing_id: number;
    renter_id: number;
    start_date: string;
    end_date: string;
    status: 'pending' | 'accepted' | string;
    created_at?: string;
    updated_at?: string;
  }>;
  _counters?: Record<string, number>;
}

async function ensureCounterAtLeast(name: string, value: number) {
  const current = await Counter.findById(name).lean();
  const seq = current?.seq ?? 0;
  if (value > seq) {
    await Counter.findByIdAndUpdate(name, { seq: value }, { upsert: true, returnDocument: 'after' });
  }
}

async function migrate() {
  const storePath = process.env.CAMPUSRENT_STORE_JSON
    ? path.resolve(process.env.CAMPUSRENT_STORE_JSON)
    : path.join(__dirname, '..', 'data', 'store.json');

  if (!fs.existsSync(storePath)) {
    console.log(`No legacy store found at ${storePath}. Nothing to migrate.`);
    return;
  }

  const raw = fs.readFileSync(storePath, 'utf-8');
  const store = JSON.parse(raw) as LegacyStore;

  await connectDatabase();

  let usersInserted = 0;
  let listingsInserted = 0;
  let requestsInserted = 0;
  let maxUserId = 0;
  let maxListingId = 0;
  let maxImageId = 0;
  let maxRequestId = 0;

  for (const user of store.users || []) {
    maxUserId = Math.max(maxUserId, user.id);
    const existing = await User.findById(user.id).lean();
    if (existing) continue;
    const byEmail = await User.findOne({ email: user.email.toLowerCase() }).lean();
    if (byEmail) {
      console.log(`Skipped user id=${user.id}: email already exists as id=${byEmail._id}`);
      continue;
    }

    await User.create({
      _id: user.id,
      email: user.email.toLowerCase(),
      password_hash: user.password_hash,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone || '',
      role: user.role,
      verification_status: user.verification_status,
      status: user.status,
      created_at: user.created_at ? new Date(user.created_at) : new Date(),
    });
    usersInserted += 1;
  }

  const imagesByListing = new Map<number, Array<{ id: number; filename: string }>>();
  for (const image of store.listing_images || []) {
    maxImageId = Math.max(maxImageId, image.id);
    const list = imagesByListing.get(image.listing_id) || [];
    list.push({ id: image.id, filename: image.filename });
    imagesByListing.set(image.listing_id, list);
  }

  for (const listing of store.listings || []) {
    maxListingId = Math.max(maxListingId, listing.id);
    const existing = await Listing.findById(listing.id).lean();
    if (existing) continue;

    await Listing.create({
      _id: listing.id,
      owner_id: listing.owner_id,
      title: listing.title,
      category: listing.category,
      description: listing.description,
      rental_terms: listing.rental_terms || '',
      availability: listing.availability,
      images: imagesByListing.get(listing.id) || [],
      created_at: listing.created_at ? new Date(listing.created_at) : new Date(),
      updated_at: listing.updated_at ? new Date(listing.updated_at) : new Date(),
    });
    listingsInserted += 1;
  }

  for (const request of store.rental_requests || []) {
    maxRequestId = Math.max(maxRequestId, request.id);
    if (request.status !== 'pending' && request.status !== 'accepted') {
      console.log(`Skipped rental request id=${request.id}: unsupported status "${request.status}"`);
      continue;
    }

    const existing = await RentalRequest.findById(request.id).lean();
    if (existing) continue;

    await RentalRequest.create({
      _id: request.id,
      listing_id: request.listing_id,
      renter_id: request.renter_id,
      start_date: request.start_date,
      end_date: request.end_date,
      status: request.status,
      created_at: request.created_at ? new Date(request.created_at) : new Date(),
      updated_at: request.updated_at ? new Date(request.updated_at) : new Date(),
    });
    requestsInserted += 1;
  }

  const counters = store._counters || {};
  await ensureCounterAtLeast('users', Math.max(maxUserId, counters.users || 0));
  await ensureCounterAtLeast('listings', Math.max(maxListingId, counters.listings || 0));
  await ensureCounterAtLeast('listing_images', Math.max(maxImageId, counters.listing_images || 0));
  await ensureCounterAtLeast(
    'rental_requests',
    Math.max(maxRequestId, counters.rental_requests || 0)
  );

  console.log('Legacy JSON migration complete (insert-missing only).');
  console.log(`Users inserted: ${usersInserted}`);
  console.log(`Listings inserted: ${listingsInserted}`);
  console.log(`Rental requests inserted: ${requestsInserted}`);
  console.log(`Source file left unchanged: ${storePath}`);
}

migrate()
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : 'Unknown migration failure';
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectDatabase();
    } catch {
      /* ignore disconnect errors during cleanup */
    }
  });
