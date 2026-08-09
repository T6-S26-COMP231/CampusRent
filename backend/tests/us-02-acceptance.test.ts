/**
 * US-02.6 — Team6 TAC acceptance mapping for guest basic item details.
 *
 * TAC Test 1 — Open item details page → Basic item information displayed
 * TAC Test 2 — View listing as guest → Owner contact information hidden
 * TAC Test 3 — Attempt rental request → Registration prompt (frontend) /
 *              direct rental APIs denied (backend)
 * TAC Test 4 — View unavailable item → Availability status displayed
 *
 * Broader low-level coverage remains in guest-item-details-api.test.ts and
 * guest-item-details-security.test.ts. This suite stays acceptance-focused.
 *
 * Do NOT claim production Overall Result: PASSED — US-02.7 (#202) owns
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
  GUEST_ITEM_DETAILS_FIELDS,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsRemainsViewableWhenUnavailable,
} from '../src/utils/guestItemDetails';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_02_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-02.7' as const;
export const US_02_PRODUCTION_ACCEPTANCE_REASON =
  'US-02.7 (#202) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

const APPROVED_KEYS = [
  'availability',
  'category',
  'description',
  'id',
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
    password_hash: 'us02-acceptance-password-hash-secret',
    first_name: options.first_name ?? 'Accept',
    last_name: options.last_name ?? 'Owner',
    phone: options.phone ?? '416-555-0202',
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
    title: options.title ?? `US-02 acceptance listing ${id}`,
    category: options.category ?? 'Electronics',
    description:
      options.description ?? 'US02_ACCEPT_BASIC_DESCRIPTION_VISIBLE',
    rental_terms:
      options.rental_terms ?? 'US02_ACCEPT_PRIVATE_RENTAL_TERMS_HIDDEN',
    availability: options.availability ?? 'available',
    images: options.images ?? [{ id: 1, filename: 'accept-private.jpg' }],
  });
  return id;
}

function assertGuestDetailsShape(details: Record<string, unknown>) {
  assert.deepEqual(Object.keys(details).sort(), [...APPROVED_KEYS]);
  assert.deepEqual(Object.keys(details).sort(), [
    ...GUEST_ITEM_DETAILS_FIELDS,
  ].sort());
  assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
  assert.equal(guestItemDetailsContainsHiddenField(details), false);
  assert.equal('owner' in details, false);
  assert.equal('owner_id' in details, false);
  assert.equal('email' in details, false);
  assert.equal('phone' in details, false);
  assert.equal('rental_terms' in details, false);
  assert.equal('contact_hidden' in details, false);
  assert.equal('images' in details, false);
  assert.equal('created_at' in details, false);
  assert.equal('updated_at' in details, false);
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

describe('US-02 TAC backend acceptance', () => {
  test('TAC Test 1 — Open item details page: basic item information displayed', async () => {
    const ownerId = await createStudent('open-details@mycentennialcollege.ca', {
      first_name: 'Pat',
      last_name: 'Owner',
      phone: '416-555-0211',
    });
    const listingId = await createListing(ownerId, {
      title: 'Acceptance Campus Camera',
      category: 'Electronics',
      description: 'DSL kit for guest basic details acceptance.',
      availability: 'available',
      images: [
        { id: 1, filename: 'accept-cam.jpg' },
        { id: 2, filename: 'accept-cam-2.jpg' },
      ],
    });

    const response = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(response.status, 200);
    assert.ok(response.data.listing);

    const details = response.data.listing;
    assertGuestDetailsShape(details);
    assert.equal(details.id, listingId);
    assert.equal(details.title, 'Acceptance Campus Camera');
    assert.equal(details.category, 'Electronics');
    assert.equal(
      details.description,
      'DSL kit for guest basic details acceptance.'
    );
    assert.equal(details.availability, 'available');

    assert.equal(US_02_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-02.7');
  });

  test('TAC Test 2 — View listing as guest: owner contact information hidden', async () => {
    const ownerId = await createStudent('privacy@mycentennialcollege.ca', {
      first_name: 'Hidden',
      last_name: 'Contact',
      phone: '416-555-0299',
    });
    const listingId = await createListing(ownerId, {
      title: 'Privacy Acceptance Tripod',
      category: 'Tools',
      description: 'US02_TAC2_VISIBLE_DESCRIPTION',
      rental_terms: 'US02_TAC2_HIDDEN_RENTAL_TERMS',
      availability: 'available',
      images: [{ id: 1, filename: 'tac2-private.jpg' }],
    });

    const response = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(response.status, 200);

    const details = response.data.listing;
    assert.deepEqual(Object.keys(details).sort(), [
      'availability',
      'category',
      'description',
      'id',
      'title',
    ]);
    assertGuestDetailsShape(details);
    assert.equal(details.description, 'US02_TAC2_VISIBLE_DESCRIPTION');

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('US02_TAC2_HIDDEN_RENTAL_TERMS'), false);
    assert.equal(payload.includes('privacy@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0299'), false);
    assert.equal(payload.includes('"owner"'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('first_name'), false);
    assert.equal(payload.includes('last_name'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('"images"'), false);
    assert.equal(payload.includes('tac2-private.jpg'), false);
    assert.equal(payload.includes('created_at'), false);
    assert.equal(payload.includes('updated_at'), false);
    assert.equal(payload.includes('us02-acceptance-password-hash-secret'), false);
    assert.equal(payload.includes('Hidden'), false);
    assert.equal(payload.includes('Contact'), false);
  });

  test('TAC Test 3 (backend) — direct rental/registered APIs remain denied to guests', async () => {
    const ownerId = await createStudent('rental-deny@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Protected Rental Listing',
      description: 'US02_TAC3_PROTECTED_DESCRIPTION',
      rental_terms: 'US02_TAC3_PROTECTED_RENTAL_TERMS',
    });

    const cases: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: `/api/listings/${listingId}` },
      {
        method: 'POST',
        path: '/api/requests',
        body: {
          listing_id: listingId,
          start_date: '2026-09-01',
          end_date: '2026-09-03',
        },
      },
      {
        method: 'POST',
        path: '/api/conversations',
        body: { listing_id: listingId, recipient_id: ownerId },
      },
    ];

    for (const item of cases) {
      const response = await api(baseUrl, item.method, item.path, {
        body: item.body,
      });
      assert.equal(response.status, 401, `${item.method} ${item.path}`);
      const payload = JSON.stringify(response.data ?? {});
      assert.equal(payload.includes('US02_TAC3_PROTECTED_DESCRIPTION'), false);
      assert.equal(payload.includes('US02_TAC3_PROTECTED_RENTAL_TERMS'), false);
      assert.equal(payload.includes('rental-deny@mycentennialcollege.ca'), false);
    }

    const guest = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(guest.status, 200);
    assertGuestDetailsShape(guest.data.listing);
  });

  test('TAC Test 4 — View unavailable item: availability status displayed', async () => {
    const ownerId = await createStudent('unavailable@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Unavailable Lab Microscope',
      category: 'Lab Equipment',
      description: 'Still visible while unavailable for acceptance.',
      rental_terms: 'US02_TAC4_HIDDEN_WHEN_UNAVAILABLE',
      availability: 'unavailable',
    });

    const response = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(response.status, 200);
    assert.notEqual(response.status, 404);

    const details = response.data.listing;
    assertGuestDetailsShape(details);
    assert.equal(details.title, 'Unavailable Lab Microscope');
    assert.equal(details.category, 'Lab Equipment');
    assert.equal(
      details.description,
      'Still visible while unavailable for acceptance.'
    );
    assert.equal(details.availability, 'unavailable');
    assert.notEqual(details.availability, 'available');
    assert.equal(
      guestItemDetailsRemainsViewableWhenUnavailable(details.availability),
      true
    );
    assert.equal(
      JSON.stringify(response.data).includes('US02_TAC4_HIDDEN_WHEN_UNAVAILABLE'),
      false
    );

    const missing = await api(baseUrl, 'GET', '/api/guest/listings/999999');
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, 'Listing not found');
    assert.equal(
      JSON.stringify(missing.data).includes('US02_TAC4_HIDDEN_WHEN_UNAVAILABLE'),
      false
    );

    const invalid = await api(baseUrl, 'GET', '/api/guest/listings/not-an-id');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error, 'Invalid listing id');
    assert.equal(JSON.stringify(invalid.data).includes('stack'), false);
    assert.equal(JSON.stringify(invalid.data).includes('CastError'), false);

    const token = signToken({
      id: ownerId,
      email: 'unavailable@mycentennialcollege.ca',
      role: 'student',
    });
    const registered = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token,
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.availability, 'unavailable');
    assert.equal(
      registered.data.rental_terms,
      'US02_TAC4_HIDDEN_WHEN_UNAVAILABLE'
    );
    assert.ok(registered.data.owner);

    assert.equal(US_02_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-02.7');
    assert.match(US_02_PRODUCTION_ACCEPTANCE_REASON, /US-02\.7/);
    assert.match(US_02_PRODUCTION_ACCEPTANCE_REASON, /#202/);
  });
});
