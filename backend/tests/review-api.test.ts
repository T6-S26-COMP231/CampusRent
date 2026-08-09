/**
 * US-19.4 — create-review and list-review API endpoints.
 * Completed-rental / one-review / rating request-layer rules: US-19.5.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Server } from 'node:http';
import {
  api,
  clearDatabase,
  closeServer,
  listenApp,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;
let RentalRequest: typeof import('../src/models/RentalRequest').RentalRequest;
let Review: typeof import('../src/models/Review').Review;

let server: Server;
let baseUrl: string;
let renterId: number;
let ownerId: number;
let otherStudentId: number;
let listingId: number;
let otherListingId: number;
let rentalRequestId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: { verification_status?: 'pending' | 'verified' | 'rejected' } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: firstName,
    last_name: lastName,
    phone: '416-555-0100',
    role: 'student',
    verification_status: options.verification_status ?? 'verified',
    status: 'active',
  });
  return id;
}

async function createListing(owner: number, title: string) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title,
    category: 'Electronics',
    description: 'Review API listing.',
    rental_terms: 'Return next day',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createRentalRequest(
  listing: number,
  renter: number,
  status: 'pending' | 'accepted' | 'completed' = 'completed'
) {
  const id = await nextId('rental_requests');
  await RentalRequest.create({
    _id: id,
    listing_id: listing,
    renter_id: renter,
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    status,
  });
  return id;
}

function studentToken(userId: number, email: string) {
  return signToken({ id: userId, email, role: 'student' });
}

before(async () => {
  const uri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  ({ Listing } = await import('../src/models/Listing'));
  ({ RentalRequest } = await import('../src/models/RentalRequest'));
  ({ Review } = await import('../src/models/Review'));
  await connectDatabase(uri);
  await Review.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Test', 'Owner');
  renterId = await createStudent('renter@mycentennialcollege.ca', 'Ramika', 'Student');
  otherStudentId = await createStudent('other@mycentennialcollege.ca', 'Other', 'Student');
  listingId = await createListing(ownerId, 'Campus Camera');
  otherListingId = await createListing(ownerId, 'Other Tripod');
  rentalRequestId = await createRentalRequest(listingId, renterId, 'completed');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-19.4 create-review API (POST /api/reviews)', () => {
  test('unauthenticated create is denied with 401', async () => {
    const response = await api(baseUrl, 'POST', '/api/reviews', {
      body: {
        rental_request_id: rentalRequestId,
        rating: 5,
        comment: 'Great rental.',
      },
    });
    assert.equal(response.status, 401);
    assert.equal(await Review.countDocuments(), 0);
  });

  test('authenticated verified student can create a review; relationships derived from RentalRequest', async () => {
    const response = await api(baseUrl, 'POST', '/api/reviews', {
      token: studentToken(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        rental_request_id: rentalRequestId,
        rating: 5,
        comment: '  Excellent handoff.  ',
        // Spoof attempts — must be ignored.
        reviewer_id: otherStudentId,
        listing_id: otherListingId,
        reviewed_user_id: otherStudentId,
      },
    });

    assert.equal(response.status, 201);
    assert.equal(typeof response.data.id, 'number');
    assert.equal(response.data.rental_request_id, rentalRequestId);
    assert.equal(response.data.listing_id, listingId);
    assert.notEqual(response.data.listing_id, otherListingId);
    assert.equal(response.data.reviewed_user_id, ownerId);
    assert.notEqual(response.data.reviewed_user_id, otherStudentId);
    assert.equal(response.data.rating, 5);
    assert.equal(response.data.comment, 'Excellent handoff.');
    assert.equal(response.data.reviewer.id, renterId);
    assert.notEqual(response.data.reviewer.id, otherStudentId);
    assert.equal(response.data.reviewer.label, 'Ramika Student');
    assert.equal(typeof response.data.created_at, 'string');
    assert.equal('password_hash' in response.data, false);
    assert.equal('email' in (response.data.reviewer ?? {}), false);

    const stored = await Review.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.reviewer_id, renterId);
    assert.equal(stored!.listing_id, listingId);
    assert.equal(stored!.reviewed_user_id, ownerId);
    assert.equal(stored!.rental_request_id, rentalRequestId);
  });

  test('malformed and missing rental_request_id are handled cleanly', async () => {
    const token = studentToken(renterId, 'renter@mycentennialcollege.ca');

    const malformed = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: { rental_request_id: 'abc', rating: 4, comment: 'Nope' },
    });
    assert.equal(malformed.status, 400);
    assert.match(String(malformed.data.error ?? ''), /rental request id/i);

    const missingBody = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: { rating: 4, comment: 'Nope' },
    });
    assert.equal(missingBody.status, 400);

    const missingRequest = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: { rental_request_id: 99999, rating: 4, comment: 'Missing request' },
    });
    assert.equal(missingRequest.status, 404);
    assert.match(String(missingRequest.data.error ?? ''), /not found/i);
    assert.equal(await Review.countDocuments(), 0);
  });

  test('created response contains expected safe review fields', async () => {
    const response = await api(baseUrl, 'POST', '/api/reviews', {
      token: studentToken(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        rental_request_id: rentalRequestId,
        rating: 3,
        comment: 'As described.',
      },
    });
    assert.equal(response.status, 201);
    for (const key of [
      'id',
      'rental_request_id',
      'listing_id',
      'reviewed_user_id',
      'rating',
      'comment',
      'created_at',
      'reviewer',
    ]) {
      assert.ok(key in response.data, key);
    }
    assert.deepEqual(Object.keys(response.data.reviewer).sort(), ['id', 'label']);
  });
});

describe('US-19.4 list-review API (GET /api/listings/:id/reviews)', () => {
  test('listing reviews returned for requested listing only; newest first', async () => {
    const token = studentToken(renterId, 'renter@mycentennialcollege.ca');
    const olderRequest = rentalRequestId;
    const newerRequest = await createRentalRequest(listingId, renterId, 'completed');
    const otherRequest = await createRentalRequest(otherListingId, renterId, 'completed');

    const first = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: olderRequest,
        rating: 2,
        comment: 'Older review',
      },
    });
    assert.equal(first.status, 201);

    // Ensure distinct created_at ordering.
    await Review.findByIdAndUpdate(first.data.id, {
      created_at: new Date('2026-08-01T10:00:00.000Z'),
    });

    const second = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: newerRequest,
        rating: 5,
        comment: 'Newer review',
      },
    });
    assert.equal(second.status, 201);
    await Review.findByIdAndUpdate(second.data.id, {
      created_at: new Date('2026-08-08T12:00:00.000Z'),
    });

    const other = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: otherRequest,
        rating: 4,
        comment: 'Different listing',
      },
    });
    assert.equal(other.status, 201);

    const listed = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`, {
      token,
    });
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.data), true);
    assert.equal(listed.data.length, 2);
    assert.equal(listed.data[0].comment, 'Newer review');
    assert.equal(listed.data[1].comment, 'Older review');
    assert.ok(
      listed.data.every(
        (row: { listing_id: number }) => row.listing_id === listingId
      )
    );
    assert.ok(
      !listed.data.some(
        (row: { comment: string }) => row.comment === 'Different listing'
      )
    );
  });

  test('reviewer label resolved; no sensitive User fields; empty list is []', async () => {
    const empty = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`, {
      token: studentToken(otherStudentId, 'other@mycentennialcollege.ca'),
    });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data, []);

    await api(baseUrl, 'POST', '/api/reviews', {
      token: studentToken(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        rental_request_id: rentalRequestId,
        rating: 4,
        comment: 'Solid camera.',
      },
    });

    const listed = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`, {
      token: studentToken(otherStudentId, 'other@mycentennialcollege.ca'),
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].reviewer.label, 'Ramika Student');
    assert.equal(listed.data[0].reviewer.id, renterId);
    assert.equal(listed.data[0].rating, 4);
    assert.equal(listed.data[0].comment, 'Solid camera.');
    assert.equal('password_hash' in listed.data[0], false);
    assert.equal('email' in listed.data[0].reviewer, false);
    assert.equal('password_hash' in listed.data[0].reviewer, false);
  });

  test('malformed listing id and missing listing follow existing conventions', async () => {
    const token = studentToken(renterId, 'renter@mycentennialcollege.ca');

    const malformed = await api(baseUrl, 'GET', '/api/listings/abc/reviews', { token });
    assert.equal(malformed.status, 400);
    assert.match(String(malformed.data.error ?? ''), /listing id/i);

    const missing = await api(baseUrl, 'GET', '/api/listings/99999/reviews', { token });
    assert.equal(missing.status, 404);
    assert.match(String(missing.data.error ?? ''), /not found/i);
  });

  test('unauthenticated list is denied; missing reviewer uses safe fallback label', async () => {
    const unauth = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`);
    assert.equal(unauth.status, 401);

    const created = await api(baseUrl, 'POST', '/api/reviews', {
      token: studentToken(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        rental_request_id: rentalRequestId,
        rating: 3,
        comment: 'Still visible after reviewer removal.',
      },
    });
    assert.equal(created.status, 201);

    await User.findByIdAndDelete(renterId);

    const listed = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`, {
      token: studentToken(otherStudentId, 'other@mycentennialcollege.ca'),
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].reviewer.id, renterId);
    assert.equal(listed.data[0].reviewer.label, `User #${renterId}`);
    assert.equal(listed.data[0].comment, 'Still visible after reviewer removal.');
  });
});
