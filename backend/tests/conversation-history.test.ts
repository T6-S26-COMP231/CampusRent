/**
 * US-18.3 — conversation-history API contract.
 *
 * Reuses GET /api/conversations/:id/messages (US-17.6). No second history route.
 * Focuses on persisted history retrieval and response fields. New participant
 * authorization and chronological-order redesign belong to US-18.4.
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
let listingId: number;
let conversationId: number;
let otherConversationId: number;

type HistoryMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: string;
};

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
    description: 'US-18.3 history listing',
    rental_terms: 'Campus pickup only.',
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

function assertHistoryRecord(message: HistoryMessage, expected: Partial<HistoryMessage>) {
  assert.equal(typeof message.id, 'number');
  assert.equal(typeof message.conversation_id, 'number');
  assert.equal(typeof message.sender_id, 'number');
  assert.equal(typeof message.body, 'string');
  assert.equal(typeof message.created_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(message.created_at)), 'created_at must be parseable ISO');
  assert.equal(Object.keys(message).sort().join(','), 'body,conversation_id,created_at,id,sender_id');
  if (expected.id !== undefined) assert.equal(message.id, expected.id);
  if (expected.conversation_id !== undefined) {
    assert.equal(message.conversation_id, expected.conversation_id);
  }
  if (expected.sender_id !== undefined) assert.equal(message.sender_id, expected.sender_id);
  if (expected.body !== undefined) assert.equal(message.body, expected.body);
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
  listingId = await createListing(ownerId, 'History Camera');
  const otherListingId = await createListing(ownerId, 'Other Listing');
  conversationId = await createConversation(listingId, ownerId, renterId);
  otherConversationId = await createConversation(otherListingId, ownerId, renterId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-18.3 conversation-history API (GET /api/conversations/:id/messages)', () => {
  test('conversation with zero messages returns an empty history array', async () => {
    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.data));
    assert.equal(response.data.length, 0);
  });

  test('one persisted message is returned with full history fields', async () => {
    const created = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Single history message' },
    });
    assert.equal(created.status, 201);

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assertHistoryRecord(response.data[0], {
      id: created.data.id,
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Single history message',
    });
    assert.equal(response.data[0].created_at, created.data.created_at);
  });

  test('multiple persisted messages are returned with id, conversation_id, sender_id, body, created_at', async () => {
    const first = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'First' },
    });
    const second = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Second' },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 2);

    assertHistoryRecord(response.data[0], {
      id: first.data.id,
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'First',
    });
    assertHistoryRecord(response.data[1], {
      id: second.data.id,
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Second',
    });
  });

  test('historical messages remain retrievable in a later request (refresh/navigation)', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Persists across requests' },
    });

    const firstGet = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(firstGet.status, 200);
    assert.equal(firstGet.data.length, 1);

    const secondGet = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(secondGet.status, 200);
    assert.equal(secondGet.data.length, 1);
    assert.deepEqual(secondGet.data, firstGet.data);
    assertHistoryRecord(secondGet.data[0], {
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Persists across requests',
    });
  });

  test('messages from another conversation are not included', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Target conversation' },
    });
    await api(baseUrl, 'POST', `/api/conversations/${otherConversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Other conversation only' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].body, 'Target conversation');
    assert.equal(response.data[0].conversation_id, conversationId);
    assert.ok(
      response.data.every(
        (message: HistoryMessage) => message.conversation_id === conversationId
      )
    );
  });

  test('reading history does not delete or alter persisted messages', async () => {
    const created = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Immutable on read' },
    });
    assert.equal(created.status, 201);

    const before = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(before.length, 1);

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);

    const after = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(after.length, 1);
    assert.equal(after[0]._id, before[0]._id);
    assert.equal(after[0].conversation_id, before[0].conversation_id);
    assert.equal(after[0].sender_id, before[0].sender_id);
    assert.equal(after[0].body, before[0].body);
    assert.equal(after[0].created_at.toISOString(), before[0].created_at.toISOString());
    assert.equal(response.data[0].id, created.data.id);
    assert.equal(response.data[0].body, 'Immutable on read');
  });
});
