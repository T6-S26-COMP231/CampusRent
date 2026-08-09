/**
 * US-20.4 / US-20.5 / US-20.7 — submit-report API (POST /api/reports).
 * Target existence and submission validation live here.
 * Team6 TAC acceptance mapping for Tests 2–3 is in us-20-acceptance.test.ts.
 * TAC Test 4 (admin moderation dashboard) remains PENDING US-23.
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

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;
let Report: typeof import('../src/models/Report').Report;

let server: Server;
let baseUrl: string;
let reporterId: number;
let otherStudentId: number;
let listingId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: { verification_status?: 'pending' | 'verified' | 'rejected' } = {}
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

async function createListing(ownerId: number, title = 'Report target listing') {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: ownerId,
    title,
    category: 'Electronics',
    description: 'A listing used as a report target in tests.',
    rental_terms: 'Return next day',
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
  ({ Report } = await import('../src/models/Report'));
  await connectDatabase(uri);
  await Report.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  reporterId = await createStudent('reporter@mycentennialcollege.ca', 'Reporter', 'Student');
  otherStudentId = await createStudent('other@mycentennialcollege.ca', 'Other', 'Student');
  listingId = await createListing(otherStudentId);
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-20.4 submit-report API endpoint', () => {
  test('unauthenticated request is denied with 401', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Spam',
        details: 'Looks fake',
      },
    });
    assert.equal(response.status, 401);
  });

  test('unverified student is denied with 403 and nothing is persisted', async () => {
    const pendingId = await createStudent(
      'pending-reporter@mycentennialcollege.ca',
      'Pending',
      'Reporter',
      { verification_status: 'pending' }
    );
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(pendingId, 'pending-reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Spam',
        details: 'Should be blocked before persistence.',
      },
    });
    assert.equal(response.status, 403);
    assert.equal(await Report.countDocuments(), 0);
  });

  test('valid verified student can reach the endpoint', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Misleading photos',
        details: 'Images do not match the item.',
      },
    });
    assert.equal(response.status, 201);
    assert.equal(typeof response.data.id, 'number');
  });

  test('valid listing report persists with expected response fields', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: '  Misleading listing  ',
        details: '  Photos look staged.  ',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'listing');
    assert.equal(response.data.target_id, listingId);
    assert.equal(response.data.reporter_id, reporterId);
    assert.equal(response.data.reason, 'Misleading listing');
    assert.equal(response.data.details, 'Photos look staged.');
    assert.equal(typeof response.data.created_at, 'string');
    assert.ok(!Number.isNaN(Date.parse(response.data.created_at)));
    assert.equal(response.data._id, undefined);
    assert.equal(response.data.__v, undefined);
  });

  test('valid user report persists', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: otherStudentId,
        reason: 'Harassment',
        details: 'Threatening rental messages.',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'user');
    assert.equal(response.data.target_id, otherStudentId);
    assert.equal(response.data.reporter_id, reporterId);
  });

  test('reporter_id comes from authenticated user; client reporter_id cannot spoof', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Spam',
        details: 'Repeated junk.',
        reporter_id: otherStudentId,
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.reporter_id, reporterId);
    assert.notEqual(response.data.reporter_id, otherStudentId);

    const stored = await Report.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.reporter_id, reporterId);
  });

  test('reason and details are persisted trimmed', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: otherStudentId,
        reason: '  Offensive language  ',
        details: '  Used in messages about pickup.  ',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.reason, 'Offensive language');
    assert.equal(response.data.details, 'Used in messages about pickup.');

    const stored = await Report.findById(response.data.id).lean();
    assert.equal(stored!.reason, 'Offensive language');
    assert.equal(stored!.details, 'Used in messages about pickup.');
  });

  test('report remains present in MongoDB after a later query', async () => {
    const created = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Scam concern',
        details: 'Asked for off-platform payment.',
      },
    });
    assert.equal(created.status, 201);

    const later = await Report.findById(created.data.id).lean();
    assert.ok(later);
    assert.equal(later!._id, created.data.id);
    assert.equal(later!.reporter_id, reporterId);
    assert.equal(later!.target_type, 'listing');
    assert.equal(later!.target_id, listingId);
    assert.equal(later!.reason, 'Scam concern');
    assert.equal(later!.details, 'Asked for off-platform payment.');
    assert.ok(later!.created_at instanceof Date);
  });

  test('multiple reports persist independently', async () => {
    const first = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'One',
        details: 'First report',
      },
    });
    const second = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(otherStudentId, 'other@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: reporterId,
        reason: 'Two',
        details: 'Second report',
      },
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.data.id, second.data.id);
    assert.equal(await Report.countDocuments(), 2);
  });

  test('missing basic required request fields are rejected', async () => {
    const token = tokenFor(reporterId, 'reporter@mycentennialcollege.ca');

    const missingType = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_id: listingId, reason: 'x', details: 'y' },
    });
    assert.equal(missingType.status, 400);

    const missingTarget = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', reason: 'x', details: 'y' },
    });
    assert.equal(missingTarget.status, 400);

    const missingReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: listingId, details: 'y' },
    });
    assert.equal(missingReason.status, 400);

    const missingDetails = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: listingId, reason: 'x' },
    });
    assert.equal(missingDetails.status, 400);

    const blankReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: listingId, reason: '   ', details: 'y' },
    });
    assert.equal(blankReason.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });
});

describe('US-20.5 report target, reason, details, and submission validation', () => {
  test('real user target succeeds', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: otherStudentId,
        reason: 'Inappropriate behaviour',
        details: 'Repeated threatening messages.',
      },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'user');
    assert.equal(response.data.target_id, otherStudentId);
  });

  test('real listing target succeeds', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Misleading listing',
        details: 'Description does not match the photos.',
      },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'listing');
    assert.equal(response.data.target_id, listingId);
  });

  test('nonexistent user target is rejected with 404 and no persistence', async () => {
    const missingUserId = otherStudentId + 999;
    assert.equal(await User.exists({ _id: missingUserId }), null);

    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: missingUserId,
        reason: 'Harassment',
        details: 'Would report if user existed.',
      },
    });

    assert.equal(response.status, 404);
    assert.equal(response.data.error, 'User not found');
    assert.equal(await Report.countDocuments(), 0);
  });

  test('nonexistent listing target is rejected with 404 and no persistence', async () => {
    const missingListingId = listingId + 999;
    assert.equal(await Listing.exists({ _id: missingListingId }), null);

    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: missingListingId,
        reason: 'Spam',
        details: 'Would report if listing existed.',
      },
    });

    assert.equal(response.status, 404);
    assert.equal(response.data.error, 'Listing not found');
    assert.equal(await Report.countDocuments(), 0);
  });

  test('user/listing id collision cannot bypass target-type validation', async () => {
    // Shared numeric id that exists only as a Listing (no User with that id).
    const listingOnlyId = 5000;
    assert.equal(await User.exists({ _id: listingOnlyId }), null);
    await Listing.create({
      _id: listingOnlyId,
      owner_id: otherStudentId,
      title: 'Collision listing',
      category: 'Electronics',
      description: 'Exists only in listings collection for this id.',
      rental_terms: 'n/a',
      availability: 'available',
      images: [],
    });

    const asUser = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: listingOnlyId,
        reason: 'Should fail',
        details: 'Listing id must not satisfy a user target.',
      },
    });
    assert.equal(asUser.status, 404);
    assert.equal(asUser.data.error, 'User not found');

    // Shared numeric id that exists only as a User (no Listing with that id).
    const userOnlyId = otherStudentId;
    assert.equal(await Listing.exists({ _id: userOnlyId }), null);

    const asListing = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: userOnlyId,
        reason: 'Should fail',
        details: 'User id must not satisfy a listing target.',
      },
    });
    assert.equal(asListing.status, 404);
    assert.equal(asListing.data.error, 'Listing not found');

    assert.equal(await Report.countDocuments(), 0);

    // Correct typed targets with those same numeric ids still succeed.
    const listingOk = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingOnlyId,
        reason: 'Correct type',
        details: 'Listing collection check passes.',
      },
    });
    assert.equal(listingOk.status, 201);

    const userOk = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: userOnlyId,
        reason: 'Correct type',
        details: 'User collection check passes.',
      },
    });
    assert.equal(userOk.status, 201);
  });

  test('invalid target type is rejected', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'message',
        target_id: otherStudentId,
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, 'target_type must be user or listing');
    assert.equal(await Report.countDocuments(), 0);
  });

  test('target_id zero is rejected', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: 0,
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, 'target_id must be a positive integer');
    assert.equal(await Report.countDocuments(), 0);
  });

  test('target_id negative is rejected', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: -3,
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, 'target_id must be a positive integer');
    assert.equal(await Report.countDocuments(), 0);
  });

  test('non-integer target_id is rejected', async () => {
    const token = tokenFor(reporterId, 'reporter@mycentennialcollege.ca');

    const floatId = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'user',
        target_id: 1.5,
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(floatId.status, 400);

    const stringId = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'listing',
        target_id: 'abc',
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(stringId.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });

  test('missing, non-string, blank, and whitespace-only reason are rejected', async () => {
    const token = tokenFor(reporterId, 'reporter@mycentennialcollege.ca');
    const base = { target_type: 'listing' as const, target_id: listingId, details: 'details' };

    const missing = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base },
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error, 'reason is required');

    const nonString = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, reason: 123 },
    });
    assert.equal(nonString.status, 400);
    assert.equal(nonString.data.error, 'reason must be a string');

    const blank = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, reason: '' },
    });
    assert.equal(blank.status, 400);

    const whitespace = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, reason: '   \t  ' },
    });
    assert.equal(whitespace.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });

  test('missing, non-string, blank, and whitespace-only details are rejected', async () => {
    const token = tokenFor(reporterId, 'reporter@mycentennialcollege.ca');
    const base = { target_type: 'user' as const, target_id: otherStudentId, reason: 'reason' };

    const missing = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base },
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error, 'details are required');

    const nonString = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, details: { note: 'nope' } },
    });
    assert.equal(nonString.status, 400);
    assert.equal(nonString.data.error, 'details must be a string');

    const blank = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, details: '' },
    });
    assert.equal(blank.status, 400);

    const whitespace = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { ...base, details: ' \n ' },
    });
    assert.equal(whitespace.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });

  test('rejected report creates no Report document', async () => {
    const before = await Report.countDocuments();
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId + 5000,
        reason: 'x',
        details: 'y',
      },
    });
    assert.equal(response.status, 404);
    assert.equal(await Report.countDocuments(), before);
    assert.equal(await Report.countDocuments(), 0);
  });

  test('reporter spoofing remains impossible', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: otherStudentId,
        reason: 'Spam',
        details: 'Repeated junk messages.',
        reporter_id: otherStudentId,
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.reporter_id, reporterId);
    const stored = await Report.findById(response.data.id).lean();
    assert.equal(stored!.reporter_id, reporterId);
  });

  test('successful report stores trimmed reason and details', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: '  Free-text reason  ',
        details: '  Free-text supporting details.  ',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.reason, 'Free-text reason');
    assert.equal(response.data.details, 'Free-text supporting details.');

    const stored = await Report.findById(response.data.id).lean();
    assert.equal(stored!.reason, 'Free-text reason');
    assert.equal(stored!.details, 'Free-text supporting details.');
  });
});
