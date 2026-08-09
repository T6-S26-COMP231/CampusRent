/**
 * US-23.7 — Team6 TAC acceptance mapping for moderation.
 *
 * TAC Test 1 — View submitted reports → Reports displayed
 * TAC Test 2 — Review reported listing → Listing information displayed
 * TAC Test 3 — Remove violating listing → Listing removed
 * TAC Test 4 — Suspend violating user → User access restricted
 * TAC Test 5 — Resolve report → Status changes to Resolved
 *
 * Also covers authorization regression, audit fields for acceptance actions,
 * and the US-20 → US-23 cross-story path (supports US-20 Test 4 technically).
 *
 * Broader low-level coverage remains in admin-reports.test.ts,
 * moderation-actions.test.ts, and moderation-audit-status.test.ts.
 *
 * US-20 TAC Test 4 remains PENDING for production/manual acceptance after deploy.
 * Do NOT claim Overall Result: PASSED for US-20 Test 4 from this suite alone.
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

/**
 * Keep aligned with us-20-acceptance.test.ts.
 * Automated US-23 proof must not flip US-20 Test 4 to PASSED.
 */
const US_20_TAC_TEST_4_STATUS = 'PENDING US-23' as const;

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;
let Listing: typeof import('../src/models/Listing').Listing;
let Report: typeof import('../src/models/Report').Report;
let ModerationAudit: typeof import('../src/models/ModerationAudit').ModerationAudit;

let server: Server;
let baseUrl: string;
let adminId: number;
let reporterId: number;
let ownerId: number;
let listingId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: { status?: 'active' | 'suspended' } = {}
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
    verification_status: 'verified',
    status: options.status ?? 'active',
  });
  return id;
}

async function createAdmin(email: string) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
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
  owner: number,
  title: string,
  options: {
    category?: string;
    description?: string;
    availability?: 'available' | 'unavailable';
  } = {}
) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title,
    category: options.category ?? 'Electronics',
    description: options.description ?? 'US-23 acceptance listing description.',
    rental_terms: 'Return next day',
    availability: options.availability ?? 'available',
    images: [],
  });
  return id;
}

function studentToken(userId: number, email: string) {
  return signToken({ id: userId, email, role: 'student' });
}

function adminToken(userId = adminId, email = 'admin@mycentennialcollege.ca') {
  return signToken({ id: userId, email, role: 'admin' });
}

async function submitListingReport(targetListingId: number, reason: string) {
  return api(baseUrl, 'POST', '/api/reports', {
    token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    body: {
      target_type: 'listing',
      target_id: targetListingId,
      reason,
      details: `Details for ${reason}`,
    },
  });
}

async function submitUserReport(targetUserId: number, reason: string) {
  return api(baseUrl, 'POST', '/api/reports', {
    token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    body: {
      target_type: 'user',
      target_id: targetUserId,
      reason,
      details: `Details for ${reason}`,
    },
  });
}

async function performAction(
  reportId: number,
  action: string,
  options: { token?: string; body?: Record<string, unknown> } = {}
) {
  return api(baseUrl, 'POST', `/api/admin/reports/${reportId}/actions`, {
    token: options.token ?? adminToken(),
    body: { action, ...(options.body ?? {}) },
  });
}

