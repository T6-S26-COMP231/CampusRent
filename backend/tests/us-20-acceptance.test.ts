/**
 * US-20.7 — Team6 TAC acceptance mapping for report submission.
 *
 * TAC Test 1 — Open report form → Form displayed
 *              (frontend helper/form contract; see frontend us-20-acceptance.test.ts)
 * TAC Test 2 — Submit valid report → Report saved successfully
 * TAC Test 3 — Submit incomplete report → Validation error displayed
 * TAC Test 4 — Admin views report → Report appears in moderation dashboard
 *              Status: PENDING US-23 — Team6 TAC assigns moderation queue /
 *              report-detail UI and report-list/detail APIs to US-23.
 *
 * Broader field/auth/target validation remains in submit-report.test.ts and
 * report-model.test.ts. This suite stays acceptance-focused for Tests 2–3.
 *
 * Do NOT claim Overall Result: PASSED for US-20 while Test 4 is pending.
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
let ownerId: number;
let listingId: number;

/** Explicit cross-story marker — do not treat as a pass for US-20. */
export const US_20_TAC_TEST_4_STATUS = 'PENDING US-23' as const;
export const US_20_TAC_TEST_4_REASON =
  'Team6 TAC assigns the moderation queue / report-detail admin UI and report-list/detail APIs to US-23.';

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

async function createListing(owner: number, title: string) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title,
    category: 'Electronics',
    description: 'US-20 TAC acceptance listing',
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
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Owner', 'Student');
  listingId = await createListing(ownerId, 'US-20 Acceptance Camera');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-20 TAC acceptance tests', () => {
  test('TAC Test 2 — Submit valid listing report is saved successfully', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: '  Misleading photos  ',
        details: '  Images do not match the item.  ',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(typeof response.data.id, 'number');
    assert.equal(response.data.reporter_id, reporterId);
    assert.equal(response.data.target_type, 'listing');
    assert.equal(response.data.target_id, listingId);
    assert.equal(response.data.reason, 'Misleading photos');
    assert.equal(response.data.details, 'Images do not match the item.');
    assert.equal(typeof response.data.created_at, 'string');
    assert.ok(!Number.isNaN(Date.parse(response.data.created_at)));

    const stored = await Report.findById(response.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.reporter_id, reporterId);
    assert.equal(stored!.target_type, 'listing');
    assert.equal(stored!.target_id, listingId);
    assert.equal(stored!.reason, 'Misleading photos');
    assert.equal(stored!.details, 'Images do not match the item.');
  });

  test('TAC Test 2 — Submit valid user report is saved successfully', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: ownerId,
        reason: 'Harassment',
        details: 'Threatening rental messages.',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'user');
    assert.equal(response.data.target_id, ownerId);
    assert.equal(response.data.reporter_id, reporterId);
    assert.equal(await Report.countDocuments(), 1);
  });

  test('TAC Test 3 — Submit incomplete report is rejected with validation error and no persistence', async () => {
    const token = tokenFor(reporterId, 'reporter@mycentennialcollege.ca');

    const missingReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'listing',
        target_id: listingId,
        details: 'Has details only',
      },
    });
    assert.equal(missingReason.status, 400);
    assert.match(String(missingReason.data.error ?? ''), /reason/i);

    const blankReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: '   ',
        details: 'Has details',
      },
    });
    assert.equal(blankReason.status, 400);

    const missingDetails = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'user',
        target_id: ownerId,
        reason: 'Harassment',
      },
    });
    assert.equal(missingDetails.status, 400);
    assert.match(String(missingDetails.data.error ?? ''), /details/i);

    const blankDetails = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: {
        target_type: 'user',
        target_id: ownerId,
        reason: 'Harassment',
        details: ' \n\t ',
      },
    });
    assert.equal(blankDetails.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });

  test('supporting auth: unverified student cannot submit; reporter spoof ignored', async () => {
    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );
    const denied = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(pendingId, 'pending@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: 'Spam',
        details: 'Should not persist.',
      },
    });
    assert.equal(denied.status, 403);
    assert.equal(await Report.countDocuments(), 0);

    const spoofed = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'user',
        target_id: ownerId,
        reason: 'Spam',
        details: 'Spoof attempt',
        reporter_id: ownerId,
      },
    });
    assert.equal(spoofed.status, 201);
    assert.equal(spoofed.data.reporter_id, reporterId);
    assert.notEqual(spoofed.data.reporter_id, ownerId);
  });

  test('TAC Test 4 — Admin views report remains PENDING US-23 (not claimed passed)', () => {
    assert.equal(US_20_TAC_TEST_4_STATUS, 'PENDING US-23');
    assert.match(US_20_TAC_TEST_4_REASON, /US-23/);
    assert.match(US_20_TAC_TEST_4_REASON, /moderation queue/i);
  });
});
