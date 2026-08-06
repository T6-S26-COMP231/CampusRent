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

let server: Server;
let baseUrl: string;
let ownerId: number;
let renterId: number;
let outsiderId: number;
let listingId: number;

async function createStudent(email: string, firstName: string, lastName: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: firstName,
    last_name: lastName,
    phone: '',
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
    description: 'Test listing',
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
  ({ Conversation, conversationIdentity } = await import('../src/models/Conversation'));
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
  outsiderId = await createStudent('outsider@mycentennialcollege.ca', 'Out', 'Sider');
  listingId = await createListing(ownerId, 'Campus Camera');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-16.6 conversation list API', () => {
  test('authenticated participant sees their conversations with mapped listing and counterpart', async () => {
    const created = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId },
    });
    assert.equal(created.status, 201);

    const list = await api(baseUrl, 'GET', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });

    assert.equal(list.status, 200);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].id, created.data.id);
    assert.equal(list.data[0].listing.id, listingId);
    assert.equal(list.data[0].listing.title, 'Campus Camera');
    assert.equal(list.data[0].counterpart.id, ownerId);
    assert.equal(list.data[0].counterpart.first_name, 'Owner');
    assert.equal(list.data[0].counterpart.last_name, 'Student');
    assert.equal(list.data[0].latest_message_preview, null);
  });

  test('newly created conversation appears in GET /api/conversations', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const before = await api(baseUrl, 'GET', '/api/conversations', { token });
    assert.equal(before.data.length, 0);

    const created = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId },
    });
    assert.equal(created.status, 201);

    const after = await api(baseUrl, 'GET', '/api/conversations', { token });
    assert.equal(after.data.length, 1);
    assert.equal(after.data[0].id, created.data.id);
  });

  test('unrelated conversations are excluded', async () => {
    await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId },
    });

    const outsiderList = await api(baseUrl, 'GET', '/api/conversations', {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });

    assert.equal(outsiderList.status, 200);
    assert.equal(outsiderList.data.length, 0);
  });

  test('ordering is newest updated first', async () => {
    const secondListingId = await createListing(ownerId, 'Second Item');
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    const first = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId },
    });
    const second = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: secondListingId, recipient_id: ownerId },
    });

    // Bump the older conversation's updated_at so it should sort first.
    await Conversation.findByIdAndUpdate(first.data.id, {
      updated_at: new Date(Date.now() + 60_000),
    });

    const list = await api(baseUrl, 'GET', '/api/conversations', { token });
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 2);
    assert.equal(list.data[0].id, first.data.id);
    assert.equal(list.data[1].id, second.data.id);
  });

  test('unauthorized access is denied for list and detail', async () => {
    const created = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId },
    });

    const anonList = await api(baseUrl, 'GET', '/api/conversations');
    assert.equal(anonList.status, 401);

    const outsiderDetail = await api(baseUrl, 'GET', `/api/conversations/${created.data.id}`, {
      token: tokenFor(outsiderId, 'outsider@mycentennialcollege.ca'),
    });
    assert.equal(outsiderDetail.status, 403);

    const participantDetail = await api(baseUrl, 'GET', `/api/conversations/${created.data.id}`, {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(participantDetail.status, 200);
    assert.equal(participantDetail.data.counterpart.id, renterId);
  });

  test('missing conversation returns 404 for participants lookup', async () => {
    const response = await api(baseUrl, 'GET', '/api/conversations/999999', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 404);
  });

  test('list enrichment uses normalized participants regardless of insert order', async () => {
    const identity = conversationIdentity(listingId, ownerId, renterId);
    const id = await nextId('conversations');
    await Conversation.create({
      _id: id,
      ...identity,
      updated_at: new Date(),
    });

    const ownerView = await api(baseUrl, 'GET', '/api/conversations', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(ownerView.data[0].counterpart.id, renterId);

    const renterView = await api(baseUrl, 'GET', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
    });
    assert.equal(renterView.data[0].counterpart.id, ownerId);
  });
});
