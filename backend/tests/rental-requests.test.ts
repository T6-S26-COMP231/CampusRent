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

let mongoUri: string;
let ownerId: number;
let renterId: number;
let listingId: number;
let requestId: number;

async function withFreshServer(run: (baseUrl: string) => Promise<void>) {
  await disconnectDatabase();
  await connectDatabase(mongoUri);
  const { server, baseUrl } = await listenApp(createApp());
  try {
    await run(baseUrl);
  } finally {
    await closeServer(server);
  }
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
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await nextId('users');
  renterId = await nextId('users');
  await User.create({
    _id: ownerId,
    email: 'owner@mycentennialcollege.ca',
    password_hash: 'hash',
    first_name: 'Owner',
    last_name: 'Student',
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  await User.create({
    _id: renterId,
    email: 'renter@mycentennialcollege.ca',
    password_hash: 'hash',
    first_name: 'Renter',
    last_name: 'Student',
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  listingId = await nextId('listings');
  await Listing.create({
    _id: listingId,
    owner_id: ownerId,
    title: 'Shared Lab Kit',
    category: 'Lab Equipment',
    description: 'Persistent rental request fixture',
    rental_terms: '',
    availability: 'available',
    images: [],
  });
  requestId = await nextId('rental_requests');
  const start = new Date();
  start.setDate(start.getDate() + 2);
  const end = new Date();
  end.setDate(end.getDate() + 4);
  await RentalRequest.create({
    _id: requestId,
    listing_id: listingId,
    renter_id: renterId,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    status: 'pending',
  });
});

after(async () => {
  await stopTestDatabase();
});

describe('rental request MongoDB persistence', () => {
  test('approved request remains accepted after a new server instance', async () => {
    const ownerToken = signToken({
      id: ownerId,
      email: 'owner@mycentennialcollege.ca',
      role: 'student',
    });
    const renterToken = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    await withFreshServer(async (baseUrl) => {
      const approved = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, {
        token: ownerToken,
      });
      assert.equal(approved.status, 200);
      assert.equal(approved.data.status, 'accepted');
    });

    await withFreshServer(async (baseUrl) => {
      const renterView = await api(baseUrl, 'GET', `/api/requests/mine/listing/${listingId}`, {
        token: renterToken,
      });
      assert.equal(renterView.status, 200);
      assert.equal(renterView.data.status, 'accepted');

      const listing = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
        token: ownerToken,
      });
      assert.equal(listing.status, 200);
      assert.equal(listing.data.availability, 'unavailable');
    });
  });

  test('declined request remains declined after a new server instance', async () => {
    const ownerToken = signToken({
      id: ownerId,
      email: 'owner@mycentennialcollege.ca',
      role: 'student',
    });
    const renterToken = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    await withFreshServer(async (baseUrl) => {
      const declined = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
        token: ownerToken,
      });
      assert.equal(declined.status, 200);
      assert.equal(declined.data.status, 'declined');
    });

    await withFreshServer(async (baseUrl) => {
      const renterView = await api(baseUrl, 'GET', `/api/requests/mine/listing/${listingId}`, {
        token: renterToken,
      });
      assert.equal(renterView.status, 200);
      assert.equal(renterView.data.status, 'declined');

      const listing = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
        token: ownerToken,
      });
      assert.equal(listing.status, 200);
      assert.equal(listing.data.availability, 'available');
    });
  });
});

