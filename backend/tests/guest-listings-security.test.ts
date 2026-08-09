/**
 * US-01.4 — guest preview allow-list + registered-action / full-detail denial.
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
import {
  GUEST_LISTING_PREVIEW_FIELDS,
  guestPreviewContainsHiddenField,
  guestPreviewKeysMatchAllowList,
  toGuestListingPreview,
} from '../src/utils/guestListingPreview';

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;

let server: Server;
let baseUrl: string;

async function createStudent(email: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'security-password-hash-secret',
    first_name: 'Secure',
    last_name: 'Owner',
    phone: '416-555-0191',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  return id;
}

before(async () => {
  const uri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  ({ Listing } = await import('../src/models/Listing'));
  await connectDatabase(uri);

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-01.4 guest preview allow-list security', () => {
  test('guest response keys are exactly the approved preview allow-list', async () => {
    const ownerId = await createStudent('allowlist@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Security Camera',
      category: 'Electronics',
      description: 'UNIQUE_HIDDEN_DESCRIPTION_PHRASE_191',
      rental_terms: 'UNIQUE_HIDDEN_RENTAL_TERMS_191',
      availability: 'available',
      images: [{ id: 1, filename: 'secure-cam.jpg' }],
    });

    const response = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(response.status, 200);
    assert.equal(response.data.listings.length, 1);

    const preview = response.data.listings[0];
    assert.deepEqual(Object.keys(preview).sort(), [
      'availability',
      'category',
      'id',
      'thumbnail_url',
      'title',
    ]);
    assert.deepEqual(Object.keys(preview).sort(), [
      ...GUEST_LISTING_PREVIEW_FIELDS,
    ].sort());
    assert.equal(guestPreviewKeysMatchAllowList(preview), true);
    assert.equal(guestPreviewContainsHiddenField(preview), false);

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('UNIQUE_HIDDEN_DESCRIPTION_PHRASE_191'), false);
    assert.equal(payload.includes('UNIQUE_HIDDEN_RENTAL_TERMS_191'), false);
    assert.equal(payload.includes('allowlist@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0191'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('password_hash'), false);
    assert.equal(payload.includes('created_at'), false);
    assert.equal(payload.includes('updated_at'), false);
    assert.equal(payload.includes('"images"'), false);
  });

  test('serializer never copies extra keys from a rich listing document', async () => {
    const ownerId = await createStudent('rich-doc@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    const listing = await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Rich Doc Listing',
      category: 'Tools',
      description: 'Must stay server-side only.',
      rental_terms: 'Must stay server-side only.',
      availability: 'unavailable',
      images: [{ id: 1, filename: 'tool.png' }],
    });

    const preview = toGuestListingPreview(listing);
    assert.equal(guestPreviewKeysMatchAllowList(preview), true);
    assert.equal('owner_id' in preview, false);
    assert.equal('description' in preview, false);
    assert.equal(preview.thumbnail_url, '/uploads/tool.png');
    assert.equal(preview.availability, 'unavailable');
  });

  test('keyword match on description does not reveal description text in the response', async () => {
    const ownerId = await createStudent('snippet@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Neutral Title',
      category: 'Other',
      description: 'SECRET_MATCH_TOKEN_FOR_SEARCH_ONLY',
      rental_terms: '',
      availability: 'available',
      images: [],
    });

    const response = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=SECRET_MATCH_TOKEN_FOR_SEARCH_ONLY'
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.listings.length, 1);
    assert.equal(response.data.listings[0].title, 'Neutral Title');
    assert.equal(
      JSON.stringify(response.data).includes('SECRET_MATCH_TOKEN_FOR_SEARCH_ONLY'),
      false
    );
  });
});

describe('US-01.4 registered APIs and full details stay protected', () => {
  test('unauthenticated guests are denied registered listing/rental/messaging/profile APIs', async () => {
    const ownerId = await createStudent('protected@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Protected Listing',
      category: 'Electronics',
      description: 'Full details stay private.',
      rental_terms: 'Contact owner after registration.',
      availability: 'available',
      images: [],
    });

    const cases: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/listings' },
      { method: 'GET', path: `/api/listings/${listingId}` },
      { method: 'POST', path: '/api/listings', body: { title: 'Nope' } },
      {
        method: 'POST',
        path: '/api/requests',
        body: {
          listing_id: listingId,
          start_date: '2026-09-01',
          end_date: '2026-09-03',
        },
      },
      { method: 'GET', path: '/api/conversations' },
      {
        method: 'POST',
        path: '/api/conversations',
        body: { listing_id: listingId, recipient_id: ownerId },
      },
      { method: 'GET', path: '/api/profile' },
      { method: 'GET', path: '/api/admin/activity' },
    ];

    for (const item of cases) {
      const response = await api(baseUrl, item.method, item.path, {
        body: item.body,
      });
      assert.equal(response.status, 401, `${item.method} ${item.path}`);
      const payload = JSON.stringify(response.data ?? {});
      assert.equal(payload.includes('Full details stay private.'), false);
      assert.equal(payload.includes('Contact owner after registration.'), false);
      assert.equal(payload.includes('protected@mycentennialcollege.ca'), false);
    }

    // Guest preview endpoint remains public.
    const guest = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(guest.status, 200);
    assert.equal(guest.data.listings.length, 1);
    assert.equal(guestPreviewKeysMatchAllowList(guest.data.listings[0]), true);
  });
});
