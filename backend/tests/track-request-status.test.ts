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
let disconnectDatabase: () => Promise<void>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;
let RentalRequest: typeof import('../src/models/RentalRequest').RentalRequest;

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let otherId: number;
let listingId: number;
let requestId: number;
let mongoUri: string;

async function createStudent(email: string, first: string, last: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'hash',
    first_name: first,
    last_name: last,
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  return id;
}

async function createListing(owner: number) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title: 'Campus Tripod',
    category: 'Electronics',
    description: 'Stable tripod for media projects',
    rental_terms: 'Return within 7 days',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createRequest(
  listing: number,
  renter: number,
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed' = 'pending'
) {
  const start = new Date();
  start.setDate(start.getDate() + 2);
  const end = new Date();
  end.setDate(end.getDate() + 5);
  const id = await nextId('rental_requests');
  await RentalRequest.create({
    _id: id,
    listing_id: listing,
    renter_id: renter,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    status,
  });
  return id;
}

function tokenFor(id: number, email: string) {
  return signToken({ id, email, role: 'student' });
}

before(async () => {
  mongoUri = await startTestDatabase();
  ({ connectDatabase, disconnectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  ({ Listing } = await import('../src/models/Listing'));
  ({ RentalRequest } = await import('../src/models/RentalRequest'));
  await connectDatabase(mongoUri);

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Owner', 'Student');
  renterId = await createStudent('renter@mycentennialcollege.ca', 'Renter', 'Student');
  otherId = await createStudent('other@mycentennialcollege.ca', 'Other', 'Student');
  listingId = await createListing(ownerId);
  requestId = await createRequest(listingId, renterId, 'pending');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-15 track rental-request status', () => {
  test('renter sees only their own current and past requests', async () => {
    const otherListing = await createListing(ownerId);
    const mineAccepted = await createRequest(otherListing, renterId, 'accepted');
    const foreign = await createRequest(listingId, otherId, 'pending');

    const response = await api(baseUrl, 'GET', '/api/requests/mine', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.data));
    const ids = response.data.map((item: { id: number }) => item.id);
    assert.ok(ids.includes(requestId));
    assert.ok(ids.includes(mineAccepted));
    assert.ok(!ids.includes(foreign));
    assert.equal(response.data.length, 2);
    assert.ok(response.data[0].listing?.title);
    assert.ok(response.data[0].owner?.first_name);
    assert.ok(response.data[0].start_date);
    assert.ok(response.data[0].status);
  });

  test('pending, accepted, declined, cancelled, and completed statuses are returned', async () => {
    await RentalRequest.deleteMany({});
    const statuses = ['pending', 'accepted', 'declined', 'cancelled', 'completed'] as const;
    for (const status of statuses) {
      await createRequest(listingId, renterId, status);
    }

    const response = await api(baseUrl, 'GET', '/api/requests/mine', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 200);
    const returned = new Set(response.data.map((item: { status: string }) => item.status));
    for (const status of statuses) {
      assert.ok(returned.has(status), `missing status ${status}`);
    }
  });

  test('owner approval becomes visible to renter', async () => {
    const ownerToken = tokenFor(ownerId, 'owner@mycentennialcollege.ca');
    const renterToken = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    const approved = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
      token: ownerToken,
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.status, 'accepted');

    const mine = await api(baseUrl, 'GET', '/api/requests/mine', { token: renterToken });
    const row = mine.data.find((item: { id: number }) => item.id === requestId);
    assert.equal(row.status, 'accepted');
  });

  test('owner decline becomes visible to renter', async () => {
    const ownerToken = tokenFor(ownerId, 'owner@mycentennialcollege.ca');
    const renterToken = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    const declined = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: ownerToken,
    });
    assert.equal(declined.status, 200);

    const mine = await api(baseUrl, 'GET', '/api/requests/mine', { token: renterToken });
    const row = mine.data.find((item: { id: number }) => item.id === requestId);
    assert.equal(row.status, 'declined');
  });

  test('renter successfully cancels their own pending request', async () => {
    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/cancel`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'cancelled');

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'cancelled');
    assert.equal(stored?._id, requestId);
  });

  test('unauthorized user cannot cancel another renter request', async () => {
    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/cancel`, {
      token: tokenFor(otherId, 'other@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'pending');
  });

  test('non-pending request cannot be cancelled', async () => {
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/cancel`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /Only pending requests can be cancelled/i);
  });

  test('only an accepted request can become completed', async () => {
    const pendingComplete = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/complete`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(pendingComplete.status, 400);

    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    const completed = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/complete`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.status, 'completed');

    const listing = await Listing.findById(listingId).lean();
    assert.equal(listing?.availability, 'available');
  });

  test('listing owner can complete an accepted request', async () => {
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    const completed = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/complete`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.status, 'completed');
  });

  test('unauthorized user cannot complete a request', async () => {
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/complete`, {
      token: tokenFor(otherId, 'other@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'accepted');
  });

  test('missing request returns not found for cancel and complete', async () => {
    const cancel = await api(baseUrl, 'PATCH', '/api/requests/999999/cancel', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(cancel.status, 404);

    const complete = await api(baseUrl, 'PATCH', '/api/requests/999999/complete', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(complete.status, 404);
  });

  test('cancelled status is visible to the listing owner', async () => {
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/cancel`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    const incoming = await api(baseUrl, 'GET', '/api/requests/incoming', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    const row = incoming.data.find((item: { id: number }) => item.id === requestId);
    assert.equal(row.status, 'cancelled');
  });

  test('status changes remain persistent after reconnect', async () => {
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/cancel`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    await disconnectDatabase();
    await connectDatabase(mongoUri);

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'cancelled');

    const mine = await api(baseUrl, 'GET', '/api/requests/mine', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    const row = mine.data.find((item: { id: number }) => item.id === requestId);
    assert.equal(row.status, 'cancelled');
  });

  test('database errors return an appropriate response for mine endpoint', async () => {
    await disconnectDatabase();
    const response = await api(baseUrl, 'GET', '/api/requests/mine', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 503);
    assert.equal(response.data.error, 'Database unavailable. Please try again later.');
    await connectDatabase(mongoUri);
  });
});
