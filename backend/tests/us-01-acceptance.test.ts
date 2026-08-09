/**
 * US-01.6 — Team6 TAC acceptance mapping for guest limited listing previews.
 *
 * TAC Test 1 — Browse limited listing previews → limited info without owner contact
 * TAC Test 2 — Search using a keyword → matching limited previews returned
 * TAC Test 3 — Apply category filters → filtered limited previews displayed
 * TAC Test 4 — Attempt restricted action → registration prompt (frontend) /
 *              direct registered API access denied (backend)
 *
 * Broader low-level coverage remains in guest-listings-api.test.ts and
 * guest-listings-security.test.ts. This suite stays acceptance-focused.
 *
 * Do NOT claim production Overall Result: PASSED — US-01.7 (#194) owns
 * merge/deploy/manual acceptance.
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
} from '../src/utils/guestListingPreview';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_01_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-01.7' as const;
export const US_01_PRODUCTION_ACCEPTANCE_REASON =
  'US-01.7 (#194) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

const APPROVED_KEYS = [
  'availability',
  'category',
  'id',
  'thumbnail_url',
  'title',
] as const;

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;

let server: Server;
let baseUrl: string;

async function createStudent(
  email: string,
  options: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'us01-acceptance-password-hash-secret',
    first_name: options.first_name ?? 'Accept',
    last_name: options.last_name ?? 'Owner',
    phone: options.phone ?? '416-555-0101',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  return id;
}

async function createListing(
  ownerId: number,
  options: {
    title?: string;
    category?: string;
    description?: string;
    rental_terms?: string;
    availability?: 'available' | 'unavailable';
    images?: Array<{ id: number; filename: string }>;
  } = {}
) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: ownerId,
    title: options.title ?? `US-01 acceptance listing ${id}`,
    category: options.category ?? 'Electronics',
    description:
      options.description ?? 'US01_ACCEPT_PRIVATE_DESCRIPTION_MUST_NOT_LEAK',
    rental_terms:
      options.rental_terms ?? 'US01_ACCEPT_PRIVATE_RENTAL_TERMS_MUST_NOT_LEAK',
    availability: options.availability ?? 'available',
    images: options.images ?? [],
  });
  return id;
}

function assertGuestPreviewShape(preview: Record<string, unknown>) {
  assert.deepEqual(Object.keys(preview).sort(), [...APPROVED_KEYS]);
  assert.deepEqual(Object.keys(preview).sort(), [
    ...GUEST_LISTING_PREVIEW_FIELDS,
  ].sort());
  assert.equal(guestPreviewKeysMatchAllowList(preview), true);
  assert.equal(guestPreviewContainsHiddenField(preview), false);
  assert.equal('description' in preview, false);
  assert.equal('rental_terms' in preview, false);
  assert.equal('owner' in preview, false);
  assert.equal('owner_id' in preview, false);
  assert.equal('email' in preview, false);
  assert.equal('phone' in preview, false);
  assert.equal('contact_hidden' in preview, false);
  assert.equal('created_at' in preview, false);
  assert.equal('updated_at' in preview, false);
}

before(async () => {
  const uri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
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

describe('US-01 TAC backend acceptance', () => {
  test('TAC Test 1 — Browse limited listing previews without owner contact', async () => {
    const ownerId = await createStudent('browse-owner@mycentennialcollege.ca', {
      first_name: 'Pat',
      last_name: 'Owner',
      phone: '416-555-0193',
    });

    await createListing(ownerId, {
      title: 'Acceptance Camera',
      category: 'Electronics',
      description: 'US01_BROWSE_HIDDEN_DESCRIPTION_PHRASE',
      rental_terms: 'US01_BROWSE_HIDDEN_RENTAL_TERMS_PHRASE',
      availability: 'available',
      images: [
        { id: 1, filename: 'accept-cam.jpg' },
        { id: 2, filename: 'accept-cam-2.jpg' },
      ],
    });
    await createListing(ownerId, {
      title: 'Acceptance Tripod',
      category: 'Tools',
      description: 'US01_BROWSE_HIDDEN_DESCRIPTION_PHRASE',
      rental_terms: 'US01_BROWSE_HIDDEN_RENTAL_TERMS_PHRASE',
      availability: 'unavailable',
      images: [],
    });

    const response = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(response.status, 200);
    assert.equal(response.data.listings.length, 2);

    for (const preview of response.data.listings) {
      assertGuestPreviewShape(preview);
    }

    const withThumb = response.data.listings.find(
      (row: { title: string }) => row.title === 'Acceptance Camera'
    );
    const withoutThumb = response.data.listings.find(
      (row: { title: string }) => row.title === 'Acceptance Tripod'
    );
    assert.equal(withThumb.thumbnail_url, '/uploads/accept-cam.jpg');
    assert.equal(withThumb.availability, 'available');
    assert.equal(withThumb.category, 'Electronics');
    assert.equal(withoutThumb.thumbnail_url, null);
    assert.equal(withoutThumb.availability, 'unavailable');

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('US01_BROWSE_HIDDEN_DESCRIPTION_PHRASE'), false);
    assert.equal(payload.includes('US01_BROWSE_HIDDEN_RENTAL_TERMS_PHRASE'), false);
    assert.equal(payload.includes('browse-owner@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0193'), false);
    assert.equal(payload.includes('Pat'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('us01-acceptance-password-hash-secret'), false);
    assert.equal(payload.includes('created_at'), false);
    assert.equal(payload.includes('"images"'), false);

    assert.equal(US_01_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-01.7');
  });

  test('TAC Test 2 — Search using a keyword returns matching limited previews', async () => {
    const ownerId = await createStudent('search-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'Keyword Title Camera',
      category: 'Electronics',
      description: 'Ordinary optics accessory.',
    });
    await createListing(ownerId, {
      title: 'Neutral Sports Gear',
      category: 'Sports & Recreation',
      description: 'Contains UNIQUE_ACCEPT_KEYWORD_TOKEN_ONLY_IN_DESCRIPTION',
    });
    await createListing(ownerId, {
      title: 'Unrelated Desk Lamp',
      category: 'Furniture',
      description: 'Bedroom lighting only.',
    });

    const byTitle = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=%20camera%20'
    );
    assert.equal(byTitle.status, 200);
    assert.equal(byTitle.data.listings.length, 1);
    assert.equal(byTitle.data.listings[0].title, 'Keyword Title Camera');
    assertGuestPreviewShape(byTitle.data.listings[0]);

    const byDescription = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=UNIQUE_ACCEPT_KEYWORD_TOKEN_ONLY_IN_DESCRIPTION'
    );
    assert.equal(byDescription.status, 200);
    assert.equal(byDescription.data.listings.length, 1);
    assert.equal(byDescription.data.listings[0].title, 'Neutral Sports Gear');
    assertGuestPreviewShape(byDescription.data.listings[0]);
    assert.equal(
      JSON.stringify(byDescription.data).includes(
        'UNIQUE_ACCEPT_KEYWORD_TOKEN_ONLY_IN_DESCRIPTION'
      ),
      false
    );

    const none = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=no-such-guest-keyword-xyz'
    );
    assert.equal(none.status, 200);
    assert.deepEqual(none.data.listings, []);

    const blank = await api(baseUrl, 'GET', '/api/guest/listings?q=%20%20');
    assert.equal(blank.status, 200);
    assert.equal(blank.data.listings.length, 3);
  });

  test('TAC Test 3 — Apply category filters returns filtered limited previews', async () => {
    const ownerId = await createStudent('category-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'Category Electronics Item',
      category: 'Electronics',
      description: 'US01_CATEGORY_HIDDEN_DESCRIPTION',
    });
    await createListing(ownerId, {
      title: 'Category Textbook Item',
      category: 'Textbooks',
      description: 'US01_CATEGORY_HIDDEN_DESCRIPTION',
    });
    await createListing(ownerId, {
      title: 'Category Lab Microscope',
      category: 'Lab Equipment',
      description: 'Precision optics for acceptance.',
    });

    const electronics = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?category=Electronics'
    );
    assert.equal(electronics.status, 200);
    assert.equal(electronics.data.listings.length, 1);
    assert.equal(electronics.data.listings[0].title, 'Category Electronics Item');
    assertGuestPreviewShape(electronics.data.listings[0]);

    const textbooks = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?category=Textbooks'
    );
    assert.equal(textbooks.status, 200);
    assert.equal(textbooks.data.listings.length, 1);
    assert.equal(textbooks.data.listings[0].title, 'Category Textbook Item');

    const all = await api(baseUrl, 'GET', '/api/guest/listings?category=all');
    assert.equal(all.status, 200);
    assert.equal(all.data.listings.length, 3);

    const blank = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(blank.status, 200);
    assert.equal(blank.data.listings.length, 3);

    const invalid = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?category=Spaceships'
    );
    assert.equal(invalid.status, 400);
    assert.match(String(invalid.data.error), /Invalid category/i);
    assert.equal(
      JSON.stringify(invalid.data).includes('US01_CATEGORY_HIDDEN_DESCRIPTION'),
      false
    );

    const combined = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=microscope&category=Lab%20Equipment'
    );
    assert.equal(combined.status, 200);
    assert.equal(combined.data.listings.length, 1);
    assert.equal(combined.data.listings[0].title, 'Category Lab Microscope');
    assertGuestPreviewShape(combined.data.listings[0]);
  });

  test('TAC Test 4 (backend) — direct registered APIs remain denied to guests', async () => {
    const ownerId = await createStudent('deny-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Protected Acceptance Listing',
      description: 'US01_PROTECTED_FULL_DETAILS_MUST_STAY_PRIVATE',
      rental_terms: 'US01_PROTECTED_RENTAL_TERMS_MUST_STAY_PRIVATE',
    });

    const cases: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/listings' },
      { method: 'GET', path: `/api/listings/${listingId}` },
      {
        method: 'POST',
        path: '/api/listings',
        body: {
          title: 'Guest create attempt',
          category: 'Electronics',
          description: 'Should fail',
          rental_terms: '',
          availability: 'available',
        },
      },
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
    ];

    for (const item of cases) {
      const response = await api(baseUrl, item.method, item.path, {
        body: item.body,
      });
      assert.equal(response.status, 401, `${item.method} ${item.path}`);
      const payload = JSON.stringify(response.data ?? {});
      assert.equal(
        payload.includes('US01_PROTECTED_FULL_DETAILS_MUST_STAY_PRIVATE'),
        false
      );
      assert.equal(
        payload.includes('US01_PROTECTED_RENTAL_TERMS_MUST_STAY_PRIVATE'),
        false
      );
      assert.equal(payload.includes('deny-owner@mycentennialcollege.ca'), false);
    }

    // Guest preview endpoint remains public; full details stay protected.
    const guest = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(guest.status, 200);
    assert.equal(guest.data.listings.length, 1);
    assertGuestPreviewShape(guest.data.listings[0]);

    const verifiedToken = signToken({
      id: ownerId,
      email: 'deny-owner@mycentennialcollege.ca',
      role: 'student',
    });
    const registered = await api(baseUrl, 'GET', '/api/listings', {
      token: verifiedToken,
    });
    assert.equal(registered.status, 200);
    assert.ok(Array.isArray(registered.data.listings));

    const detail = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token: verifiedToken,
    });
    assert.equal(detail.status, 200);
    assert.equal(
      detail.data.description,
      'US01_PROTECTED_FULL_DETAILS_MUST_STAY_PRIVATE'
    );

    assert.equal(US_01_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-01.7');
    assert.match(US_01_PRODUCTION_ACCEPTANCE_REASON, /US-01\.7/);
    assert.match(US_01_PRODUCTION_ACCEPTANCE_REASON, /#194/);
  });
});
