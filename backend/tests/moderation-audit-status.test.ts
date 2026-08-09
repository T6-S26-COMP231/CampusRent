/**
 * US-23.5 — admin authorization, report status persistence, and moderation audit.
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
let ModerationAudit: typeof import('../src/models/ModerationAudit').ModerationAudit;

let server: Server;
let baseUrl: string;
let adminId: number;
let otherAdminId: number;
let reporterId: number;
let ownerId: number;
let listingId: number;

async function createStudent(email: string, firstName: string, lastName: string) {
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
    status: 'active',
  });
  return id;
}

async function createAdmin(email: string, firstName = 'Admin') {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: firstName,
    last_name: 'User',
    phone: '',
    role: 'admin',
    verification_status: 'verified',
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
    description: 'Audit status listing.',
    rental_terms: 'Return next day',
    availability: 'available',
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

async function submitReport(
  body: { target_type: 'listing' | 'user'; target_id: number; reason: string }
) {
  return api(baseUrl, 'POST', '/api/reports', {
    token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    body: { ...body, details: `Details for ${body.reason}` },
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
  otherAdminId = await createAdmin('admin2@mycentennialcollege.ca', 'Second');
  reporterId = await createStudent('reporter@mycentennialcollege.ca', 'Ramika', 'Student');
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Test', 'Test');
  listingId = await createListing(ownerId, 'Campus Camera');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-23.5 administrator authorization and moderation audit status', () => {
  test('unauthenticated and student actions are denied; admin is allowed', async () => {
    const created = await submitReport({
      target_type: 'listing',
      target_id: listingId,
      reason: 'Auth action',
    });
    assert.equal(created.status, 201);

    const unauth = await api(baseUrl, 'POST', `/api/admin/reports/${created.data.id}/actions`, {
      body: { action: 'warn' },
    });
    assert.equal(unauth.status, 401);

    const student = await performAction(created.data.id, 'warn', {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(student.status, 403);

    const admin = await performAction(created.data.id, 'warn');
    assert.equal(admin.status, 200);
    assert.equal(admin.data.action, 'warn');
  });

  test('client cannot spoof administrator_id; audit uses authenticated admin', async () => {
    const created = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Spoof admin',
    });
    const response = await performAction(created.data.id, 'warn', {
      body: { administrator_id: otherAdminId, target_id: reporterId, target_type: 'listing' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.audit.administrator_id, adminId);
    assert.notEqual(response.data.audit.administrator_id, otherAdminId);
    assert.equal(response.data.audit.report_id, created.data.id);
    assert.equal(typeof response.data.audit.created_at, 'string');
  });

  test('new report defaults open; resolve/dismiss persist; warn/remove/suspend leave open', async () => {
    const openReport = await submitReport({
      target_type: 'listing',
      target_id: listingId,
      reason: 'Open default',
    });
    assert.equal(openReport.status, 201);
    assert.equal(openReport.data.status, 'open');

    const listed = await api(baseUrl, 'GET', '/api/admin/reports', { token: adminToken() });
    assert.equal(listed.data[0].report.status, 'open');

    const warnReport = await submitReport({
      target_type: 'listing',
      target_id: listingId,
      reason: 'Warn keeps open',
    });
    const warned = await performAction(warnReport.data.id, 'warn');
    assert.equal(warned.data.report.status, 'open');

    const removeReport = await submitReport({
      target_type: 'listing',
      target_id: listingId,
      reason: 'Remove keeps open',
    });
    const removed = await performAction(removeReport.data.id, 'remove_listing');
    assert.equal(removed.status, 200);
    assert.equal(removed.data.report.status, 'open');
    assert.equal(await Listing.findById(listingId), null);

    listingId = await createListing(ownerId, 'Replacement Camera');
    const suspendReport = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Suspend keeps open',
    });
    const suspended = await performAction(suspendReport.data.id, 'suspend_user');
    assert.equal(suspended.data.report.status, 'open');
    assert.equal((await User.findById(ownerId).lean())!.status, 'suspended');

    // Restore owner for remaining cases.
    await User.findByIdAndUpdate(ownerId, { status: 'active' });

    const resolveReport = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Resolve me',
    });
    const resolved = await performAction(resolveReport.data.id, 'resolve');
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.report.status, 'resolved');
    assert.equal((await Report.findById(resolveReport.data.id).lean())!.status, 'resolved');

    const dismissReport = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Dismiss me',
    });
    const dismissed = await performAction(dismissReport.data.id, 'dismiss');
    assert.equal(dismissed.status, 200);
    assert.equal(dismissed.data.report.status, 'dismissed');
    assert.equal((await Report.findById(dismissReport.data.id).lean())!.status, 'dismissed');
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');

    const detailResolved = await api(
      baseUrl,
      'GET',
      `/api/admin/reports/${resolveReport.data.id}`,
      { token: adminToken() }
    );
    assert.equal(detailResolved.data.report.status, 'resolved');

    const detailDismissed = await api(
      baseUrl,
      'GET',
      `/api/admin/reports/${dismissReport.data.id}`,
      { token: adminToken() }
    );
    assert.equal(detailDismissed.data.report.status, 'dismissed');
  });

  test('every moderation action creates an audit record', async () => {
    const listingA = listingId;
    const listingB = await createListing(ownerId, 'Second listing');

    const cases: Array<{ action: string; body: { target_type: 'listing' | 'user'; target_id: number; reason: string } }> =
      [
        {
          action: 'warn',
          body: { target_type: 'listing', target_id: listingA, reason: 'Audit warn' },
        },
        {
          action: 'remove_listing',
          body: { target_type: 'listing', target_id: listingB, reason: 'Audit remove' },
        },
        {
          action: 'suspend_user',
          body: { target_type: 'user', target_id: ownerId, reason: 'Audit suspend' },
        },
        {
          action: 'dismiss',
          body: { target_type: 'user', target_id: reporterId, reason: 'Audit dismiss' },
        },
        {
          action: 'resolve',
          body: { target_type: 'user', target_id: reporterId, reason: 'Audit resolve' },
        },
      ];

    for (const item of cases) {
      if (item.action === 'suspend_user') {
        await User.findByIdAndUpdate(ownerId, { status: 'active' });
      }
      const created = await submitReport(item.body);
      const response = await performAction(created.data.id, item.action);
      assert.equal(response.status, 200, item.action);
      assert.equal(response.data.audit.action, item.action);
      assert.equal(response.data.audit.report_id, created.data.id);
      assert.equal(response.data.audit.administrator_id, adminId);
      assert.equal(typeof response.data.audit.id, 'number');
      assert.equal(typeof response.data.audit.created_at, 'string');

      const stored = await ModerationAudit.findById(response.data.audit.id).lean();
      assert.ok(stored);
      assert.equal(stored!.action, item.action);
      assert.equal(stored!.report_id, created.data.id);
      assert.equal(stored!.administrator_id, adminId);
    }

    assert.equal(await ModerationAudit.countDocuments(), cases.length);
  });

  test('warn does not claim notification delivery; dismiss does not punish target', async () => {
    const warnCreated = await submitReport({
      target_type: 'listing',
      target_id: listingId,
      reason: 'No notification',
    });
    const warned = await performAction(warnCreated.data.id, 'warn');
    assert.equal(warned.data.message.includes('no user notification'), true);
    assert.ok(await Listing.findById(listingId));

    const dismissCreated = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'No punish',
    });
    await performAction(dismissCreated.data.id, 'dismiss');
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');
    assert.ok(await Listing.findById(listingId));
  });

  test('errors stay clean for invalid id, missing report, unsupported action, mismatch', async () => {
    const badId = await api(baseUrl, 'POST', '/api/admin/reports/abc/actions', {
      token: adminToken(),
      body: { action: 'warn' },
    });
    assert.equal(badId.status, 400);

    const missing = await performAction(99999, 'warn');
    assert.equal(missing.status, 404);

    const created = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Mismatch',
    });
    const unsupported = await performAction(created.data.id, 'shadow_ban');
    assert.equal(unsupported.status, 400);

    const mismatch = await performAction(created.data.id, 'remove_listing');
    assert.equal(mismatch.status, 400);
    assert.ok(await User.findById(ownerId));
  });

  test('suspended student remains blocked after suspend_user action endpoint', async () => {
    const created = await submitReport({
      target_type: 'user',
      target_id: ownerId,
      reason: 'Block access',
    });
    const response = await performAction(created.data.id, 'suspend_user');
    assert.equal(response.status, 200);
    assert.equal(response.data.report.status, 'open');

    const blocked = await api(baseUrl, 'GET', '/api/listings', {
      token: studentToken(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(blocked.status, 403);
    assert.match(String(blocked.data.error ?? ''), /suspended/i);
  });
});
