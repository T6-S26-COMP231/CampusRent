/**
 * US-02.4 — guest item-details allow-list + unavailable-status security.
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
  normalizeGuestItemDetailsAvailability,
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
    password_hash: 'us02-security-password-hash-secret',
    first_name: 'Secure',
    last_name: 'Owner',
    phone: '416-555-0299',
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

describe('US-02.4 guest item-details privacy allow-list', () => {
  test('guest response keys are exactly the approved details allow-list', async () => {
    const ownerId = await createStudent('allowlist@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Security Camera',
      category: 'Electronics',
      description: 'US02_SECURITY_DESCRIPTION_VISIBLE',
      rental_terms: 'US02_SECURITY_RENTAL_TERMS_HIDDEN',
      availability: 'available',
      images: [{ id: 1, filename: 'secure-cam.jpg' }],
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
    assert.deepEqual(Object.keys(details).sort(), [
      ...GUEST_ITEM_DETAILS_FIELDS,
    ].sort());
    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
    assert.equal(guestItemDetailsContainsHiddenField(details), false);
    assert.equal(details.description, 'US02_SECURITY_DESCRIPTION_VISIBLE');
    assert.equal(details.availability, 'available');

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('US02_SECURITY_RENTAL_TERMS_HIDDEN'), false);
    assert.equal(payload.includes('allowlist@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0299'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('"owner"'), false);
    assert.equal(payload.includes('first_name'), false);
    assert.equal(payload.includes('last_name'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('"images"'), false);
    assert.equal(payload.includes('secure-cam.jpg'), false);
    assert.equal(payload.includes('created_at'), false);
    assert.equal(payload.includes('updated_at'), false);
    assert.equal(payload.includes('us02-security-password-hash-secret'), false);
    assert.equal(payload.includes('"first_name"'), false);
    assert.equal(payload.includes('"last_name"'), false);
  });

  test('serializer never copies owner/contact/private keys from a rich listing document', async () => {
    const ownerId = await createStudent('rich-doc@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    const listing = await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Rich Doc Listing',
      category: 'Tools',
      description: 'Visible description only.',
      rental_terms: 'Must stay server-side only.',
      availability: 'unavailable',
      images: [{ id: 1, filename: 'tool.png' }],
    });

    const details = toGuestItemDetails(listing);
    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
    assert.equal('owner_id' in details, false);
    assert.equal('rental_terms' in details, false);
    assert.equal('images' in details, false);
    assert.equal(details.availability, 'unavailable');
    assert.equal(
      guestItemDetailsRemainsViewableWhenUnavailable(details.availability),
      true
    );
    assert.equal(normalizeGuestItemDetailsAvailability('available'), 'available');
    assert.equal(normalizeGuestItemDetailsAvailability('unavailable'), 'unavailable');
    assert.equal(normalizeGuestItemDetailsAvailability('Available'), null);
  });
});

describe('US-02.4 unavailable status and safe errors', () => {
  test('unavailable listing remains 200 with basic details and unavailable status', async () => {
    const ownerId = await createStudent('unavailable@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Unavailable Microscope',
      category: 'Lab Equipment',
      description: 'Still visible while unavailable.',
      rental_terms: 'HIDDEN_WHEN_UNAVAILABLE',
      availability: 'unavailable',
      images: [],
    });

    const response = await api(
      baseUrl,
      'GET',
      `/api/guest/listings/${listingId}`
    );
    assert.equal(response.status, 200);
    assert.notEqual(response.status, 404);
    assert.equal(response.data.listing.title, 'Unavailable Microscope');
    assert.equal(response.data.listing.category, 'Lab Equipment');
    assert.equal(
      response.data.listing.description,
      'Still visible while unavailable.'
    );
    assert.equal(response.data.listing.availability, 'unavailable');
    assert.notEqual(response.data.listing.availability, 'available');
    assert.equal(
      JSON.stringify(response.data).includes('HIDDEN_WHEN_UNAVAILABLE'),
      false
    );
  });

  test('invalid-id and not-found errors stay safe; registered details remain protected', async () => {
    const ownerId = await createStudent('error-owner@mycentennialcollege.ca');
    const listingId = await nextId('listings');
    await Listing.create({
      _id: listingId,
      owner_id: ownerId,
      title: 'Protected Listing',
      category: 'Electronics',
      description: 'US02_ERROR_LEAK_DESCRIPTION',
      rental_terms: 'US02_ERROR_LEAK_RENTAL_TERMS',
      availability: 'available',
      images: [{ id: 1, filename: 'leak.jpg' }],
    });

    const missing = await api(baseUrl, 'GET', '/api/guest/listings/999999');
    assert.equal(missing.status, 404);
    const missingPayload = JSON.stringify(missing.data ?? {});
    assert.equal(missingPayload.includes('US02_ERROR_LEAK_DESCRIPTION'), false);
    assert.equal(missingPayload.includes('US02_ERROR_LEAK_RENTAL_TERMS'), false);
    assert.equal(missingPayload.includes('error-owner@mycentennialcollege.ca'), false);
    assert.equal(missingPayload.includes('CastError'), false);
    assert.equal(missingPayload.includes('stack'), false);

    const invalid = await api(baseUrl, 'GET', '/api/guest/listings/abc');
    assert.equal(invalid.status, 400);
    const invalidPayload = JSON.stringify(invalid.data ?? {});
    assert.equal(invalidPayload.includes('US02_ERROR_LEAK_DESCRIPTION'), false);
    assert.equal(invalidPayload.includes('Mongo'), false);
    assert.equal(invalidPayload.includes('stack'), false);

    const unauth = await api(baseUrl, 'GET', `/api/listings/${listingId}`);
    assert.equal(unauth.status, 401);

    const token = signToken({
      id: ownerId,
      email: 'error-owner@mycentennialcollege.ca',
      role: 'student',
    });
    const registered = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token,
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.rental_terms, 'US02_ERROR_LEAK_RENTAL_TERMS');
    assert.ok(registered.data.owner);
  });
});
