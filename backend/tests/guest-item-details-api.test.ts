/**
 * US-02.3 — GET /api/guest/listings/:id public basic item-details API.
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
  GUEST_ITEM_DETAILS_HIDDEN_FIELDS,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  toGuestItemDetails,
} from '../src/utils/guestItemDetails';

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
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
    password_hash: 'guest-details-password-hash-secret',
    first_name: 'Pat',
    last_name: 'Owner',
    phone: '416-555-0198',
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
    title: options.title ?? `Guest details listing ${id}`,
    category: options.category ?? 'Electronics',
    description:
      options.description ?? 'Public guest description for US-02 details.',
    rental_terms:
      options.rental_terms ?? 'PRIVATE_RENTAL_TERMS_MUST_NOT_LEAK',
    availability: options.availability ?? 'available',
    images: options.images ?? [{ id: 1, filename: 'private-image.jpg' }],
  });
  return id;
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

describe('US-02.3 GET /api/guest/listings/:id', () => {
  test('public access returns allow-listed basic details without owner/contact', async () => {
    const ownerId = await createStudent('details-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Campus Camera',
      category: 'Electronics',
      description: 'DSL kit for student media projects.',
      rental_terms: 'PRIVATE_RENTAL_TERMS_MUST_NOT_LEAK',
      availability: 'available',
      images: [
        { id: 1, filename: 'cam-one.jpg' },
        { id: 2, filename: 'cam-two.jpg' },
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
    assert.deepEqual(Object.keys(details).sort(), [
      'availability',
      'category',
      'description',
      'id',
      'title',
    ]);
    assert.deepEqual(Object.keys(details).sort(), [
      ...GUEST_ITEM_DETAILS_FIELDS,
    ].sort());
    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
    assert.equal(guestItemDetailsContainsHiddenField(details), false);
    assert.equal(guestItemDetailsContainsHiddenField(response.data), false);

    assert.equal(details.id, listingId);
    assert.equal(details.title, 'Campus Camera');
    assert.equal(details.category, 'Electronics');
    assert.equal(details.description, 'DSL kit for student media projects.');
    assert.equal(details.availability, 'available');

    for (const field of GUEST_ITEM_DETAILS_HIDDEN_FIELDS) {
      assert.equal(field in details, false, field);
    }

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('PRIVATE_RENTAL_TERMS_MUST_NOT_LEAK'), false);
    assert.equal(payload.includes('details-owner@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0198'), false);
    assert.equal(payload.includes('"owner"'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('first_name'), false);
    assert.equal(payload.includes('last_name'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('"images"'), false);
    assert.equal(payload.includes('cam-one.jpg'), false);
    assert.equal(payload.includes('created_at'), false);
    assert.equal(payload.includes('updated_at'), false);
    assert.equal(payload.includes('guest-details-password-hash-secret'), false);
    assert.equal(payload.includes('Pat'), false);
    assert.equal(payload.includes('Owner'), false);
  });

  test('unavailable listing still returns 200 with basic details and unavailable status', async () => {
    const ownerId = await createStudent('unavailable-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Lab Microscope',
      category: 'Lab Equipment',
      description: 'Currently checked out for the term.',
      availability: 'unavailable',
    });

    const response = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.listing.title, 'Lab Microscope');
    assert.equal(response.data.listing.category, 'Lab Equipment');
    assert.equal(
      response.data.listing.description,
      'Currently checked out for the term.'
    );
    assert.equal(response.data.listing.availability, 'unavailable');
    assert.equal(guestItemDetailsKeysMatchAllowList(response.data.listing), true);
  });

  test('not-found and invalid ids are handled safely; list route still works', async () => {
    const missing = await api(baseUrl, 'GET', '/api/guest/listings/999999');
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, 'Listing not found');
    assert.equal(
      JSON.stringify(missing.data).includes('password_hash'),
      false
    );

    const invalid = await api(baseUrl, 'GET', '/api/guest/listings/not-an-id');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error, 'Invalid listing id');
    assert.equal(JSON.stringify(invalid.data).includes('CastError'), false);
    assert.equal(JSON.stringify(invalid.data).includes('stack'), false);

    const zero = await api(baseUrl, 'GET', '/api/guest/listings/0');
    assert.equal(zero.status, 400);
    assert.equal(zero.data.error, 'Invalid listing id');

    const ownerId = await createStudent('list-still-works@mycentennialcollege.ca');
    await createListing(ownerId, { title: 'Still Listed' });
    const list = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(list.status, 200);
    assert.equal(list.data.listings.length, 1);
    assert.equal(list.data.listings[0].title, 'Still Listed');
    assert.equal('description' in list.data.listings[0], false);
  });

  test('registered GET /api/listings/:id remains protected and unchanged for verified students', async () => {
    const ownerId = await createStudent('registered-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Protected Full Details',
      description: 'US10_FULL_DESCRIPTION_FOR_VERIFIED_STUDENTS',
      rental_terms: 'US10_RENTAL_TERMS_FOR_VERIFIED_STUDENTS',
      availability: 'available',
    });

    const unauth = await api(baseUrl, 'GET', `/api/listings/${listingId}`);
    assert.equal(unauth.status, 401);
    assert.equal(
      JSON.stringify(unauth.data ?? {}).includes(
        'US10_FULL_DESCRIPTION_FOR_VERIFIED_STUDENTS'
      ),
      false
    );

    const token = signToken({
      id: ownerId,
      email: 'registered-owner@mycentennialcollege.ca',
      role: 'student',
    });
    const registered = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token,
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.title, 'Protected Full Details');
    assert.equal(
      registered.data.description,
      'US10_FULL_DESCRIPTION_FOR_VERIFIED_STUDENTS'
    );
    assert.equal(
      registered.data.rental_terms,
      'US10_RENTAL_TERMS_FOR_VERIFIED_STUDENTS'
    );
    assert.ok(registered.data.owner);
    assert.equal(registered.data.owner.email, 'registered-owner@mycentennialcollege.ca');
    assert.equal(registered.data.owner.phone, '416-555-0198');

    const guest = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(guest.status, 200);
    assert.equal(guest.data.listing.description, 'US10_FULL_DESCRIPTION_FOR_VERIFIED_STUDENTS');
    assert.equal('rental_terms' in guest.data.listing, false);
    assert.equal('owner' in guest.data.listing, false);
  });

  test('serializer constructs allow-list only and does not mutate listings', async () => {
    const ownerId = await createStudent('serializer-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Serializer Sample',
      description: 'Basic description text.',
      rental_terms: 'Must stay on document.',
      availability: 'unavailable',
    });

    const listing = await Listing.findById(listingId);
    assert.ok(listing);
    const beforeTerms = listing!.rental_terms;
    const serialized = toGuestItemDetails(listing!);
    assert.equal(guestItemDetailsKeysMatchAllowList(serialized), true);
    assert.equal(serialized.availability, 'unavailable');
    assert.equal('rental_terms' in serialized, false);
    assert.equal('owner_id' in serialized, false);

    const after = await Listing.findById(listingId);
    assert.equal(after!.rental_terms, beforeTerms);
    assert.equal(after!.title, 'Serializer Sample');
  });
});
