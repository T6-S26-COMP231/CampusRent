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
let conversationIdentity: typeof import('../src/models/Conversation').conversationIdentity;

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
    phone: '416-555-0100',
    role: 'student',
    verification_status: options.verification_status ?? 'verified',
    status: options.status ?? 'active',
  });
  return id;
}

async function createListing(owner: number, title = 'Campus Tripod') {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title,
    category: 'Electronics',
    description: 'Stable tripod for media projects.',
    rental_terms: 'Campus pickup only.',
    availability: 'available',
    images: [],
  });
  return id;
}

async function createRequest(listing: number, renter: number) {
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
  listingId = await createListing(ownerId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-16.7 conversation creation, authorization, and duplicates', () => {
  test('verified renter starts with listing owner and persists normalized participants', async () => {
    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.listing_id, listingId);
    assert.ok(response.data.participant_ids.includes(ownerId));
    assert.ok(response.data.participant_ids.includes(renterId));

    const stored = await Conversation.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored.listing_id, listingId);
    assert.equal(stored.participant_low_id, Math.min(ownerId, renterId));
    assert.equal(stored.participant_high_id, Math.max(ownerId, renterId));
  });

  test('verified owner starts with eligible renter and persists listing context', async () => {
    await createRequest(listingId, renterId);

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: renterId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.listing_id, listingId);
    assert.ok(response.data.participant_ids.includes(ownerId));
    assert.ok(response.data.participant_ids.includes(renterId));

    const stored = await Conversation.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored.listing_id, listingId);
  });

  test('listing owner cannot start with an unrelated user', async () => {
    const strangerId = await createStudent(
      'stranger@mycentennialcollege.ca',
      'Strange',
      'Student'
    );

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: strangerId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /requested this listing/i);
    assert.equal(await Conversation.countDocuments(), 0);
  });

  test('non-owner cannot choose a recipient other than the owner', async () => {
    const otherRenterId = await createStudent(
      'other@mycentennialcollege.ca',
      'Other',
      'Renter'
    );
    await createRequest(listingId, otherRenterId);

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: otherRenterId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /listing owner/i);
  });

  test('self-conversation is rejected', async () => {
    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: renterId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 400);
    assert.match(response.data.error, /yourself/i);
  });

  test('unverified initiator is rejected', async () => {
    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(pendingId, 'pending@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /verification required/i);
  });

  test('unverified recipient is rejected', async () => {
    await User.findByIdAndUpdate(ownerId, { verification_status: 'pending' });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /verified registered students/i);
    assert.equal(await Conversation.countDocuments(), 0);
  });

  test('suspended recipient is rejected', async () => {
    await User.findByIdAndUpdate(ownerId, { status: 'suspended' });

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.match(response.data.error, /not available/i);
    assert.equal(await Conversation.countDocuments(), 0);
  });

  test('unrelated third party is rejected', async () => {
    await createRequest(listingId, renterId);
    const thirdPartyId = await createStudent(
      'third@mycentennialcollege.ca',
      'Third',
      'Party'
    );

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(thirdPartyId, 'third@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: renterId , body: 'Hello — is this still available?'},
    });

    assert.equal(response.status, 403);
    assert.equal(await Conversation.countDocuments(), 0);
  });

  test('first creation returns 201 and duplicate returns 200 with the same id', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const body = { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'};

    const first = await api(baseUrl, 'POST', '/api/conversations', { token, body });
    assert.equal(first.status, 201);

    const second = await api(baseUrl, 'POST', '/api/conversations', { token, body });
    assert.equal(second.status, 200);
    assert.equal(second.data.id, first.data.id);
    assert.equal(await Conversation.countDocuments(), 1);
  });

  test('reversed participant order returns the same conversation', async () => {
    await createRequest(listingId, renterId);

    const created = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });
    assert.equal(created.status, 201);

    const reversed = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(ownerId, 'owner@mycentennialcollege.ca'),
      body: { listing_id: listingId, recipient_id: renterId , body: 'Hello — is this still available?'},
    });

    assert.equal(reversed.status, 200);
    assert.equal(reversed.data.id, created.data.id);
    assert.equal(await Conversation.countDocuments(), 1);
  });

  test('different listing permits a separate conversation', async () => {
    const secondListingId = await createListing(ownerId, 'Second Tripod');
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    const first = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });
    const second = await api(baseUrl, 'POST', '/api/conversations', {
      token,
      body: { listing_id: secondListingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.data.id, second.data.id);
    assert.equal(await Conversation.countDocuments(), 2);
  });

  test('duplicate-key race handling returns the existing conversation', async () => {
    const identity = conversationIdentity(listingId, renterId, ownerId);
    const existingId = await nextId('conversations');
    await Conversation.create({ _id: existingId, ...identity });

    // Force the 11000 path: first findOne misses, create hits the unique index, retry find succeeds.
    const originalFindOne = Conversation.findOne;
    let findCalls = 0;
    Conversation.findOne = ((...args: unknown[]) => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve(null) as never;
      }
      return Reflect.apply(originalFindOne, Conversation, args);
    }) as typeof Conversation.findOne;

    try {
      const response = await api(baseUrl, 'POST', '/api/conversations', {
        token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
        body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
      });

      assert.equal(response.status, 200);
      assert.equal(response.data.id, existingId);
      assert.equal(await Conversation.countDocuments(), 1);
      assert.ok(findCalls >= 2);
    } finally {
      Conversation.findOne = originalFindOne;
    }
  });

  test('concurrent duplicate attempts leave only one MongoDB record', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');
    const body = { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'};

    const results = await Promise.all([
      api(baseUrl, 'POST', '/api/conversations', { token, body }),
      api(baseUrl, 'POST', '/api/conversations', { token, body }),
      api(baseUrl, 'POST', '/api/conversations', { token, body }),
    ]);

    const ids = new Set(results.map((result) => result.data.id));
    assert.equal(ids.size, 1);
    assert.ok(results.every((result) => result.status === 200 || result.status === 201));
    assert.ok(results.some((result) => result.status === 201) || results.every((r) => r.status === 200));
    assert.equal(await Conversation.countDocuments(), 1);
  });

  test('initiator is taken from the authenticated user, not the request body', async () => {
    const outsiderId = await createStudent(
      'outsider@mycentennialcollege.ca',
      'Out',
      'Sider'
    );

    const response = await api(baseUrl, 'POST', '/api/conversations', {
      token: tokenFor(renterId, 'renter@mycentennialcollege.ca'),
      body: {
        listing_id: listingId,
        recipient_id: ownerId,
        body: 'Hello — is this still available?',
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
      body: { listing_id: listingId, recipient_id: ownerId , body: 'Hello — is this still available?'},
    });
    assert.equal(response.status, 401);
  });

  test('invalid identifiers and missing resources are rejected', async () => {
    const token = tokenFor(renterId, 'renter@mycentennialcollege.ca');

    assert.equal(
      (
        await api(baseUrl, 'POST', '/api/conversations', {
          token,
          body: { recipient_id: ownerId, body: 'Hello — is this still available?' },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api(baseUrl, 'POST', '/api/conversations', {
          token,
          body: { listing_id: listingId, recipient_id: 999999 , body: 'Hello — is this still available?'},
        })
      ).status,
      404
    );
    assert.equal(
      (
        await api(baseUrl, 'POST', '/api/conversations', {
          token,
          body: { listing_id: 999999, recipient_id: ownerId , body: 'Hello — is this still available?'},
        })
      ).status,
      404
    );
  });
});
