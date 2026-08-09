/**
 * US-24.7 — Team6 TAC acceptance mapping for platform activity monitoring.
 *
 * TAC Test 1 — Open activity dashboard → Platform statistics displayed
 * TAC Test 2 — Apply filters → Results update correctly
 * TAC Test 3 — Generate report → Activity summary produced
 * TAC Test 4 — Filter with no data → No-data message displayed
 *
 * Broader low-level coverage remains in activity-api.test.ts and
 * activity-metrics.test.ts. This suite stays acceptance-focused.
 *
 * Do NOT claim production Overall Result: PASSED — US-24.8 (#186) owns
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
  ACTIVITY_METRIC_KEYS,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  ACTIVITY_SCOPE_METRICS,
  ACTIVITY_SCOPES,
  activityReportContainsSensitiveField,
} from '../src/utils/activityMetrics';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_24_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-24.8' as const;
export const US_24_PRODUCTION_ACCEPTANCE_REASON =
  'US-24.8 (#186) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;
let RentalRequest: typeof import('../src/models/RentalRequest').RentalRequest;
let Report: typeof import('../src/models/Report').Report;
let Review: typeof import('../src/models/Review').Review;
let Conversation: typeof import('../src/models/Conversation').Conversation;
let Message: typeof import('../src/models/Message').Message;

let server: Server;
let baseUrl: string;
let adminId: number;

function utcDay(isoDate: string, hour = 12): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0, 0));
}

async function createStudent(
  email: string,
  options: {
    verification_status?: 'pending' | 'verified' | 'rejected';
    status?: 'active' | 'suspended';
    created_at?: Date;
  } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'acceptance-password-hash-secret',
    first_name: 'Accept',
    last_name: 'Student',
    phone: '416-555-0199',
    role: 'student',
    verification_status: options.verification_status ?? 'verified',
    status: options.status ?? 'active',
    ...(options.created_at ? { created_at: options.created_at } : {}),
  });
  return id;
}

async function createAdmin(email: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'acceptance-password-hash-secret',
    first_name: 'Accept',
    last_name: 'Admin',
    phone: '',
    role: 'admin',
    verification_status: 'verified',
    status: 'active',
  });
  return id;
}

async function createListing(
  ownerId: number,
  options: {
    availability?: 'available' | 'unavailable';
    category?: string;
    created_at?: Date;
  } = {}
) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: ownerId,
    title: `Acceptance listing ${id}`,
    category: options.category ?? 'Electronics',
    description: 'US-24 acceptance listing',
    rental_terms: '',
    availability: options.availability ?? 'available',
    images: [],
    ...(options.created_at ? { created_at: options.created_at } : {}),
  });
  return id;
}

async function createRequest(
  listingId: number,
  renterId: number,
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed',
  created_at?: Date
) {
  const id = await nextId('rental_requests');
  await RentalRequest.create({
    _id: id,
    listing_id: listingId,
    renter_id: renterId,
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    status,
    ...(created_at ? { created_at } : {}),
  });
  return id;
}

async function createReportDoc(
  reporterId: number,
  targetId: number,
  status: 'open' | 'resolved' | 'dismissed',
  created_at?: Date
) {
  const id = await nextId('reports');
  await Report.create({
    _id: id,
    reporter_id: reporterId,
    target_type: 'listing',
    target_id: targetId,
    reason: 'Acceptance reason must stay private',
    details: 'Acceptance details must stay private',
    status,
    ...(created_at ? { created_at } : {}),
  });
  return id;
}

function metricCount(
  report: { metrics: Array<{ key: string; count: number }> },
  key: string
) {
  const row = report.metrics.find((metric) => metric.key === key);
  assert.ok(row, key);
  return row!.count;
}

function adminToken() {
  return signToken({
    id: adminId,
    email: 'admin-accept@campusrent.test',
    role: 'admin',
  });
}

async function getActivity(query = '') {
  return api(baseUrl, 'GET', `/api/admin/activity${query}`, {
    token: adminToken(),
  });
}

/**
 * Seed a representative platform used by Tests 1–3.
 * Returns ids useful for messaging/review fixtures.
 */
