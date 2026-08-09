/**
 * US-24.4 — GET /api/admin/activity aggregation / ActivityReport response.
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

async function createStudent(
  email: string,
  options: {
    verification_status?: 'pending' | 'verified' | 'rejected';
    status?: 'active' | 'suspended';
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
  });
  return id;
}

async function createAdmin(email: string) {
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
  });
  return id;
}

async function createListing(
  ownerId: number,
  availability: 'available' | 'unavailable' = 'available'
) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: ownerId,
    title: `Listing ${id}`,
    category: 'Electronics',
    description: 'Activity aggregation listing',
    rental_terms: '',
    availability,
    images: [],
  });
  return id;
}

async function createRequest(
  listingId: number,
  renterId: number,
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed'
) {
  const id = await nextId('rental_requests');
  await RentalRequest.create({
    _id: id,
    listing_id: listingId,
    renter_id: renterId,
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    status,
  });
  return id;
}

async function createReport(
  reporterId: number,
  targetId: number,
  status: 'open' | 'resolved' | 'dismissed'
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
    email: 'admin@campusrent.test',
    role: 'admin',
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
    const response = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: adminToken(),
    });

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
    // Extra admin must not inflate student totals.
    await createAdmin('second-admin@campusrent.test');

    const availableListing = await createListing(verifiedA, 'available');
    await createListing(verifiedA, 'available');
    await createListing(verifiedB, 'unavailable');

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

    const response = await api(baseUrl, 'GET', '/api/admin/activity', {
      token: adminToken(),
    });

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

    // Independent base totals only: 5 + 3 + 5 + 4 + 1 + 1 + 1 = 20
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
  });
});
