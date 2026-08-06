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
let disconnectDatabase: () => Promise<void>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;

let mongoUri: string;
let ownerId: number;

async function createOwner() {
  ownerId = await nextId('users');
  await User.create({
    _id: ownerId,
    email: 'owner@mycentennialcollege.ca',
    password_hash: 'test-hash',
    first_name: 'Owner',
    last_name: 'Student',
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
}

async function withFreshServer(
  run: (baseUrl: string) => Promise<void>
) {
  await disconnectDatabase();
  await connectDatabase(mongoUri);
  const app = createApp();
  const { server, baseUrl } = await listenApp(app);
  try {
    await run(baseUrl);
  } finally {
    await closeServer(server);
  }
}

before(async () => {
  mongoUri = await startTestDatabase();
  ({ connectDatabase, disconnectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  ({ Listing } = await import('../src/models/Listing'));
  await connectDatabase(mongoUri);
});

beforeEach(async () => {
  await clearDatabase();
  await createOwner();
});

after(async () => {
  await stopTestDatabase();
});

describe('listing persistence across server instances', () => {
  test('created listing is retrievable through a later request', async () => {
    const token = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    let listingId = 0;

    await withFreshServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        body: {
          title: 'Persistent Microscope',
          category: 'Lab Equipment',
          description: 'Must survive restarts',
          rental_terms: 'Campus pickup',
          availability: 'available',
        },
      });
      assert.equal(created.status, 201);
      listingId = created.data.id;
      assert.ok(listingId > 0);
    });

    await withFreshServer(async (baseUrl) => {
      const fetched = await api(baseUrl, 'GET', `/api/listings/${listingId}`, { token });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.data.id, listingId);
      assert.equal(fetched.data.title, 'Persistent Microscope');
    });
  });

  test('data is retrieved from the database after rebuilding the app/server instance', async () => {
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Rebuild Check Listing',
      category: 'Tools',
      description: 'Inserted before a new server instance',
      rental_terms: '',
      availability: 'available',
      images: [],
    });

    await withFreshServer(async (baseUrl) => {
      const token = signToken({
        id: ownerId,
        email: 'owner@mycentennialcollege.ca',
        role: 'student',
      });
      const fetched = await api(baseUrl, 'GET', `/api/listings/${listingId}`, { token });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.data.title, 'Rebuild Check Listing');

      const mine = await api(baseUrl, 'GET', '/api/listings/mine', { token });
      assert.equal(mine.status, 200);
      assert.ok(mine.data.some((item: { id: number }) => item.id === listingId));
    });
  });

  test('updating a listing remains visible after a new server instance', async () => {
    const token = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    let listingId = 0;

    await withFreshServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        body: {
          title: 'Original Title',
          category: 'Electronics',
          description: 'Original description',
          rental_terms: 'Original terms',
          availability: 'available',
        },
      });
      listingId = created.data.id;

      const updated = await api(baseUrl, 'PUT', `/api/listings/${listingId}`, {
        token,
        body: {
          title: 'Updated Title',
          category: 'Electronics',
          description: 'Updated description',
          rental_terms: 'Updated terms',
        },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.data.title, 'Updated Title');
    });

    await withFreshServer(async (baseUrl) => {
      const fetched = await api(baseUrl, 'GET', `/api/listings/${listingId}`, { token });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.data.title, 'Updated Title');
      assert.equal(fetched.data.description, 'Updated description');
      assert.equal(fetched.data.rental_terms, 'Updated terms');
    });
  });

  test('deleting a listing remains deleted after a new server instance', async () => {
    const token = signToken({ id: ownerId, email: 'owner@mycentennialcollege.ca', role: 'student' });
    let listingId = 0;

    await withFreshServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        body: {
          title: 'Temporary Listing',
          category: 'Other',
          description: 'Will be deleted',
          rental_terms: '',
          availability: 'available',
        },
      });
      listingId = created.data.id;

      const deleted = await api(baseUrl, 'DELETE', `/api/listings/${listingId}`, { token });
      assert.equal(deleted.status, 200);
    });

    await withFreshServer(async (baseUrl) => {
      const fetched = await api(baseUrl, 'GET', `/api/listings/${listingId}`, { token });
      assert.equal(fetched.status, 404);
      assert.equal(fetched.data.error, 'Listing not found');
    });
  });
});