async function seedPlatformActivity() {
  const owner = await createStudent('owner-accept@mycentennialcollege.ca', {
    verification_status: 'verified',
    created_at: utcDay('2026-08-02'),
  });
  const renter = await createStudent('renter-accept@mycentennialcollege.ca', {
    verification_status: 'verified',
    created_at: utcDay('2026-08-02'),
  });
  await createStudent('pending-accept@mycentennialcollege.ca', {
    verification_status: 'pending',
    created_at: utcDay('2026-08-02'),
  });
  await createStudent('rejected-accept@mycentennialcollege.ca', {
    verification_status: 'rejected',
    created_at: utcDay('2026-08-02'),
  });
  // Extra admin must not inflate student totals.
  await createAdmin('second-admin-accept@campusrent.test');

  const electronics = await createListing(owner, {
    category: 'Electronics',
    availability: 'available',
    created_at: utcDay('2026-08-02'),
  });
  await createListing(owner, {
    category: 'Textbooks',
    availability: 'unavailable',
    created_at: utcDay('2026-08-02'),
  });
  // Outside date window for filter tests.
  await createListing(owner, {
    category: 'Electronics',
    availability: 'available',
    created_at: utcDay('2026-07-01'),
  });

  await createRequest(electronics, renter, 'pending', utcDay('2026-08-02'));
  await createRequest(electronics, renter, 'accepted', utcDay('2026-08-02'));
  await createRequest(electronics, renter, 'declined', utcDay('2026-07-01'));
  const completed = await createRequest(
    electronics,
    renter,
    'completed',
    utcDay('2026-08-02')
  );

  await createReportDoc(renter, electronics, 'open', utcDay('2026-08-02'));
  await createReportDoc(renter, electronics, 'resolved', utcDay('2026-07-01'));

  const reviewId = await nextId('reviews');
  await Review.create({
    _id: reviewId,
    reviewer_id: renter,
    rental_request_id: completed,
    listing_id: electronics,
    reviewed_user_id: owner,
    rating: 5,
    comment: 'Acceptance review comment must stay private.',
    created_at: utcDay('2026-08-02'),
  });

  const conversationId = await nextId('conversations');
  await Conversation.create({
    _id: conversationId,
    listing_id: electronics,
    participant_low_id: owner,
    participant_high_id: renter,
    created_at: utcDay('2026-08-02'),
  });
  await Message.create({
    _id: await nextId('messages'),
    conversation_id: conversationId,
    sender_id: renter,
    body: 'Acceptance message body must stay private.',
    created_at: utcDay('2026-08-02'),
  });

  return { owner, renter, electronics };
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
  ({ Report } = await import('../src/models/Report'));
  ({ Review } = await import('../src/models/Review'));
  ({ Conversation } = await import('../src/models/Conversation'));
  ({ Message } = await import('../src/models/Message'));
  await connectDatabase(uri);

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  adminId = await createAdmin('admin-accept@campusrent.test');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-24 TAC acceptance — authorization', () => {
  test('unauthenticated → 401; student/verified student → 403; admin → 200', async () => {
    const unauth = await api(baseUrl, 'GET', '/api/admin/activity');
    assert.equal(unauth.status, 401);

    const studentId = await createStudent('student-accept@mycentennialcollege.ca', {
      verification_status: 'pending',
    });
    const student = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: signToken({
        id: studentId,
        email: 'student-accept@mycentennialcollege.ca',
        role: 'student',
      }),
    });
    assert.equal(student.status, 403);

    const verifiedId = await createStudent(
      'verified-accept@mycentennialcollege.ca',
      { verification_status: 'verified' }
    );
    const verified = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: signToken({
        id: verifiedId,
        email: 'verified-accept@mycentennialcollege.ca',
        role: 'student',
      }),
    });
    assert.equal(verified.status, 403);

    const admin = await getActivity();
    assert.equal(admin.status, 200);
  });
});

