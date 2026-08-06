/**
 * US-16.7 — TAC acceptance mapping for Start conversations.
 *
 * TAC Test 1 — Start conversation with another user → created
 * TAC Test 2 — View conversation list → newly created appears
 * TAC Test 3 — Start with a registered user → created successfully
 * TAC Test 4 — Unauthorized creation → access denied
 *
 * Empty-conversation assumption (not fully resolved): US-16 persists the
 * listing/participant shell; latest_message_preview stays null until US-17.
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
let Conversation: typeof import('../src/models/Conversation').Conversation;

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let listingId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: {
    verification_status?: 'pending' | 'verified' | 'rejected';
    status?: 'active' | 'suspended';
  } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: firstName,
    last_name: lastName,
    phone: '',
    role: 'student',
    verification_status: options.verification_status ?? 'verified',
    status: options.status ?? 'active',
  });
  return id;
}

async function createListing(owner: number) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title: 'Acceptance Tripod',
    category: 'Electronics',
    description: 'TAC acceptance listing',
    rental_terms: '',
    availability: 'available',
    images: [],
  });
  return id;
}

function tokenFor(userId: number, email: string) {
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
  ({ Conversation } = await import('../src/models/Conversation'));
  await connectDatabase(uri);
  await Conversation.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Owner', 'Student');
  renterId = await createStudent('renter@mycentennialcollege.ca', 'Renter', 'Student');
  listingId = await createListing(ownerId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-16 TAC acceptance tests', () => {
  test('TAC Test 1 — Start conversation with another user creates a conversation', async () => {
    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId },
    });

    assert.equal(response.status, 201);
    assert.ok(response.data.id > 0);

    const stored = await Conversation.findById(response.data.id).lean();
    assert.ok(stored, 'conversation must be persisted in MongoDB');
    assert.equal(stored.listing_id, listingId);
    assert.ok(
      [stored.participant_low_id, stored.participant_high_id].includes(ownerId)
    );
    assert.ok(
      [stored.participant_low_id, stored.participant_high_id].includes(renterId)
    );
  });

  test('TAC Test 2 — View conversation list shows the newly created conversation', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const created = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId },
    });
    assert.equal(created.status, 201);

    const list = await api(baseUrl, 'GET', '/api/conversations', { token });
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].id, created.data.id);
    assert.equal(list.data[0].listing.title, 'Acceptance Tripod');
    assert.equal(list.data[0].counterpart.id, ownerId);
    assert.equal(
      `${list.data[0].counterpart.first_name} ${list.data[0].counterpart.last_name}`,
      'Owner Student'
    );
    assert.equal(list.data[0].latest_message_preview, null);
  });

  test('TAC Test 3 — Start conversation with a registered verified user succeeds', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + 3);
    await RentalRequest.create({
      _id: await nextId('rental_requests'),
      listing_id: listingId,
      renter_id: renterId,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: 'pending',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: renterId },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.listing_id, listingId);
    assert.deepEqual(
      [...response.data.participant_ids].sort((a: number, b: number) => a - b),
      [ownerId, renterId].sort((a, b) => a - b)
    );

    const stored = await Conversation.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored.participant_low_id, Math.min(ownerId, renterId));
    assert.equal(stored.participant_high_id, Math.max(ownerId, renterId));
  });

  test('TAC Test 4 — Unauthorized conversation creation is denied', async () => {
    const strangerId = await createStudent(
      'stranger@mycentennialcollege.ca',
      'Strange',
      'Student'
    );

    const cases = await Promise.all([
      api(baseUrl, 'POST', '/api/conversations', {
        body: { listing_id: listingId, recipient_id: ownerId },
      }),
      api(baseUrl, 'POST', '/api/conversations', {
        token: tokenFor(strangerId, 'stranger@mycentennialcollege.ca'),
        body: { listing_id: listingId, recipient_id: renterId },
      }),
      api(baseUrl, 'POST', '/api/conversations', {
        token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
        body: { listing_id: listingId, recipient_id: strangerId },
      }),
    ]);

    assert.equal(cases[0].status, 401);
    assert.equal(cases[1].status, 403);
    assert.equal(cases[2].status, 403);
    assert.equal(await Conversation.countDocuments(), 0);
  });
});
