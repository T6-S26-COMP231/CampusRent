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
  verificationStatus: 'pending' | 'verified' | 'rejected' = 'verified'
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
    verification_status: verificationStatus,
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
    description: 'Stable tripod for media projects.',
    rental_terms: 'Campus pickup only.',
    availability: 'available',
    images: [],
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

describe('US-16.4 start conversation API', () => {
  test('successful authenticated creation stores listing and normalized participants', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId },
    });

    assert.equal(response.status, 201);
    assert.ok(response.data.id > 0);
    assert.equal(response.data.listing_id, listingId);

    const [low, high] = renterId < ownerId ? [renterId, ownerId] : [ownerId, renterId];
    assert.equal(response.data.participant_low_id, low);
    assert.equal(response.data.participant_high_id, high);
    assert.deepEqual(response.data.participant_ids, [low, high]);
    assert.equal(typeof response.data.created_at, 'string');
    assert.equal(typeof response.data.updated_at, 'string');

    const stored = await Conversation.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored.listing_id, listingId);
    assert.equal(stored.participant_low_id, low);
    assert.equal(stored.participant_high_id, high);
  });

  test('initiator is taken from the authenticated user, not the request body', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });
    const outsiderId = await createStudent(
      'outsider@mycentennialcollege.ca',
      'Out',
      'Sider'
    );

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: {
        listing_id: listingId,
        recipient_id: ownerId,
        initiator_id: outsiderId,
        participant_low_id: outsiderId,
      },
    });

    assert.equal(response.status, 201);
    assert.ok(!response.data.participant_ids.includes(outsiderId));
    assert.ok(response.data.participant_ids.includes(renterId));
    assert.ok(response.data.participant_ids.includes(ownerId));
  });

  test('unauthenticated request is denied', async () => {
    const response = await api(baseUrl, 'POST', '/api/conversations', {
      body: { listing_id: listingId, recipient_id: ownerId },
    });
    assert.equal(response.status, 401);
    assert.match(response.data.error, /Authentication required/i);
  });

  test('unverified student is denied', async () => {
    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      'pending'
    );
    const token = signToken({
      id: pendingId,
      email: 'pending@mycentennialcollege.ca',
      role: 'student',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId },
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /verification required/i);
  });

  test('invalid identifiers are rejected', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const missingListing = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { recipient_id: ownerId },
    });
    assert.equal(missingListing.status, 400);

    const missingRecipient = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId },
    });
    assert.equal(missingRecipient.status, 400);

    const badListing = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: -1, recipient_id: ownerId },
    });
    assert.equal(badListing.status, 400);

    const badRecipient = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: 'abc' },
    });
    assert.equal(badRecipient.status, 400);
  });

  test('missing listing is rejected', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: 999999, recipient_id: ownerId },
    });

    assert.equal(response.status, 404);
    assert.match(response.data.error, /Listing not found/i);
  });

  test('missing recipient is rejected', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: 999999 },
    });

    assert.equal(response.status, 404);
    assert.match(response.data.error, /Recipient not found/i);
  });

  test('self-conversation is rejected', async () => {
    const token = signToken({
      id: renterId,
      email: 'renter@mycentennialcollege.ca',
      role: 'student',
    });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: renterId },
    });

    assert.equal(response.status, 400);
    assert.match(response.data.error, /yourself/i);
  });
});
