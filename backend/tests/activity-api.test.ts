/**
 * US-24.4 / US-24.5 — GET /api/admin/activity aggregation, auth, and filters.
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
    password_hash: 'test-password-hash-secret',
    first_name: 'Student',
    last_name: 'User',
    phone: '416-555-0100',
    role: 'student',
    verification_status: options.verification_status ?? 'verified',
    status: options.status ?? 'active',
    ...(options.created_at ? { created_at: options.created_at } : {}),
  });
  return id;
}

async function createAdmin(email: string, created_at?: Date) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash-secret',
    first_name: 'Admin',
    last_name: 'User',
    phone: '',
    role: 'admin',
    verification_status: 'verified',
    status: 'active',
    ...(created_at ? { created_at } : {}),
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
    title: `Listing ${id}`,
    category: options.category ?? 'Electronics',
    description: 'Activity aggregation listing',
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

async function createReport(
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
    reason: 'Activity test reason',
    details: 'Activity test details must not appear in aggregate response.',
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

function metricKeys(report: { metrics: Array<{ key: string }> }) {
  return report.metrics.map((row) => row.key);
}

function adminToken() {
  return signToken({
    id: adminId,
    email: 'admin@campusrent.test',
    role: 'admin',
  });
}

async function getActivity(query = '') {
  return api(baseUrl, 'GET', `/api/admin/activity${query}`, {
    token: adminToken(),
  });
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
  adminId = await createAdmin('admin@campusrent.test');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-24.4 GET /api/admin/activity', () => {
  test('empty database returns successful no-data ActivityReport', async () => {
    const response = await getActivity();

    assert.equal(response.status, 200);
    assert.equal(typeof response.data.generated_at, 'string');
    assert.ok(!Number.isNaN(Date.parse(response.data.generated_at)));
    assert.deepEqual(response.data.filters, {
      start_date: null,
      end_date: null,
      activity_scope: 'all',
      listing_category: null,
    });
    assert.equal(response.data.summary_total, 0);
    assert.equal(response.data.has_data, false);
    assert.equal(response.data.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.equal(
      response.data.no_data_message,
      'No platform activity matches the selected filters.'
    );
    assert.equal(response.data.metrics.length, ACTIVITY_METRIC_KEYS.length);
    for (const key of ACTIVITY_METRIC_KEYS) {
      assert.equal(metricCount(response.data, key), 0, key);
    }
    assert.equal(activityReportContainsSensitiveField(response.data), false);
  });

  test('returns real seeded counts; admins excluded from student metrics; summary_total not double-counted', async () => {
    const verifiedA = await createStudent('verified-a@mycentennialcollege.ca', {
      verification_status: 'verified',
    });
    const verifiedB = await createStudent('verified-b@mycentennialcollege.ca', {
      verification_status: 'verified',
    });
    await createStudent('pending@mycentennialcollege.ca', {
      verification_status: 'pending',
    });
    await createStudent('rejected@mycentennialcollege.ca', {
      verification_status: 'rejected',
    });
    await createStudent('suspended@mycentennialcollege.ca', {
      verification_status: 'verified',
      status: 'suspended',
    });
    await createAdmin('second-admin@campusrent.test');

    const availableListing = await createListing(verifiedA, {
      availability: 'available',
    });
    await createListing(verifiedA, { availability: 'available' });
    await createListing(verifiedB, { availability: 'unavailable' });

    await createRequest(availableListing, verifiedB, 'pending');
    await createRequest(availableListing, verifiedB, 'accepted');
    await createRequest(availableListing, verifiedB, 'declined');
    await createRequest(availableListing, verifiedB, 'cancelled');
    const completedRequest = await createRequest(
      availableListing,
      verifiedB,
      'completed'
    );

    await createReport(verifiedB, availableListing, 'open');
    await createReport(verifiedB, availableListing, 'open');
    await createReport(verifiedB, availableListing, 'resolved');
    await createReport(verifiedB, availableListing, 'dismissed');

    const reviewId = await nextId('reviews');
    await Review.create({
      _id: reviewId,
      reviewer_id: verifiedB,
      rental_request_id: completedRequest,
      listing_id: availableListing,
      reviewed_user_id: verifiedA,
      rating: 5,
      comment: 'Great rental — must not appear in aggregate response.',
    });

    const conversationId = await nextId('conversations');
    await Conversation.create({
      _id: conversationId,
      listing_id: availableListing,
      participant_low_id: verifiedA,
      participant_high_id: verifiedB,
    });
    const messageId = await nextId('messages');
    await Message.create({
      _id: messageId,
      conversation_id: conversationId,
      sender_id: verifiedB,
      body: 'Private message body must not appear in aggregate response.',
    });

    const response = await getActivity();

    assert.equal(response.status, 200);
    assert.equal(metricCount(response.data, 'total_registered_students'), 5);
    assert.equal(metricCount(response.data, 'verified_students'), 3);
    assert.equal(metricCount(response.data, 'pending_students'), 1);
    assert.equal(metricCount(response.data, 'rejected_students'), 1);
    assert.equal(metricCount(response.data, 'suspended_users'), 1);

    assert.equal(metricCount(response.data, 'total_listings'), 3);
    assert.equal(metricCount(response.data, 'available_listings'), 2);
    assert.equal(metricCount(response.data, 'unavailable_listings'), 1);

    assert.equal(metricCount(response.data, 'total_rental_requests'), 5);
    assert.equal(metricCount(response.data, 'pending_rental_requests'), 1);
    assert.equal(metricCount(response.data, 'accepted_rental_requests'), 1);
    assert.equal(metricCount(response.data, 'declined_rental_requests'), 1);
    assert.equal(metricCount(response.data, 'cancelled_rental_requests'), 1);
    assert.equal(metricCount(response.data, 'completed_rental_requests'), 1);

    assert.equal(metricCount(response.data, 'total_reports'), 4);
    assert.equal(metricCount(response.data, 'open_reports'), 2);
    assert.equal(metricCount(response.data, 'resolved_reports'), 1);
    assert.equal(metricCount(response.data, 'dismissed_reports'), 1);

    assert.equal(metricCount(response.data, 'total_reviews'), 1);
    assert.equal(metricCount(response.data, 'total_conversations'), 1);
    assert.equal(metricCount(response.data, 'total_messages'), 1);

    assert.equal(response.data.summary_total, 20);
    assert.equal(response.data.has_data, true);
    assert.equal(response.data.no_data_message, null);
    assert.notEqual(
      response.data.summary_total,
      response.data.metrics.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0
      )
    );

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('password_hash'), false);
    assert.equal(payload.includes('test-password-hash'), false);
    assert.equal(payload.includes('Private message body'), false);
    assert.equal(payload.includes('must not appear'), false);
    assert.equal(payload.includes('@mycentennialcollege.ca'), false);
    assert.equal(activityReportContainsSensitiveField(response.data), false);
    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in response.data, false, field);
    }
  });

  test('unauthenticated and non-admin callers are denied by existing admin wrapper', async () => {
    const unauth = await api(baseUrl, 'GET', '/api/admin/activity');
    assert.equal(unauth.status, 401);

    const studentId = await createStudent('student@mycentennialcollege.ca');
    const student = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: signToken({
        id: studentId,
        email: 'student@mycentennialcollege.ca',
        role: 'student',
      }),
    });
    assert.equal(student.status, 403);

    const verifiedStudentId = await createStudent(
      'verified-student@mycentennialcollege.ca',
      { verification_status: 'verified' }
    );
    const verifiedStudent = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: signToken({
        id: verifiedStudentId,
        email: 'verified-student@mycentennialcollege.ca',
        role: 'student',
      }),
    });
    assert.equal(verifiedStudent.status, 403);
  });
});

describe('US-24.5 activity filter and date-range enforcement', () => {
  test('defaults to scope=all with no date/category restriction', async () => {
    const owner = await createStudent('owner@mycentennialcollege.ca');
    await createListing(owner);

    const response = await getActivity();
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.filters, {
      start_date: null,
      end_date: null,
      activity_scope: 'all',
      listing_category: null,
    });
    assert.equal(metricCount(response.data, 'total_listings'), 1);
    assert.equal(response.data.has_data, true);
  });

  test('start_date / end_date / full range use inclusive UTC created_at days', async () => {
    const owner = await createStudent('dated-owner@mycentennialcollege.ca', {
      created_at: utcDay('2026-07-31'),
    });
    await createListing(owner, { created_at: utcDay('2026-07-31', 23) });
    await createListing(owner, { created_at: utcDay('2026-08-01', 0) });
    await createListing(owner, { created_at: utcDay('2026-08-02', 12) });
    await createListing(owner, { created_at: utcDay('2026-08-03', 23) });
    await createListing(owner, { created_at: utcDay('2026-08-04', 0) });

    const startOnly = await getActivity(
      '?start_date=2026-08-01&activity_scope=listings'
    );
    assert.equal(startOnly.status, 200);
    assert.equal(metricCount(startOnly.data, 'total_listings'), 4);
    assert.deepEqual(startOnly.data.filters, {
      start_date: '2026-08-01',
      end_date: null,
      activity_scope: 'listings',
      listing_category: null,
    });

    const endOnly = await getActivity(
      '?end_date=2026-08-03&activity_scope=listings'
    );
    assert.equal(endOnly.status, 200);
    assert.equal(metricCount(endOnly.data, 'total_listings'), 4);

    const fullRange = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-03&activity_scope=listings'
    );
    assert.equal(fullRange.status, 200);
    assert.equal(metricCount(fullRange.data, 'total_listings'), 3);
    assert.equal(fullRange.data.summary_total, 3);
    assert.deepEqual(fullRange.data.filters, {
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      activity_scope: 'listings',
      listing_category: null,
    });
  });

  test('date filter applies to status breakdowns', async () => {
    const owner = await createStudent('breakdown@mycentennialcollege.ca');
    const renter = await createStudent('renter@mycentennialcollege.ca');
    const listing = await createListing(owner);

    await createRequest(listing, renter, 'pending', utcDay('2026-08-01'));
    await createRequest(listing, renter, 'accepted', utcDay('2026-08-02'));
    await createRequest(listing, renter, 'declined', utcDay('2026-08-10'));
    await createReport(renter, listing, 'open', utcDay('2026-08-01'));
    await createReport(renter, listing, 'resolved', utcDay('2026-08-10'));
    await createListing(owner, {
      availability: 'available',
      created_at: utcDay('2026-08-01'),
    });
    await createListing(owner, {
      availability: 'unavailable',
      created_at: utcDay('2026-08-10'),
    });

    const requests = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-02&activity_scope=rental_requests'
    );
    assert.equal(requests.status, 200);
    assert.equal(metricCount(requests.data, 'total_rental_requests'), 2);
    assert.equal(metricCount(requests.data, 'pending_rental_requests'), 1);
    assert.equal(metricCount(requests.data, 'accepted_rental_requests'), 1);
    assert.equal(metricCount(requests.data, 'declined_rental_requests'), 0);

    const reports = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-02&activity_scope=reports'
    );
    assert.equal(metricCount(reports.data, 'total_reports'), 1);
    assert.equal(metricCount(reports.data, 'open_reports'), 1);
    assert.equal(metricCount(reports.data, 'resolved_reports'), 0);

    const listings = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-02&activity_scope=listings'
    );
    assert.equal(metricCount(listings.data, 'total_listings'), 1);
    assert.equal(metricCount(listings.data, 'available_listings'), 1);
    assert.equal(metricCount(listings.data, 'unavailable_listings'), 0);
  });

  test('invalid dates and inverted range return 400', async () => {
    for (const query of [
      '?start_date=08/01/2026',
      '?start_date=abc',
      '?start_date=2026-13-01',
      '?end_date=2026-02-30',
      '?start_date=2026-08-10&end_date=2026-08-01',
    ]) {
      const response = await getActivity(query);
      assert.equal(response.status, 400, query);
      assert.equal(typeof response.data.error, 'string');
    }
  });

  test('every approved activity_scope returns only relevant metric rows', async () => {
    const owner = await createStudent('scope-owner@mycentennialcollege.ca');
    const renter = await createStudent('scope-renter@mycentennialcollege.ca');
    const listing = await createListing(owner);
    const completed = await createRequest(listing, renter, 'completed');
    await createReport(renter, listing, 'open');
    const reviewId = await nextId('reviews');
    await Review.create({
      _id: reviewId,
      reviewer_id: renter,
      rental_request_id: completed,
      listing_id: listing,
      reviewed_user_id: owner,
      rating: 4,
      comment: 'Scoped review comment must stay private.',
    });
    const conversationId = await nextId('conversations');
    await Conversation.create({
      _id: conversationId,
      listing_id: listing,
      participant_low_id: owner,
      participant_high_id: renter,
    });
    await Message.create({
      _id: await nextId('messages'),
      conversation_id: conversationId,
      sender_id: renter,
      body: 'Scoped message body must stay private.',
    });

    for (const scope of ACTIVITY_SCOPES) {
      const response = await getActivity(`?activity_scope=${scope}`);
      assert.equal(response.status, 200, scope);
      assert.equal(response.data.filters.activity_scope, scope);
      assert.deepEqual(metricKeys(response.data), [...ACTIVITY_SCOPE_METRICS[scope]]);
      assert.ok(response.data.summary_total > 0, scope);
      assert.equal(response.data.has_data, true, scope);
    }

    const users = await getActivity('?activity_scope=users');
    assert.equal(metricCount(users.data, 'total_registered_students'), 2);
    assert.equal(users.data.summary_total, 2);

    const listings = await getActivity('?activity_scope=listings');
    assert.equal(metricCount(listings.data, 'total_listings'), 1);
    assert.equal(listings.data.summary_total, 1);

    const messaging = await getActivity('?activity_scope=messaging');
    assert.equal(metricCount(messaging.data, 'total_conversations'), 1);
    assert.equal(metricCount(messaging.data, 'total_messages'), 1);
    assert.equal(messaging.data.summary_total, 2);
  });

  test('invalid activity_scope returns 400', async () => {
    for (const scope of ['payments', 'unknown', 'Users']) {
      const response = await getActivity(`?activity_scope=${scope}`);
      assert.equal(response.status, 400, scope);
      assert.match(response.data.error, /Activity scope must be one of/i);
    }
  });

  test('listing_category filters listing metrics; allowed with all/listings only', async () => {
    const owner = await createStudent('category-owner@mycentennialcollege.ca');
    await createListing(owner, {
      category: 'Electronics',
      availability: 'available',
      created_at: utcDay('2026-08-02'),
    });
    await createListing(owner, {
      category: 'Textbooks',
      availability: 'unavailable',
      created_at: utcDay('2026-08-02'),
    });
    await createListing(owner, {
      category: 'Electronics',
      availability: 'unavailable',
      created_at: utcDay('2026-07-01'),
    });
    await createStudent('extra@mycentennialcollege.ca');

    const listingsScope = await getActivity(
      '?activity_scope=listings&listing_category=Electronics'
    );
    assert.equal(listingsScope.status, 200);
    assert.equal(metricCount(listingsScope.data, 'total_listings'), 2);
    assert.equal(metricCount(listingsScope.data, 'available_listings'), 1);
    assert.equal(metricCount(listingsScope.data, 'unavailable_listings'), 1);
    assert.equal(listingsScope.data.filters.listing_category, 'Electronics');

    const withDates = await getActivity(
      '?activity_scope=listings&listing_category=Electronics&start_date=2026-08-01&end_date=2026-08-03'
    );
    assert.equal(withDates.status, 200);
    assert.equal(metricCount(withDates.data, 'total_listings'), 1);
    assert.equal(metricCount(withDates.data, 'available_listings'), 1);
    assert.equal(metricCount(withDates.data, 'unavailable_listings'), 0);

    // Rule A: under all, category filters only the listing portion.
    const allScope = await getActivity('?listing_category=Electronics');
    assert.equal(allScope.status, 200);
    assert.equal(allScope.data.filters.activity_scope, 'all');
    assert.equal(allScope.data.filters.listing_category, 'Electronics');
    assert.equal(metricCount(allScope.data, 'total_listings'), 2);
    assert.equal(metricCount(allScope.data, 'total_registered_students'), 2);

    const invalidCategory = await getActivity(
      '?activity_scope=listings&listing_category=Spaceships'
    );
    assert.equal(invalidCategory.status, 400);

    for (const scope of [
      'users',
      'rental_requests',
      'reports',
      'reviews',
      'messaging',
    ]) {
      const incompatible = await getActivity(
        `?activity_scope=${scope}&listing_category=Electronics`
      );
      assert.equal(incompatible.status, 400, scope);
      assert.match(incompatible.data.error, /listing_category can only be used/i);
    }
  });

  test('valid filter with zero matches returns no-data success shape', async () => {
    const owner = await createStudent('empty-filter@mycentennialcollege.ca');
    await createListing(owner, { created_at: utcDay('2026-01-01') });

    const response = await getActivity(
      '?start_date=2026-08-01&end_date=2026-08-03&activity_scope=listings'
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.summary_total, 0);
    assert.equal(response.data.has_data, false);
    assert.equal(response.data.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.deepEqual(response.data.filters, {
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      activity_scope: 'listings',
      listing_category: null,
    });
  });

  test('generated_at is server-owned; query cannot override it; privacy holds', async () => {
    const owner = await createStudent('privacy@mycentennialcollege.ca');
    await createListing(owner);

    const before = Date.now();
    const response = await getActivity(
      '?generated_at=2000-01-01T00:00:00.000Z&activity_scope=listings'
    );
    const after = Date.now();

    assert.equal(response.status, 200);
    const generated = Date.parse(response.data.generated_at);
    assert.ok(generated >= before - 1000);
    assert.ok(generated <= after + 1000);
    assert.notEqual(response.data.generated_at, '2000-01-01T00:00:00.000Z');

    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('password'), false);
    assert.equal(payload.includes('@mycentennialcollege.ca'), false);
    assert.equal(activityReportContainsSensitiveField(response.data), false);
  });
});
