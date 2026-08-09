/**
 * US-19.7 — Team6 TAC acceptance mapping for ratings and reviews.
 *
 * TAC Test 1 — Review completed rental → Review form displayed / submission permitted
 * TAC Test 2 — Review incomplete rental → Review option unavailable / submission rejected
 * TAC Test 3 — Submit review → Review saved successfully
 * TAC Test 4 — Submit incomplete review → Validation error displayed
 *
 * Also covers one-review regression, 1–5 whole-star rating decision, and
 * authorization/trust boundaries at the acceptance level.
 *
 * Broader low-level coverage remains in review-model.test.ts and review-api.test.ts.
 *
 * Do NOT claim production Overall Result: PASSED — US-19.8 owns merge/deploy/manual acceptance.
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

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_19_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-19.8' as const;
export const US_19_PRODUCTION_ACCEPTANCE_REASON =
  'US-19.8 owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

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
let completedRequestId: number;

async function createStudent(email: string, firstName: string, lastName: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: firstName,
    last_name: lastName,
    phone: '416-555-0100',
    role: 'student',
    verification_status: 'verified',
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
    description: 'US-19 TAC acceptance listing',
    rental_terms: 'Return next day',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createRentalRequest(
  listing: number,
  renter: number,
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed'
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

function renterToken() {
  return signToken({
    id: renterId,
    email: 'renter@mycentennialcollege.ca',
    role: 'student',
  });
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
  listingId = await createListing(ownerId, 'US-19 Acceptance Camera');
  completedRequestId = await createRentalRequest(listingId, renterId, 'completed');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-19 TAC acceptance tests', () => {
  test('TAC Test 1 — Review completed rental: submission permitted for authenticating renter', async () => {
    const response = await api(baseUrl, 'POST', '/api/reviews', {
      token: renterToken(),
      body: {
        rental_request_id: completedRequestId,
        rating: 5,
        comment: 'Completed rental may be reviewed.',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.rental_request_id, completedRequestId);
    assert.equal(response.data.reviewer.id, renterId);
    assert.equal(await Review.countDocuments(), 1);
    assert.equal(US_19_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-19.8');
  });

  test('TAC Test 2 — Review incomplete rental: pending/accepted/declined/cancelled rejected', async () => {
    for (const status of ['pending', 'accepted', 'declined', 'cancelled'] as const) {
      const requestId = await createRentalRequest(listingId, renterId, status);
      const response = await api(baseUrl, 'POST', '/api/reviews', {
        token: renterToken(),
        body: {
          rental_request_id: requestId,
          rating: 4,
          comment: `Should reject ${status}`,
        },
      });
      assert.equal(response.status, 409, status);
      assert.match(String(response.data.error ?? ''), /completed rental/i, status);
    }
    assert.equal(await Review.countDocuments(), 0);
  });

  test('TAC Test 3 — Submit review: persisted, listed, relationships derived from auth + rental', async () => {
    const create = await api(baseUrl, 'POST', '/api/reviews', {
      token: renterToken(),
      body: {
        rental_request_id: completedRequestId,
        rating: 4,
        comment: '  Item was as described.  ',
        // Spoof attempts — must not control trusted fields.
        reviewer_id: otherStudentId,
        listing_id: 99999,
        reviewed_user_id: otherStudentId,
      },
    });

    assert.equal(create.status, 201);
    assert.equal(typeof create.data.id, 'number');
    assert.equal(create.data.rating, 4);
    assert.equal(create.data.comment, 'Item was as described.');
    assert.equal(create.data.reviewer.id, renterId);
    assert.equal(create.data.reviewer.label, 'Ramika Student');
    assert.equal(create.data.listing_id, listingId);
    assert.equal(create.data.reviewed_user_id, ownerId);
    assert.notEqual(create.data.reviewer.id, otherStudentId);
    assert.notEqual(create.data.listing_id, 99999);
    assert.notEqual(create.data.reviewed_user_id, otherStudentId);
    assert.equal('password_hash' in create.data, false);
    assert.equal('email' in (create.data.reviewer ?? {}), false);

    const stored = await Review.findById(create.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.reviewer_id, renterId);
    assert.equal(stored!.rental_request_id, completedRequestId);
    assert.equal(stored!.listing_id, listingId);
    assert.equal(stored!.reviewed_user_id, ownerId);
    assert.equal(stored!.rating, 4);
    assert.equal(stored!.comment, 'Item was as described.');

    const listed = await api(baseUrl, 'GET', `/api/listings/${listingId}/reviews`, {
      token: renterToken(),
    });
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.data), true);
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].id, create.data.id);
    assert.equal(listed.data[0].comment, 'Item was as described.');
    assert.equal(listed.data[0].reviewer.label, 'Ramika Student');
    assert.equal(listed.data[0].rating, 4);
  });

  test('TAC Test 4 — Submit incomplete review: missing rating/comment and whitespace rejected', async () => {
    const token = renterToken();

    const missingRating = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: completedRequestId,
        comment: 'Has comment but no rating',
      },
    });
    assert.equal(missingRating.status, 400);
    assert.match(String(missingRating.data.error ?? ''), /rating/i);

    const missingComment = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: completedRequestId,
        rating: 3,
      },
    });
    assert.equal(missingComment.status, 400);
    assert.match(String(missingComment.data.error ?? ''), /comment/i);

    const whitespaceComment = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: completedRequestId,
        rating: 3,
        comment: '   \n\t  ',
      },
    });
    assert.equal(whitespaceComment.status, 400);
    assert.match(String(whitespaceComment.data.error ?? ''), /comment/i);

    assert.equal(await Review.countDocuments(), 0);
  });

  test('one-review regression — second review for same renter + rental is 409', async () => {
    const token = renterToken();
    const first = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: completedRequestId,
        rating: 5,
        comment: 'First review.',
      },
    });
    assert.equal(first.status, 201);

    const second = await api(baseUrl, 'POST', '/api/reviews', {
      token,
      body: {
        rental_request_id: completedRequestId,
        rating: 1,
        comment: 'Duplicate attempt.',
      },
    });
    assert.equal(second.status, 409);
    assert.match(String(second.data.error ?? ''), /already exists/i);
    assert.equal(await Review.countDocuments(), 1);
  });

  test('rating decision — whole numbers 1 and 5 accepted; invalid values rejected', async () => {
    const token = renterToken();

    for (const rating of [1, 5] as const) {
      const requestId = await createRentalRequest(listingId, renterId, 'completed');
      const ok = await api(baseUrl, 'POST', '/api/reviews', {
        token,
        body: {
          rental_request_id: requestId,
          rating,
          comment: `Rating ${rating}`,
        },
      });
      assert.equal(ok.status, 201, String(rating));
      assert.equal(ok.data.rating, rating);
    }

    for (const rating of [0, 6, 3.5, '5'] as const) {
      const requestId = await createRentalRequest(listingId, renterId, 'completed');
      const rejected = await api(baseUrl, 'POST', '/api/reviews', {
        token,
        body: {
          rental_request_id: requestId,
          rating,
          comment: 'Invalid rating case',
        },
      });
      assert.equal(rejected.status, 400, String(rating));
      assert.match(String(rejected.data.error ?? ''), /rating/i, String(rating));
    }
  });

  test('authorization/trust — unauthenticated and wrong student cannot create review', async () => {
    const unauth = await api(baseUrl, 'POST', '/api/reviews', {
      body: {
        rental_request_id: completedRequestId,
        rating: 5,
        comment: 'Unauthenticated attempt',
      },
    });
    assert.equal(unauth.status, 401);

    const ownerAttempt = await api(baseUrl, 'POST', '/api/reviews', {
      token: signToken({
        id: ownerId,
        email: 'owner@mycentennialcollege.ca',
        role: 'student',
      }),
      body: {
        rental_request_id: completedRequestId,
        rating: 5,
        comment: 'Owner is not the renter.',
        reviewer_id: renterId,
      },
    });
    assert.equal(ownerAttempt.status, 403);

    const otherAttempt = await api(baseUrl, 'POST', '/api/reviews', {
      token: signToken({
        id: otherStudentId,
        email: 'other@mycentennialcollege.ca',
        role: 'student',
      }),
      body: {
        rental_request_id: completedRequestId,
        rating: 5,
        comment: 'Unrelated student.',
        reviewer_id: renterId,
      },
    });
    assert.equal(otherAttempt.status, 403);
    assert.equal(await Review.countDocuments(), 0);
  });
});
