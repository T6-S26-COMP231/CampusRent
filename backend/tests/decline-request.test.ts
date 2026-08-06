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

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let otherStudentId: number;
let listingId: number;
let requestId: number;

async function createVerifiedStudent(email: string, firstName: string, lastName: string) {
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

async function createListing(owner: number) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title: 'Campus Camera Kit',
    category: 'Electronics',
    description: 'DSLRs and lenses for media projects.',
    rental_terms: 'Return within 7 days.',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createPendingRequest(listing: number, renter: number) {
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
    status: 'pending',
  });
  return id;
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
  await connectDatabase(uri);

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await createVerifiedStudent('owner@mycentennialcollege.ca', 'Owner', 'Student');
  renterId = await createVerifiedStudent('renter@mycentennialcollege.ca', 'Renter', 'Student');
  otherStudentId = await createVerifiedStudent('other@mycentennialcollege.ca', 'Other', 'Student');
  listingId = await createListing(ownerId);
  requestId = await createPendingRequest(listingId, renterId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-14 decline rental requests', () => {
  test('successful decline changes status to declined and persists', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: ownerToken,
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'declined');

    const stored = await RentalRequest.findById(requestId).lean();
    assert.ok(stored);
    assert.equal(stored.status, 'declined');

    const listing = await Listing.findById(listingId).lean();
    assert.equal(listing?.availability, 'available');
  });

  test('unauthorized decline is denied and request remains unchanged', async () => {
    const otherToken = signToken({
      id: otherStudentId,
      email: 'other@mycentennialcollege.ca',
      role: 'student',
    });
    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: otherToken,
    });

    assert.equal(response.status, 403);
    assert.match(String(response.data.error), /listing owner/i);

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'pending');
  });

  test('renter cannot decline and request remains pending', async () => {
    const renterToken = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });
    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: renterToken,
    });

    assert.equal(response.status, 403);
    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'pending');
  });

  test('missing request returns 404', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    const response = await api(baseUrl, 'PATCH', '/api/requests/999999/decline', {
      token: ownerToken,
    });

    assert.equal(response.status, 404);
    assert.equal(response.data.error, 'Request not found');
  });

  test('invalid request status cannot be declined', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/approve`, { token: ownerToken });

    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: ownerToken,
    });

    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /Only pending requests can be declined/i);

    const stored = await RentalRequest.findById(requestId).lean();
    assert.equal(stored?.status, 'accepted');
  });

  test('already declined request cannot be declined again', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, { token: ownerToken });

    const response = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: ownerToken,
    });

    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /Only pending requests can be declined/i);
  });

  test('renter can see Declined status after owner declines', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    const renterToken = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const declineResponse = await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, {
      token: ownerToken,
    });
    assert.equal(declineResponse.status, 200);
    assert.equal(declineResponse.data.status, 'declined');

    const renterView = await api(baseUrl, 'GET', `/api/requests/mine/listing/${listingId}`, {
      token: renterToken,
    });
    assert.equal(renterView.status, 200);
    assert.equal(renterView.data.status, 'declined');
    assert.equal(renterView.data.id, requestId);
  });

  test('owner incoming dashboard shows declined request', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, { token: ownerToken });

    const incoming = await api(baseUrl, 'GET', '/api/requests/incoming', { token: ownerToken });
    assert.equal(incoming.status, 200);
    const declined = incoming.data.find((item: { id: number }) => item.id === requestId);
    assert.ok(declined);
    assert.equal(declined.status, 'declined');
  });

  test('decline does not delete the rental request', async () => {
    const ownerToken = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    await api(baseUrl, 'PATCH', `/api/requests/${requestId}/decline`, { token: ownerToken });

    const stored = await RentalRequest.findById(requestId).lean();
    assert.ok(stored);
    assert.equal(stored._id, requestId);
    assert.equal(stored.status, 'declined');
  });
});
