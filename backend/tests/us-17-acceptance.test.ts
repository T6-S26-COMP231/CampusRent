/**
 * US-17.7 — TAC acceptance mapping for Send messages within a conversation.
 *
 * TAC Test 1 — Send message → stored successfully
 * TAC Test 2 — Send multiple messages → appear in sequence
 * TAC Test 3 — Send blank message → submission prevented
 * TAC Test 4 — Non-participant sends message → access denied
 *
 * Broader unit/integration detail remains in send-message.test.ts and
 * message-model.test.ts. This suite stays acceptance-focused and deterministic.
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
let Conversation: typeof import('../src/models/Conversation').Conversation;
let conversationIdentity: typeof import('../src/models/Conversation').conversationIdentity;
let Message: typeof import('../src/models/Message').Message;
let MESSAGE_MAX_LENGTH: typeof import('../src/models/Message').MESSAGE_MAX_LENGTH;

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let outsiderId: number;
let listingId: number;
let conversationId: number;

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
    title: 'US-17 Acceptance Camera',
    category: 'Electronics',
    description: 'TAC acceptance listing for messaging',
    rental_terms: '',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createConversation(listing: number, userA: number, userB: number) {
  const id = await nextId('conversations');
  await Conversation.create({
    _id: id,
    ...conversationIdentity(listing, userA, userB),
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
  ({ Conversation, conversationIdentity } = await import('../src/models/Conversation'));
  ({ Message, MESSAGE_MAX_LENGTH } = await import('../src/models/Message'));
  await connectDatabase(uri);
  await Conversation.syncIndexes();
  await Message.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Owner', 'Student');
  renterId = await createStudent('renter@mycentennialcollege.ca', 'Renter', 'Student');
  outsiderId = await createStudent('outsider@mycentennialcollege.ca', 'Other', 'Student');
  listingId = await createListing(ownerId);
  conversationId = await createConversation(listingId, ownerId, renterId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-17 TAC acceptance tests', () => {
  test('TAC Test 1 — Send message stores successfully', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: '  Ready to arrange pickup  ' },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.conversation_id, conversationId);
    assert.equal(response.data.sender_id, renterId);
    assert.equal(response.data.body, 'Ready to arrange pickup');
    assert.equal(typeof response.data.created_at, 'string');

    const stored = await Message.findById(response.data.id);
    assert.ok(stored, 'message must be persisted in MongoDB');
    assert.equal(stored!.conversation_id, conversationId);
    assert.equal(stored!.sender_id, renterId);
    assert.equal(stored!.body, 'Ready to arrange pickup');
    assert.ok(stored!.created_at instanceof Date);
  });

  test('TAC Test 2 — Send multiple messages appear in sequence', async () => {
    const renterToken = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const ownerToken = tokenFor(ownerId, 'owner@mycentennialcollege.ca');

    const first = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: renterToken,
      body: { body: 'First message' },
    });
    const second = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: ownerToken,
      body: { body: 'Second message' },
    });
    const third = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: renterToken,
      body: { body: 'Third message' },
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 201);

    const thread = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: renterToken,
    });
    assert.equal(thread.status, 200);
    assert.deepEqual(
      thread.data.map((message: { body: string }) => message.body),
      ['First message', 'Second message', 'Third message']
    );
    assert.ok(thread.data[0].id < thread.data[1].id);
    assert.ok(thread.data[1].id < thread.data[2].id);

    const fromDb = await Message.find({ conversation_id: conversationId })
      .sort({ created_at: 1, _id: 1 })
      .lean();
    assert.deepEqual(
      fromDb.map((message) => message.body),
      ['First message', 'Second message', 'Third message']
    );
  });

  test('TAC Test 3 — Send blank message is prevented', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const cases = await Promise.all([
      api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
        token,
        body: { body: '' },
      }),
      api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
        token,
        body: { body: '   \n\t  ' },
      }),
      api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
        token,
        body: {},
      }),
    ]);

    assert.equal(cases[0].status, 400);
    assert.equal(cases[1].status, 400);
    assert.equal(cases[2].status, 400);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('TAC Test 4 — Non-participant send is denied', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
      body: { body: 'Should not be stored' },
    });

    assert.equal(response.status, 403);
    assert.match(String(response.data.error), /participants may send/i);
    assert.equal(await Message.countDocuments(), 0);
  });
});

describe('US-17.7 acceptance supporting authorization and validation', () => {
  test('both participants can send; sender_id comes from auth only', async () => {
    const renterSend = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'From renter', sender_id: ownerId },
    });
    const ownerSend = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'From owner', sender_id: outsiderId },
    });

    assert.equal(renterSend.status, 201);
    assert.equal(ownerSend.status, 201);
    assert.equal(renterSend.data.sender_id, renterId);
    assert.equal(ownerSend.data.sender_id, ownerId);
  });

  test('unauthenticated and unverified users are denied', async () => {
    const unverifiedId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );

    const unauthenticated = await api(
      baseUrl,
      'POST',
      `/api/conversations/${conversationId}/messages`,
      { body: { body: 'No token' } }
    );
    const unverified = await api(
      baseUrl,
      'POST',
      `/api/conversations/${conversationId}/messages`,
      {
        token: tokenFor(unverifiedId, 'pending@mycentennialcollege.ca'),
        body: { body: 'Not verified' },
      }
    );

    assert.equal(unauthenticated.status, 401);
    assert.equal(unverified.status, 403);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('invalid payloads and missing conversation are rejected without persistence', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    const invalidId = await api(baseUrl, 'POST', '/api/conversations/abc/messages', {
      token,
      body: { body: 'Nope' },
    });
    const missing = await api(baseUrl, 'POST', '/api/conversations/999999/messages', {
      token,
      body: { body: 'Missing conversation' },
    });
    const nonString = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token,
      body: { body: 123 },
    });
    const oversized = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token,
      body: { body: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) },
    });
    const exact = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token,
      body: { body: 'y'.repeat(MESSAGE_MAX_LENGTH) },
    });

    assert.equal(invalidId.status, 400);
    assert.equal(missing.status, 404);
    assert.equal(nonString.status, 400);
    assert.equal(oversized.status, 400);
    assert.equal(exact.status, 201);
    assert.equal(await Message.countDocuments(), 1);
    assert.equal((await Message.findById(exact.data.id))!.body.length, MESSAGE_MAX_LENGTH);
  });

  test('active-thread GET is participant-only and chronological with stable id ties', async () => {
    const sameInstant = new Date('2026-08-07T18:00:00.000Z');
    const earlierId = await nextId('messages');
    const laterId = await nextId('messages');

    await Message.create({
      _id: laterId,
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Same-time later id',
      created_at: sameInstant,
    });
    await Message.create({
      _id: earlierId,
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Same-time earlier id',
      created_at: sameInstant,
    });

    const allowed = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    const denied = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });

    assert.equal(allowed.status, 200);
    assert.deepEqual(
      allowed.data.map((message: { body: string }) => message.body),
      ['Same-time earlier id', 'Same-time later id']
    );
    assert.ok(allowed.data[0].id < allowed.data[1].id);
    assert.equal(denied.status, 403);
  });

  test('conversation updated_at changes after a successful send', async () => {
    const before = await Conversation.findById(conversationId);
    const previous = before!.updated_at.getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Bump conversation timestamp' },
    });
    assert.equal(response.status, 201);

    const after = await Conversation.findById(conversationId);
    assert.ok(after!.updated_at.getTime() > previous);
  });
});
