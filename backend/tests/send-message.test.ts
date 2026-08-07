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
  } = {}
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

async function createListing(owner: number) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title: 'Campus Camera',
    category: 'Electronics',
    description: 'Mirrorless camera for media projects.',
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

describe('US-17.4 send-message API endpoint', () => {
  test('authenticated verified user can reach the endpoint', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Hello from the renter' },
    });

    assert.equal(response.status, 201);
    assert.equal(typeof response.data.id, 'number');
  });

  test('unauthenticated request is denied', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      body: { body: 'No token' },
    });
    assert.equal(response.status, 401);
  });

  test('unverified student is denied before sending', async () => {
    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(pendingId, 'pending@mycentennialcollege.ca'),
      body: { body: 'Should be blocked' },
    });
    assert.equal(response.status, 403);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('valid message persists with id, conversation_id, sender_id, body, created_at', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: '  Pickup works after 5pm  ' },
    });

    assert.equal(response.status, 201);
    assert.equal(typeof response.data.id, 'number');
    assert.equal(response.data.conversation_id, conversationId);
    assert.equal(response.data.sender_id, ownerId);
    assert.equal(response.data.body, 'Pickup works after 5pm');
    assert.equal(typeof response.data.created_at, 'string');
    assert.ok(!Number.isNaN(Date.parse(response.data.created_at)));

    const stored = await Message.findById(response.data.id);
    assert.ok(stored);
    assert.equal(stored!.conversation_id, conversationId);
    assert.equal(stored!.sender_id, ownerId);
    assert.equal(stored!.body, 'Pickup works after 5pm');
    assert.ok(stored!.created_at instanceof Date);
  });

  test('sender comes from authentication, not request body', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        body: 'Ignoring forged sender',
        sender_id: ownerId,
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.sender_id, renterId);
    assert.notEqual(response.data.sender_id, ownerId);

    const stored = await Message.findById(response.data.id);
    assert.equal(stored!.sender_id, renterId);
  });

  test('missing conversation returns not found', async () => {
    const response = await api(baseUrl, 'POST', '/api/conversations/999999/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Orphan message' },
    });

    assert.equal(response.status, 404);
    assert.match(String(response.data.error), /not found/i);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('multiple valid messages persist separately and maintain chronological order', async () => {
    const first = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'First message' },
    });
    const second = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Second message' },
    });
    const third = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Third message' },
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 201);
    assert.notEqual(first.data.id, second.data.id);
    assert.notEqual(second.data.id, third.data.id);

    const ordered = await Message.find({ conversation_id: conversationId })
      .sort({ created_at: 1, _id: 1 })
      .lean();

    assert.equal(ordered.length, 3);
    assert.deepEqual(
      ordered.map((message) => message.body),
      ['First message', 'Second message', 'Third message']
    );
    assert.ok(ordered[0]._id < ordered[1]._id);
    assert.ok(ordered[1]._id < ordered[2]._id);
  });

  test('database persistence is verified with a later query', async () => {
    const created = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Persisted permanently' },
    });
    assert.equal(created.status, 201);

    const later = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(later.length, 1);
    assert.equal(later[0]._id, created.data.id);
    assert.equal(later[0].body, 'Persisted permanently');
    assert.equal(later[0].sender_id, ownerId);
  });

  test('invalid conversation id and missing body are rejected', async () => {
    const badId = await api(baseUrl, 'POST', '/api/conversations/not-a-number/messages', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Nope' },
    });
    assert.equal(badId.status, 400);

    const missingBody = await api(
      baseUrl,
      'POST',
      `/api/conversations/${conversationId}/messages`,
      {
        token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
        body: {},
      }
    );
    assert.equal(missingBody.status, 400);
    assert.match(String(missingBody.data.error), /body/i);
  });
});

describe('US-17.5 participant authorization and message validation', () => {
  test('conversation participant can send', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Participant send' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.sender_id, renterId);
  });

  test('second participant can send', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Owner reply' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.sender_id, ownerId);
  });

  test('unrelated verified user receives 403 and nothing is persisted', async () => {
    const beforeCount = await Message.countDocuments();
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
      body: { body: 'Should be denied' },
    });

    assert.equal(response.status, 403);
    assert.match(String(response.data.error), /participants may send/i);
    assert.equal(await Message.countDocuments(), beforeCount);
  });

  test('sender_id spoofing in body is ignored', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        body: 'Spoof attempt',
        sender_id: outsiderId,
        participant_ids: [outsiderId, ownerId],
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.sender_id, renterId);
    assert.equal((await Message.findById(response.data.id))!.sender_id, renterId);
  });

  test('blank body is rejected and not persisted', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: '' },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /blank|required/i);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('whitespace-only body is rejected and not persisted', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: '   \n\t  ' },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /blank/i);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('non-string body is rejected and not persisted', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: { text: 'object' } },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /string/i);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('over-2000-character body is rejected without truncation', async () => {
    const oversized = 'x'.repeat(MESSAGE_MAX_LENGTH + 1);
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: oversized },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error), /2000|exceed/i);
    assert.equal(await Message.countDocuments(), 0);
  });

  test('exactly 2000 characters are accepted', async () => {
    const exact = 'y'.repeat(MESSAGE_MAX_LENGTH);
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: exact },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.body.length, MESSAGE_MAX_LENGTH);
    assert.equal((await Message.findById(response.data.id))!.body, exact);
  });

  test('leading and trailing whitespace is trimmed before persistence', async () => {
    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: '  trimmed body  ' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.body, 'trimmed body');
    assert.equal((await Message.findById(response.data.id))!.body, 'trimmed body');
  });

  test('conversation updated_at changes after a valid message', async () => {
    const before = await Conversation.findById(conversationId);
    assert.ok(before);
    const previousUpdatedAt = before!.updated_at.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Updates conversation timestamp' },
    });
    assert.equal(response.status, 201);

    const after = await Conversation.findById(conversationId);
    assert.ok(after!.updated_at.getTime() >= previousUpdatedAt);
    assert.notEqual(after!.updated_at.getTime(), previousUpdatedAt);
  });

  test('failed message does not create a Message document; valid messages remain persisted', async () => {
    const valid = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Keep this one' },
    });
    assert.equal(valid.status, 201);

    const failed = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
      body: { body: 'Denied' },
    });
    assert.equal(failed.status, 403);

    const blank = await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: '   ' },
    });
    assert.equal(blank.status, 400);

    const messages = await Message.find({ conversation_id: conversationId }).lean();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].body, 'Keep this one');
    assert.equal(messages[0]._id, valid.data.id);
  });
});

describe('US-17.6 minimal current-conversation message read for send workflow', () => {
  test('participant can load chronological messages after sending', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'First' },
    });
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { body: 'Second' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.length, 2);
    assert.deepEqual(
      response.data.map((message: { body: string }) => message.body),
      ['First', 'Second']
    );
    assert.equal(response.data[0].conversation_id, conversationId);
    assert.equal(typeof response.data[0].id, 'number');
    assert.equal(typeof response.data[0].created_at, 'string');
  });

  test('unrelated verified user cannot load conversation messages', async () => {
    await api(baseUrl, 'POST', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { body: 'Private' },
    });

    const response = await api(baseUrl, 'GET', `/api/conversations/${conversationId}/messages`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);
  });
});
