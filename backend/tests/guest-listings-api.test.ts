/**
 * US-01.3 — GET /api/guest/listings public limited preview API.
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
  GUEST_LISTING_HIDDEN_FIELDS,
  GUEST_LISTING_PREVIEW_FIELDS,
  guestPreviewContainsHiddenField,
} from '../src/utils/guestListingPreview';

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
    password_hash: 'guest-api-password-hash-secret',
    first_name: 'Owner',
    last_name: 'Student',
    phone: '416-555-0144',
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
    title: options.title ?? `Guest listing ${id}`,
    category: options.category ?? 'Electronics',
    description: options.description ?? 'Private description must not appear.',
    rental_terms: options.rental_terms ?? 'Private rental terms must not appear.',
    availability: options.availability ?? 'available',
    images: options.images ?? [],
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

describe('US-01.3 GET /api/guest/listings', () => {
  test('public access succeeds without JWT; protected listing routes remain guarded', async () => {
    const ownerId = await createStudent('owner@mycentennialcollege.ca');
    await createListing(ownerId, { title: 'Public Camera' });

    const unauth = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(unauth.status, 200);
    assert.ok(Array.isArray(unauth.data.listings));
    assert.equal(unauth.data.listings.length, 1);

    const token = signToken({
      id: ownerId,
      email: 'owner@mycentennialcollege.ca',
      role: 'student',
    });
    const authed = await api(baseUrl, 'GET', '/api/guest/listings', { token });
    assert.equal(authed.status, 200);
    assert.equal(authed.data.listings.length, 1);

    const protectedList = await api(baseUrl, 'GET', '/api/listings');
    assert.equal(protectedList.status, 401);

    const protectedDetail = await api(baseUrl, 'GET', '/api/listings/1');
    assert.equal(protectedDetail.status, 401);
  });

  test('preview shape includes approved fields only; owner/contact/description hidden', async () => {
    const ownerId = await createStudent('rich-owner@mycentennialcollege.ca');
    const listingId = await createListing(ownerId, {
      title: 'Campus Tripod',
      category: 'Electronics',
      description: 'Hidden description about a tripod.',
      rental_terms: 'Hidden rental terms.',
      availability: 'available',
      images: [{ id: 1, filename: 'tripod-one.jpg' }, { id: 2, filename: 'tripod-two.jpg' }],
    });

    const response = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(response.status, 200);
    assert.equal(response.data.listings.length, 1);

    const preview = response.data.listings[0];
    assert.deepEqual(Object.keys(preview).sort(), [...GUEST_LISTING_PREVIEW_FIELDS].sort());
    assert.equal(preview.id, listingId);
    assert.equal(preview.title, 'Campus Tripod');
    assert.equal(preview.category, 'Electronics');
    assert.equal(preview.availability, 'available');
    assert.equal(preview.thumbnail_url, '/uploads/tripod-one.jpg');

    for (const field of GUEST_LISTING_HIDDEN_FIELDS) {
      assert.equal(field in preview, false, field);
    }
    assert.equal(guestPreviewContainsHiddenField(preview), false);
    assert.equal(guestPreviewContainsHiddenField(response.data), false);

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('Hidden description'), false);
    assert.equal(payload.includes('Hidden rental terms'), false);
    assert.equal(payload.includes('rich-owner@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('416-555-0144'), false);
    assert.equal(payload.includes('password_hash'), false);
    assert.equal(payload.includes('guest-api-password-hash'), false);
    assert.equal(payload.includes('"owner"'), false);
    assert.equal(payload.includes('owner_id'), false);
    assert.equal(payload.includes('contact_hidden'), false);
    assert.equal(payload.includes('Owner'), false);
    assert.equal(payload.includes('Student'), false);
  });

  test('thumbnail is first image URL or null when listing has no images', async () => {
    const ownerId = await createStudent('thumb-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'With Image',
      images: [{ id: 1, filename: 'first.webp' }],
    });
    await createListing(ownerId, {
      title: 'No Image',
      category: 'Textbooks',
      images: [],
    });

    const response = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(response.status, 200);
    const withImage = response.data.listings.find(
      (row: { title: string }) => row.title === 'With Image'
    );
    const withoutImage = response.data.listings.find(
      (row: { title: string }) => row.title === 'No Image'
    );
    assert.equal(withImage.thumbnail_url, '/uploads/first.webp');
    assert.equal(withoutImage.thumbnail_url, null);
  });

  test('keyword search matches title or description without exposing description', async () => {
    const ownerId = await createStudent('search-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'DSL Camera Kit',
      description: 'Includes a spare battery pack.',
      category: 'Electronics',
    });
    await createListing(ownerId, {
      title: 'Soccer Ball',
      description: 'Outdoor recreation gear.',
      category: 'Sports & Recreation',
    });

    const byTitle = await api(baseUrl, 'GET', '/api/guest/listings?q=camera');
    assert.equal(byTitle.status, 200);
    assert.equal(byTitle.data.listings.length, 1);
    assert.equal(byTitle.data.listings[0].title, 'DSL Camera Kit');
    assert.equal('description' in byTitle.data.listings[0], false);
    assert.equal(JSON.stringify(byTitle.data).includes('spare battery'), false);

    const byDescription = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=battery'
    );
    assert.equal(byDescription.status, 200);
    assert.equal(byDescription.data.listings.length, 1);
    assert.equal(byDescription.data.listings[0].title, 'DSL Camera Kit');
    assert.equal(
      JSON.stringify(byDescription.data).includes('Includes a spare battery pack.'),
      false
    );

    const none = await api(baseUrl, 'GET', '/api/guest/listings?q=microscope');
    assert.equal(none.status, 200);
    assert.deepEqual(none.data.listings, []);

    const blank = await api(baseUrl, 'GET', '/api/guest/listings?q=%20%20');
    assert.equal(blank.status, 200);
    assert.equal(blank.data.listings.length, 2);
  });

  test('category filter validates and narrows results; all/blank means no restriction', async () => {
    const ownerId = await createStudent('category-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'Calculator',
      category: 'Electronics',
    });
    await createListing(ownerId, {
      title: 'Chemistry Book',
      category: 'Textbooks',
    });

    const electronics = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?category=Electronics'
    );
    assert.equal(electronics.status, 200);
    assert.equal(electronics.data.listings.length, 1);
    assert.equal(electronics.data.listings[0].title, 'Calculator');

    const all = await api(baseUrl, 'GET', '/api/guest/listings?category=all');
    assert.equal(all.status, 200);
    assert.equal(all.data.listings.length, 2);

    const blank = await api(baseUrl, 'GET', '/api/guest/listings');
    assert.equal(blank.status, 200);
    assert.equal(blank.data.listings.length, 2);

    const invalid = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?category=Spaceships'
    );
    assert.equal(invalid.status, 400);
    assert.match(invalid.data.error, /Invalid category/i);
  });

  test('combined q + category narrows results; zero matches still 200', async () => {
    const ownerId = await createStudent('combo-owner@mycentennialcollege.ca');
    await createListing(ownerId, {
      title: 'Lab Microscope',
      category: 'Lab Equipment',
      description: 'Precision optics for biology labs.',
      availability: 'unavailable',
    });
    await createListing(ownerId, {
      title: 'Lab Coat',
      category: 'Clothing',
      description: 'White coat for lab sessions.',
    });
    await createListing(ownerId, {
      title: 'USB Microscope',
      category: 'Electronics',
      description: 'Digital optics accessory.',
    });

    const combined = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=microscope&category=Lab%20Equipment'
    );
    assert.equal(combined.status, 200);
    assert.equal(combined.data.listings.length, 1);
    assert.equal(combined.data.listings[0].title, 'Lab Microscope');
    assert.equal(combined.data.listings[0].availability, 'unavailable');
    assert.equal(guestPreviewContainsHiddenField(combined.data), false);

    const zero = await api(
      baseUrl,
      'GET',
      '/api/guest/listings?q=microscope&category=Furniture'
    );
    assert.equal(zero.status, 200);
    assert.notEqual(zero.status, 404);
    assert.deepEqual(zero.data.listings, []);
  });
});
