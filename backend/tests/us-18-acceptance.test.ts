/**
 * US-18.6 — TAC acceptance mapping for View conversation history.
 *
 * TAC Test 1 — Open conversation → Message history is displayed
 * TAC Test 2 — View chronological order → Messages appear in correct sequence
 * TAC Test 3 — Access previous messages → Historical messages are displayed
 * TAC Test 4 — Unauthorized access attempt → Access denied
 *
 * Broader field/auth/order detail remains in conversation-history.test.ts and
 * conversation-history-auth-order.test.ts. This suite stays acceptance-focused.
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

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let outsiderId: number;
let unverifiedId: number;
let listingId: number;
let conversationId: number;
let privateConversationId: number;

type HistoryMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: string;
};

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
    phone: '',
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
    description: 'US-18 TAC acceptance listing',
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

function assertHistoryFields(message: HistoryMessage) {
  assert.equal(typeof message.id, 'number');
  assert.equal(typeof message.conversation_id, 'number');
  assert.equal(typeof message.sender_id, 'number');
  assert.equal(typeof message.body, 'string');
  assert.equal(typeof message.created_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(message.created_at)));
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
  ({ Message } = await import('../src/models/Message'));
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
  unverifiedId = await createStudent('pending@mycentennialcollege.ca', 'Pending', 'Student', {
    verification_status: 'pending',
  });
  listingId = await createListing(ownerId, 'US-18 Acceptance Camera');
  const privateListingId = await createListing(ownerId, 'Owner-Outsider Private');
  conversationId = await createConversation(listingId, ownerId, renterId);
  privateConversationId = await createConversation(privateListingId, ownerId, outsiderId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-18 TAC acceptance tests', () => {
  test('TAC Test 1 — Open conversation displays message history', async () => {
    const renterToken = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const ownerToken = tokenFor(ownerId, 'owner@mycentennialcollege.ca');

    const empty = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: renterToken,
    });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data, []);

    const created = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: renterToken,
      body: { body: 'Can we meet at the library?' },
    });
    assert.equal(created.status, 201);

    const openedByRenter = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages`,
      { token: renterToken }
    );
    assert.equal(openedByRenter.status, 200);
    assert.equal(openedByRenter.data.length, 1);
    assertHistoryFields(openedByRenter.data[0]);
    assert.equal(openedByRenter.data[0].id, created.data.id);
    assert.equal(openedByRenter.data[0].conversation_id, conversationId);
    assert.equal(openedByRenter.data[0].sender_id, renterId);
    assert.equal(openedByRenter.data[0].body, 'Can we meet at the library?');

    const openedByOwner = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages`,
      { token: ownerToken }
    );
    assert.equal(openedByOwner.status, 200);
    assert.deepEqual(openedByOwner.data, openedByRenter.data);
  });

  test('TAC Test 2 — View chronological order shows correct sequence', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const earlier = new Date('2026-08-08T10:00:00.000Z');
    const later = new Date('2026-08-08T12:00:00.000Z');
    const sameInstant = new Date('2026-08-08T11:00:00.000Z');

    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Later by clock',
      created_at: later,
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Earlier by clock',
      created_at: earlier,
    });

    const lowerId = await nextId('messages');
    const higherId = await nextId('messages');
    await Message.create({
      _id: higherId,
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Same-time higher id',
      created_at: sameInstant,
    });
    await Message.create({
      _id: lowerId,
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Same-time lower id',
      created_at: sameInstant,
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.data.map((message: HistoryMessage) => message.body),
      ['Earlier by clock', 'Same-time lower id', 'Same-time higher id', 'Later by clock']
    );
    assert.ok(response.data[1].id < response.data[2].id);

    const again = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(again.status, 200);
    assert.deepEqual(again.data, response.data);
  });

  test('TAC Test 3 — Access previous messages keeps historical messages available', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const first = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token,
      body: { body: 'Historical note one' },
    });
    const second = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Historical note two' },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const firstGet = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token,
    });
    assert.equal(firstGet.status, 200);
    assert.equal(firstGet.data.length, 2);

    // Fresh later GET simulates navigation away / refresh.
    const laterGet = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token,
    });
    assert.equal(laterGet.status, 200);
    assert.deepEqual(laterGet.data, firstGet.data);
    assert.deepEqual(
      laterGet.data.map((message: HistoryMessage) => message.body),
      ['Historical note one', 'Historical note two']
    );

    const before = await Message.find({ conversation_id: conversationId }).lean();
    await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, { token });
    const after = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(after.length, before.length);
    assert.equal(after[0].body, before[0].body);
    assert.equal(after[0]._id, before[0]._id);
  });

  test('TAC Test 4 — Unauthorized access attempt is denied', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Protected history' },
    });
    await api(baseUrl, 'POST', `/api/conversations/${privateConversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Private to owner/outsider' },
    });

    const nonParticipant = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages`,
      { token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca') }
    );
    assert.equal(nonParticipant.status, 403);

    const unauthenticated = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages`
    );
    assert.equal(unauthenticated.status, 401);

    const unverified = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages`,
      { token: tokenFor(unverifiedId, 'pending@mycentennialcollege.ca') }
    );
    assert.equal(unverified.status, 403);

    const wrongUrl = await api(
      baseUrl,
      'GET',
      `/api/conversations/${privateConversationId}/messages`,
      { token: tokenFor(renterId, 'renter@mycentennialcollege.ca') }
    );
    assert.equal(wrongUrl.status, 403);

    const stillThere = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(stillThere.length, 1);
    assert.equal(stillThere[0].body, 'Protected history');
  });
});

describe('US-18.6 acceptance supporting history contract checks', () => {
  test('history response fields, isolation, and invalid/missing conversation ids', async () => {
    const otherListingId = await createListing(ownerId, 'Other listing');
    const otherConversationId = await createConversation(otherListingId, ownerId, renterId);

    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Target only',
      created_at: new Date('2026-08-08T09:00:00.000Z'),
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: otherConversationId,
      sender_id: renterId,
      body: 'Other conversation',
      created_at: new Date('2026-08-08T08:00:00.000Z'),
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assertHistoryFields(response.data[0]);
    assert.equal(response.data[0].body, 'Target only');
    assert.equal(response.data[0].conversation_id, conversationId);

    const invalid = await api(baseUrl, 'GET', '/api/conversations/abc/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(invalid.status, 400);

    const missing = await api(baseUrl, 'GET', '/api/conversations/999999/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(missing.status, 404);
  });
});
