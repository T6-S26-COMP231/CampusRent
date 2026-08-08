/**
 * US-18.4 — participant authorization and chronological ordering for
 * GET /api/conversations/:id/messages.
 *
 * Proves existing US-17/US-18.3 behaviour against TAC without rewriting the route.
 * History-contract field coverage remains in conversation-history.test.ts.
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
let otherConversationId: number;
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
    description: 'US-18.4 auth/order listing',
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
  listingId = await createListing(ownerId, 'Auth Order Camera');
  const otherListingId = await createListing(ownerId, 'Shared Other Listing');
  const privateListingId = await createListing(ownerId, 'Owner-Outsider Private');
  conversationId = await createConversation(listingId, ownerId, renterId);
  otherConversationId = await createConversation(otherListingId, ownerId, renterId);
  privateConversationId = await createConversation(privateListingId, ownerId, outsiderId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-18.4 history participant authorization', () => {
  test('first participant can retrieve complete persisted history', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Renter note' },
    });
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Owner reply' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 2);
    assert.deepEqual(
      response.data.map((message: HistoryMessage) => message.body),
      ['Renter note', 'Owner reply']
    );
  });

  test('second participant can retrieve complete persisted history', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Shared history' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].body, 'Shared history');
    assert.equal(response.data[0].sender_id, renterId);
  });

  test('unrelated verified user receives 403', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Private thread' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 403);
    assert.match(String(response.data.error), /participant/i);
  });

  test('unauthenticated user receives 401', async () => {
    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`);
    assert.equal(response.status, 401);
  });

  test('unverified student is denied by existing middleware (403)', async () => {
    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(unverifiedId, 'pending@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);
  });

  test('invalid conversation id receives 400', async () => {
    const response = await api(baseUrl, 'GET', '/api/conversations/abc/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 400);
  });

  test('missing conversation receives 404', async () => {
    const response = await api(baseUrl, 'GET', '/api/conversations/999999/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 404);
  });

  test('participant cannot retrieve another conversation by changing the URL id', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Renter-owner only' },
    });
    await api(baseUrl, 'POST', `/api/conversations/${privateConversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Owner-outsider secret' },
    });

    const denied = await api(
      baseUrl,
      'GET',
      `/api/conversations/${privateConversationId}/messages`,
      { token: tokenFor(renterId, 'renter@mycentennialcollege.ca') }
    );
    assert.equal(denied.status, 403);

    const allowed = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.data.length, 1);
    assert.equal(allowed.data[0].body, 'Renter-owner only');
    assert.ok(
      allowed.data.every(
        (message: HistoryMessage) => message.conversation_id === conversationId
      )
    );
  });

  test('client-supplied participant ids in query never grant access', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Cannot spoof access' },
    });

    // GET cannot carry a JSON body under fetch; spoof attempts use query params only.
    // Authorization still uses req.user.id + stored participant pair only.
    const spoofed = await api(
      baseUrl,
      'GET',
      `/api/conversations/${conversationId}/messages?participant_id=${renterId}&user_id=${renterId}&participant_ids=${renterId},${ownerId}`,
      { token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca') }
    );

    assert.equal(spoofed.status, 403);
  });

  test('denied requests do not alter or delete persisted history', async () => {
    const created = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Survive denied reads' },
    });
    assert.equal(created.status, 201);

    const before = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(before.length, 1);

    const denied = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });
    assert.equal(denied.status, 403);

    const after = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(after.length, 1);
    assert.equal(after[0]._id, before[0]._id);
    assert.equal(after[0].body, before[0].body);
    assert.equal(after[0].sender_id, before[0].sender_id);
    assert.equal(after[0].created_at.toISOString(), before[0].created_at.toISOString());
  });
});

describe('US-18.4 history chronological ordering', () => {
  test('messages return oldest → newest by created_at ascending', async () => {
    const earlier = new Date('2026-08-01T10:00:00.000Z');
    const later = new Date('2026-08-01T12:00:00.000Z');

    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Later by time',
      created_at: later,
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Earlier by time',
      created_at: earlier,
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.data.map((message: HistoryMessage) => message.body),
      ['Earlier by time', 'Later by time']
    );
    assert.ok(
      Date.parse(response.data[0].created_at) < Date.parse(response.data[1].created_at)
    );
  });

  test('equal created_at messages use _id ascending as deterministic tie-break', async () => {
    const sameInstant = new Date('2026-08-08T15:00:00.000Z');
    const earlierId = await nextId('messages');
    const laterId = await nextId('messages');
    assert.ok(earlierId < laterId);

    await Message.create({
      _id: laterId,
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Same-time higher id',
      created_at: sameInstant,
    });
    await Message.create({
      _id: earlierId,
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'Same-time lower id',
      created_at: sameInstant,
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.data.map((message: HistoryMessage) => message.body),
      ['Same-time lower id', 'Same-time higher id']
    );
    assert.equal(response.data[0].id, earlierId);
    assert.equal(response.data[1].id, laterId);
    assert.ok(response.data[0].id < response.data[1].id);
  });

  test('repeated GET returns the same ordering when data has not changed', async () => {
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'A',
      created_at: new Date('2026-08-02T09:00:00.000Z'),
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'B',
      created_at: new Date('2026-08-02T09:05:00.000Z'),
    });

    const first = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    const second = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.deepEqual(
      first.data.map((message: HistoryMessage) => message.body),
      ['A', 'B']
    );
  });

  test('messages from another conversation are excluded', async () => {
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renterId,
      body: 'In target',
      created_at: new Date('2026-08-03T10:00:00.000Z'),
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: otherConversationId,
      sender_id: renterId,
      body: 'In other conversation',
      created_at: new Date('2026-08-03T09:00:00.000Z'),
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].body, 'In target');
    assert.equal(response.data[0].conversation_id, conversationId);
  });

  test('reading history does not mutate created_at, ids, or stored messages', async () => {
    const createdAt = new Date('2026-08-04T11:00:00.000Z');
    const id = await nextId('messages');
    await Message.create({
      _id: id,
      conversation_id: conversationId,
      sender_id: ownerId,
      body: 'Immutable on ordered read',
      created_at: createdAt,
    });

    const before = await Message.findById(id).lean();
    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 200);

    const after = await Message.findById(id).lean();
    assert.equal(after!._id, before!._id);
    assert.equal(after!.body, before!.body);
    assert.equal(after!.sender_id, before!.sender_id);
    assert.equal(after!.conversation_id, before!.conversation_id);
    assert.equal(after!.created_at.toISOString(), before!.created_at.toISOString());
    assert.equal(response.data[0].id, id);
    assert.equal(response.data[0].created_at, createdAt.toISOString());
  });
});