describe('US-24 TAC acceptance helpers', () => {
  test('TAC Test 1 — Open activity dashboard: platform statistics displayed', async () => {
    await seedPlatformActivity();

    const before = Date.now();
    const response = await getActivity();
    const after = Date.now();

    assert.equal(response.status, 200);
    assert.equal(typeof response.data.generated_at, 'string');
    const generated = Date.parse(response.data.generated_at);
    assert.ok(!Number.isNaN(generated));
    assert.ok(generated >= before - 1000);
    assert.ok(generated <= after + 1000);

    assert.equal(response.data.metrics.length, ACTIVITY_METRIC_KEYS.length);
    assert.equal(metricCount(response.data, 'total_registered_students'), 4);
    assert.equal(metricCount(response.data, 'verified_students'), 2);
    assert.equal(metricCount(response.data, 'pending_students'), 1);
    assert.equal(metricCount(response.data, 'rejected_students'), 1);
    assert.equal(metricCount(response.data, 'total_listings'), 3);
    assert.equal(metricCount(response.data, 'total_rental_requests'), 4);
    assert.equal(metricCount(response.data, 'total_reports'), 2);
    assert.equal(metricCount(response.data, 'total_reviews'), 1);
    assert.equal(metricCount(response.data, 'total_conversations'), 1);
    assert.equal(metricCount(response.data, 'total_messages'), 1);

    // Independent base totals only: 4 + 3 + 4 + 2 + 1 + 1 + 1 = 16
    assert.equal(response.data.summary_total, 16);
    assert.equal(response.data.has_data, true);
    assert.notEqual(
      response.data.summary_total,
      response.data.metrics.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0
      )
    );

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('acceptance-password-hash'), false);
    assert.equal(payload.includes('@mycentennialcollege.ca'), false);
    assert.equal(payload.includes('must stay private'), false);
    assert.equal(activityReportContainsSensitiveField(response.data), false);
    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in response.data, false, field);
    }

    assert.equal(US_24_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-24.8');
  });

  test('TAC Test 2 — Apply filters: results update correctly', async () => {
    await seedPlatformActivity();

    const ranged = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-03&activity_scope=listings&listing_category=Electronics'
    );
    assert.equal(ranged.status, 200);
    assert.deepEqual(ranged.data.filters, {
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      activity_scope: 'listings',
      listing_category: 'Electronics',
    });
    assert.equal(metricCount(ranged.data, 'total_listings'), 1);
    assert.equal(metricCount(ranged.data, 'available_listings'), 1);
    assert.equal(metricCount(ranged.data, 'unavailable_listings'), 0);
    assert.equal(ranged.data.summary_total, 1);
    assert.deepEqual(
      ranged.data.metrics.map((row: { key: string }) => row.key),
      [...ACTIVITY_SCOPE_METRICS.listings]
    );

    const requests = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-03&activity_scope=rental_requests'
    );
    assert.equal(metricCount(requests.data, 'total_rental_requests'), 3);
    assert.equal(metricCount(requests.data, 'pending_rental_requests'), 1);
    assert.equal(metricCount(requests.data, 'accepted_rental_requests'), 1);
    assert.equal(metricCount(requests.data, 'completed_rental_requests'), 1);
    assert.equal(metricCount(requests.data, 'declined_rental_requests'), 0);
    assert.equal(requests.data.summary_total, 3);

    for (const scope of ACTIVITY_SCOPES) {
      const scoped = await getActivity(`?activity_scope=${scope}`);
      assert.equal(scoped.status, 200, scope);
      assert.equal(scoped.data.filters.activity_scope, scope);
      assert.deepEqual(
        scoped.data.metrics.map((row: { key: string }) => row.key),
        [...ACTIVITY_SCOPE_METRICS[scope]]
      );
      assert.ok(scoped.data.summary_total > 0, scope);
    }

    for (const query of [
      '?start_date=08/01/2026',
      '?start_date=2026-13-01',
      '?end_date=2026-02-30',
      '?start_date=2026-08-10&end_date=2026-08-01',
      '?activity_scope=payments',
      '?activity_scope=listings&listing_category=Spaceships',
      '?activity_scope=users&listing_category=Electronics',
    ]) {
      const bad = await getActivity(query);
      assert.equal(bad.status, 400, query);
      assert.equal(typeof bad.data.error, 'string');
    }
  });

  test('TAC Test 3 — Generate report: ActivityReport summary produced', async () => {
    await seedPlatformActivity();

    // Generating a report in US-24 means returning the activity summary response.
    const response = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-03&activity_scope=all'
    );

    assert.equal(response.status, 200);
    assert.equal(typeof response.data.generated_at, 'string');
    assert.ok(response.data.filters);
    assert.ok(Array.isArray(response.data.metrics));
    assert.equal(typeof response.data.summary_total, 'number');
    assert.equal(typeof response.data.has_data, 'boolean');

    assert.equal(response.data.has_data, true);
    assert.ok(response.data.summary_total > 0);
    assert.equal(response.data.filters.start_date, '2026-08-01');
    assert.equal(response.data.filters.end_date, '2026-08-03');
    assert.equal(response.data.filters.activity_scope, 'all');

    // Base totals in range: students 4 + listings 2 + requests 3 + reports 1 +
    // reviews 1 + conversations 1 + messages 1 = 13
    assert.equal(response.data.summary_total, 13);
    assert.notEqual(
      response.data.summary_total,
      response.data.metrics.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0
      )
    );
    assert.equal(activityReportContainsSensitiveField(response.data), false);
  });

  test('TAC Test 4 — Filter with no data: approved no-data message', async () => {
    await seedPlatformActivity();

    const response = await getActivity(
      '?start_date=2025-01-01&end_date=2025-01-02&activity_scope=listings'
    );

    assert.equal(response.status, 200);
    assert.notEqual(response.status, 400);
    assert.notEqual(response.status, 404);
    assert.notEqual(response.status, 500);
    assert.equal(response.data.summary_total, 0);
    assert.equal(response.data.has_data, false);
    assert.equal(response.data.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.equal(
      response.data.no_data_message,
      'No platform activity matches the selected filters.'
    );
    assert.deepEqual(response.data.filters, {
      start_date: '2025-01-01',
      end_date: '2025-01-02',
      activity_scope: 'listings',
      listing_category: null,
    });
  });

  test('production acceptance remains PENDING for US-24.8 (#186)', () => {
    assert.equal(US_24_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-24.8');
    assert.match(US_24_PRODUCTION_ACCEPTANCE_REASON, /US-24\.8/);
    assert.match(US_24_PRODUCTION_ACCEPTANCE_REASON, /#186/);
  });
});