function assertAuditShape(
  audit: {
    report_id: number;
    administrator_id: number;
    action: string;
    created_at: string;
    id?: number;
  },
  expected: { report_id: number; administrator_id: number; action: string }
) {
  assert.equal(audit.report_id, expected.report_id);
  assert.equal(audit.administrator_id, expected.administrator_id);
  assert.equal(audit.action, expected.action);
  assert.equal(typeof audit.created_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(audit.created_at)));
  assert.equal(typeof audit.id, 'number');
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
  ({ ModerationAudit } = await import('../src/models/ModerationAudit'));
  await connectDatabase(uri);
  await Report.syncIndexes();
  await ModerationAudit.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  adminId = await createAdmin('admin@mycentennialcollege.ca');
  reporterId = await createStudent('reporter@mycentennialcollege.ca', 'Ramika', 'Student');
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Test', 'Owner');
  listingId = await createListing(ownerId, 'Campus Camera', {
    category: 'Electronics',
    description: 'A campus camera for short rentals.',
    availability: 'available',
  });
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-23 TAC acceptance tests', () => {
  test('TAC Test 1 — View submitted reports: US-20 report appears for admin; student denied', async () => {
    const submitted = await submitListingReport(listingId, 'Misleading photos');
    assert.equal(submitted.status, 201);
    assert.equal(typeof submitted.data.id, 'number');

    const stored = await Report.findById(submitted.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.reporter_id, reporterId);
    assert.equal(stored!.target_type, 'listing');
    assert.equal(stored!.target_id, listingId);
    assert.equal(stored!.reason, 'Misleading photos');

    const unauth = await api(baseUrl, 'GET', '/api/admin/reports');
    assert.equal(unauth.status, 401);

    const studentDenied = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(studentDenied.status, 403);

    const listed = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.data), true);
    assert.equal(listed.data.length, 1);

    const row = listed.data[0];
    assert.equal(row.report.report_id, submitted.data.id);
    assert.equal(row.report.report_id, stored!._id);
    assert.equal(row.report.reporter_id, stored!.reporter_id);
    assert.equal(row.report.target_type, stored!.target_type);
    assert.equal(row.report.target_id, stored!.target_id);
    assert.equal(row.report.reason, stored!.reason);
    assert.equal(row.report.details, stored!.details);
    assert.equal(row.report.status, 'open');
  });

  test('TAC Test 2 — Review reported listing: admin detail shows real listing fields', async () => {
    const submitted = await submitListingReport(listingId, 'Review listing');
    assert.equal(submitted.status, 201);

    const detail = await api(baseUrl, 'GET', `/api/admin/reports/${submitted.data.id}`, {
      token: adminToken(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.report.report_id, submitted.data.id);
    assert.equal(detail.data.report.target_type, 'listing');
    assert.equal(detail.data.report.target_id, listingId);
    assert.equal(detail.data.report.reason, 'Review listing');
    assert.equal(detail.data.report.details, 'Details for Review listing');
    assert.equal(detail.data.report.reporter_label, 'Ramika Student');

    assert.equal(detail.data.target.target_type, 'listing');
    assert.equal(detail.data.target.exists, true);
    assert.equal(detail.data.target.listing_id, listingId);
    assert.equal(detail.data.target.title, 'Campus Camera');
    assert.equal(detail.data.target.owner_id, ownerId);
    assert.equal(detail.data.target.owner_label, 'Test Owner');
    assert.equal(detail.data.target.category, 'Electronics');
    assert.equal(detail.data.target.availability, 'available');
    assert.equal(detail.data.target.description_preview, 'A campus camera for short rentals.');
  });

  test('TAC Test 3 — Remove violating listing via remove_listing; report stays open', async () => {
    const otherListingId = await createListing(ownerId, 'Keep Me');
    const submitted = await submitListingReport(listingId, 'Remove this listing');
    assert.equal(submitted.status, 201);

    const removed = await performAction(submitted.data.id, 'remove_listing', {
      body: {
        // Spoof fields must not control target identity.
        target_id: otherListingId,
        target_type: 'user',
        administrator_id: reporterId,
      },
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.action, 'remove_listing');
    assert.equal(removed.data.report.status, 'open');
    assert.equal(removed.data.target.exists, false);

    assertAuditShape(removed.data.audit, {
      report_id: submitted.data.id,
      administrator_id: adminId,
      action: 'remove_listing',
    });
    assert.notEqual(removed.data.audit.administrator_id, reporterId);

    const auditRow = await ModerationAudit.findById(removed.data.audit.id).lean();
    assert.ok(auditRow);
    assert.equal(auditRow!.report_id, submitted.data.id);
    assert.equal(auditRow!.administrator_id, adminId);
    assert.equal(auditRow!.action, 'remove_listing');
    assert.ok(auditRow!.created_at);

    assert.equal(await Listing.findById(listingId), null);
    assert.ok(await Listing.findById(otherListingId));

    const browse = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(browse.status, 404);

    const reportStillExists = await Report.findById(submitted.data.id).lean();
    assert.ok(reportStillExists);
    assert.equal(reportStillExists!.status, 'open');
    assert.equal(reportStillExists!.target_id, listingId);
  });

  test('TAC Test 4 — Suspend violating user; access restricted; others unaffected', async () => {
    const bystanderId = await createStudent(
      'bystander@mycentennialcollege.ca',
      'Safe',
      'Student'
    );
    const submitted = await submitUserReport(ownerId, 'Suspend this user');
    assert.equal(submitted.status, 201);

    const suspended = await performAction(submitted.data.id, 'suspend_user', {
      body: {
        target_id: bystanderId,
        target_type: 'listing',
        administrator_id: bystanderId,
      },
    });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.data.action, 'suspend_user');
    assert.equal(suspended.data.report.status, 'open');
    assert.equal(suspended.data.target.target_type, 'user');
    assert.equal(suspended.data.target.account_status, 'suspended');

    assertAuditShape(suspended.data.audit, {
      report_id: submitted.data.id,
      administrator_id: adminId,
      action: 'suspend_user',
    });

    const owner = await User.findById(ownerId).lean();
    assert.equal(owner!.status, 'suspended');
    const bystander = await User.findById(bystanderId).lean();
    assert.equal(bystander!.status, 'active');

    const blocked = await api(baseUrl, 'GET', '/api/listings', {
      token: studentToken(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.error, 'Account suspended');

    const bystanderOk = await api(baseUrl, 'GET', '/api/listings', {
      token: studentToken(bystanderId, 'bystander@mycentennialcollege.ca'),
    });
    assert.equal(bystanderOk.status, 200);

    const adminStillOk = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(adminStillOk.status, 200);
  });

  test('TAC Test 5 — Resolve report: status open → resolved and visible to admin', async () => {
    const submitted = await submitListingReport(listingId, 'Resolve me');
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.status, 'open');

    const before = await Report.findById(submitted.data.id).lean();
    assert.equal(before!.status, 'open');

    const resolved = await performAction(submitted.data.id, 'resolve');
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.action, 'resolve');
    assert.equal(resolved.data.report.status, 'resolved');

    assertAuditShape(resolved.data.audit, {
      report_id: submitted.data.id,
      administrator_id: adminId,
      action: 'resolve',
    });

    const stored = await Report.findById(submitted.data.id).lean();
    assert.ok(stored);
    assert.equal(stored!.status, 'resolved');

    const listed = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    const listRow = listed.data.find(
      (row: { report: { report_id: number } }) => row.report.report_id === submitted.data.id
    );
    assert.ok(listRow);
    assert.equal(listRow.report.status, 'resolved');

    const detail = await api(baseUrl, 'GET', `/api/admin/reports/${submitted.data.id}`, {
      token: adminToken(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.report.status, 'resolved');
  });

  test('authorization regression: unauthenticated/student denied; admin allowed for list/detail/action', async () => {
    const submitted = await submitListingReport(listingId, 'Auth regression');
    assert.equal(submitted.status, 201);
    const reportId = submitted.data.id as number;
    const student = studentToken(reporterId, 'reporter@mycentennialcollege.ca');

    const listUnauth = await api(baseUrl, 'GET', '/api/admin/reports');
    assert.equal(listUnauth.status, 401);
    const detailUnauth = await api(baseUrl, 'GET', `/api/admin/reports/${reportId}`);
    assert.equal(detailUnauth.status, 401);
    const actionUnauth = await api(baseUrl, 'POST', `/api/admin/reports/${reportId}/actions`, {
      body: { action: 'warn' },
    });
    assert.equal(actionUnauth.status, 401);

    const listStudent = await api(baseUrl, 'GET', '/api/admin/reports', { token: student });
    assert.equal(listStudent.status, 403);
    const detailStudent = await api(baseUrl, 'GET', `/api/admin/reports/${reportId}`, {
      token: student,
    });
    assert.equal(detailStudent.status, 403);
    const actionStudent = await performAction(reportId, 'warn', { token: student });
    assert.equal(actionStudent.status, 403);

    const listAdmin = await api(baseUrl, 'GET', '/api/admin/reports', { token: adminToken() });
    assert.equal(listAdmin.status, 200);
    const detailAdmin = await api(baseUrl, 'GET', `/api/admin/reports/${reportId}`, {
      token: adminToken(),
    });
    assert.equal(detailAdmin.status, 200);
    const actionAdmin = await performAction(reportId, 'warn');
    assert.equal(actionAdmin.status, 200);
    assert.equal(actionAdmin.data.action, 'warn');
  });

  test('US-20 → US-23 cross-story: submitted report readable in admin queue (Test 4 still PENDING deploy)', async () => {
    // Technical bridge for US-20 Test 4 — does not claim production acceptance passed.
    assert.equal(US_20_TAC_TEST_4_STATUS, 'PENDING US-23');

    const submitted = await api(baseUrl, 'POST', '/api/reports', {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: listingId,
        reason: '  Cross-story spam  ',
        details: '  Submitted through US-20 path.  ',
      },
    });
    assert.equal(submitted.status, 201);

    const queue = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(queue.status, 200);
    const row = queue.data.find(
      (item: { report: { report_id: number } }) => item.report.report_id === submitted.data.id
    );
    assert.ok(row, 'US-20 submitted report must appear in US-23 admin queue');
    assert.equal(row.report.reason, 'Cross-story spam');
    assert.equal(row.report.details, 'Submitted through US-20 path.');
    assert.equal(row.report.target_id, listingId);
    assert.equal(row.report.reporter_id, reporterId);

    // Explicit: automated technical proof must not flip US-20 Test 4 to PASSED.
    assert.equal(US_20_TAC_TEST_4_STATUS, 'PENDING US-23');
  });
});
