/**
 * US-23.3 — admin report-list and report-detail APIs.
 * Reads the same Report documents created by POST /api/reports (US-20).
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
let adminId: number;
let reporterId: number;
let ownerId: number;
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

async function createListing(owner: number, title: string) {
  const id = await nextId('listings');
  await Listing.create({
    _id: id,
    owner_id: owner,
    title,
    category: 'Electronics',
    description: 'Admin report target listing description.',
    rental_terms: 'Return next day',
    availability: 'available',
    images: [],
  });
  return id;
}

function studentToken(userId: number, email: string) {
  return signToken({ id: userId, email, role: 'student' });
}

function adminToken() {
  return signToken({ id: adminId, email: 'admin@mycentennialcollege.ca', role: 'admin' });
}

async function submitListingReport(token: string, targetListingId: number, reason: string) {
  return api(baseUrl, 'POST', '/api/reports', {
    token,
    body: {
      target_type: 'listing',
      target_id: targetListingId,
      reason,
      details: `Details for ${reason}`,
    },
  });
}

async function submitUserReport(token: string, targetUserId: number, reason: string) {
  return api(baseUrl, 'POST', '/api/reports', {
    token,
    body: {
      target_type: 'user',
      target_id: targetUserId,
      reason,
      details: `Details for ${reason}`,
    },
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
  await connectDatabase(uri);
  await Report.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  adminId = await createAdmin('admin@mycentennialcollege.ca');
  reporterId = await createStudent('reporter@mycentennialcollege.ca', 'Ramika', 'Student');
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Test', 'Test');
  listingId = await createListing(ownerId, 'Campus Camera');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-23.3 admin report-list and report-detail APIs', () => {
  test('unauthenticated report-list request is denied with 401', async () => {
    const response = await api(baseUrl, 'GET', '/api/admin/reports');
    assert.equal(response.status, 401);
  });

  test('verified student cannot list reports (403)', async () => {
    const response = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);
  });

  test('admin can list reports; submitted listing and user reports appear', async () => {
    const reporterToken = studentToken(reporterId, 'reporter@mycentennialcollege.ca');
    const listingSubmit = await submitListingReport(reporterToken, listingId, 'Misleading photos');
    const userSubmit = await submitUserReport(reporterToken, ownerId, 'Harassment');
    assert.equal(listingSubmit.status, 201);
    assert.equal(userSubmit.status, 201);

    const response = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(response.data), true);
    assert.equal(response.data.length, 2);

    const ids = response.data.map((row: { report: { report_id: number } }) => row.report.report_id);
    assert.ok(ids.includes(listingSubmit.data.id));
    assert.ok(ids.includes(userSubmit.data.id));

    const listingRow = response.data.find(
      (row: { report: { report_id: number } }) => row.report.report_id === listingSubmit.data.id
    );
    assert.equal(listingRow.report.target_type, 'listing');
    assert.equal(listingRow.report.target_id, listingId);
    assert.equal(listingRow.report.reason, 'Misleading photos');
    assert.equal(listingRow.report.details, 'Details for Misleading photos');
    assert.equal(listingRow.report.status, 'open');
    assert.equal(listingRow.target.target_type, 'listing');
    assert.equal(listingRow.target.exists, true);
    assert.equal(listingRow.target.title, 'Campus Camera');
  });

  test('list data matches persisted US-20 Report documents', async () => {
    const created = await submitListingReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      listingId,
      'Spam listing'
    );
    assert.equal(created.status, 201);

    const stored = await Report.findById(created.data.id).lean();
    assert.ok(stored);

    const response = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);

    const row = response.data[0];
    assert.equal(row.report.report_id, stored!._id);
    assert.equal(row.report.reporter_id, stored!.reporter_id);
    assert.equal(row.report.target_type, stored!.target_type);
    assert.equal(row.report.target_id, stored!.target_id);
    assert.equal(row.report.reason, stored!.reason);
    assert.equal(row.report.details, stored!.details);
    assert.equal(row.report.created_at, stored!.created_at.toISOString());
  });

  test('reporter and listing/user target resolution work; no sensitive fields', async () => {
    const reporterToken = studentToken(reporterId, 'reporter@mycentennialcollege.ca');
    await submitListingReport(reporterToken, listingId, 'Listing issue');
    await submitUserReport(reporterToken, ownerId, 'User issue');

    const response = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(response.status, 200);

    for (const row of response.data) {
      assert.equal(row.report.reporter_label, 'Ramika Student');
      assert.ok(row.report.reporter);
      assert.equal(row.report.reporter.id, reporterId);
      assert.equal(row.report.reporter.email, 'reporter@mycentennialcollege.ca');
      assert.equal(row.report.reporter.password_hash, undefined);
      assert.equal(row.report.reporter.password, undefined);
      assert.equal(JSON.stringify(row).includes('password_hash'), false);
      assert.equal(JSON.stringify(row).includes('test-password-hash'), false);
    }

    const listingRow = response.data.find(
      (row: { report: { target_type: string } }) => row.report.target_type === 'listing'
    );
    assert.equal(listingRow.target.title, 'Campus Camera');
    assert.equal(listingRow.target.owner_label, 'Test Test');
    assert.equal(listingRow.target.category, 'Electronics');
    assert.equal(listingRow.target.availability, 'available');
    assert.match(listingRow.target.description_preview, /Admin report target/i);

    const userRow = response.data.find(
      (row: { report: { target_type: string } }) => row.report.target_type === 'user'
    );
    assert.equal(userRow.target.display_name, 'Test Test');
    assert.equal(userRow.target.email, 'owner@mycentennialcollege.ca');
    assert.equal(userRow.target.verification_status, 'verified');
    assert.equal(userRow.target.account_status, 'active');
  });

  test('missing listing target still returns report with exists=false', async () => {
    const created = await submitListingReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      listingId,
      'Remove target later'
    );
    assert.equal(created.status, 201);
    await Listing.findByIdAndDelete(listingId);

    const list = await api(baseUrl, 'GET', '/api/admin/reports', { token: adminToken() });
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].report.report_id, created.data.id);
    assert.equal(list.data[0].target.exists, false);
    assert.equal(list.data[0].target.title, null);

    const detail = await api(baseUrl, 'GET', `/api/admin/reports/${created.data.id}`, {
      token: adminToken(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.report.report_id, created.data.id);
    assert.equal(detail.data.target.exists, false);
  });

  test('missing user target still returns report with exists=false', async () => {
    const created = await submitUserReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      ownerId,
      'Remove user later'
    );
    assert.equal(created.status, 201);
    await User.findByIdAndDelete(ownerId);

    const detail = await api(baseUrl, 'GET', `/api/admin/reports/${created.data.id}`, {
      token: adminToken(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.report.report_id, created.data.id);
    assert.equal(detail.data.target.target_type, 'user');
    assert.equal(detail.data.target.exists, false);
    assert.equal(detail.data.target.display_name, null);
    assert.equal(detail.data.target.email, null);
  });

  test('list ordering is newest-first', async () => {
    const token = studentToken(reporterId, 'reporter@mycentennialcollege.ca');
    const older = await submitListingReport(token, listingId, 'Older report');
    const newer = await submitUserReport(token, ownerId, 'Newer report');
    assert.equal(older.status, 201);
    assert.equal(newer.status, 201);

    // Ensure created_at ordering is unambiguous even if inserts share a clock tick.
    await Report.findByIdAndUpdate(older.data.id, {
      created_at: new Date('2026-08-08T10:00:00.000Z'),
    });
    await Report.findByIdAndUpdate(newer.data.id, {
      created_at: new Date('2026-08-08T12:00:00.000Z'),
    });

    const response = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data[0].report.report_id, newer.data.id);
    assert.equal(response.data[1].report.report_id, older.data.id);
  });

  test('valid report detail returns 200 with full review payload', async () => {
    const created = await submitUserReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      ownerId,
      'Detail check'
    );
    assert.equal(created.status, 201);

    const response = await api(baseUrl, 'GET', `/api/admin/reports/${created.data.id}`, {
      token: adminToken(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.report.report_id, created.data.id);
    assert.equal(response.data.report.reason, 'Detail check');
    assert.equal(response.data.report.details, 'Details for Detail check');
    assert.equal(response.data.report.status, 'open');
    assert.equal(response.data.target.target_type, 'user');
    assert.equal(response.data.target.user_id, ownerId);
    assert.equal(response.data.target.exists, true);
  });

  test('missing report returns 404; malformed id returns 400', async () => {
    const missing = await api(baseUrl, 'GET', '/api/admin/reports/99999', {
      token: adminToken(),
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, 'Report not found');

    const malformed = await api(baseUrl, 'GET', '/api/admin/reports/abc', {
      token: adminToken(),
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.error, 'Invalid report id');

    const zero = await api(baseUrl, 'GET', '/api/admin/reports/0', {
      token: adminToken(),
    });
    assert.equal(zero.status, 400);
  });

  test('verified student cannot access report detail', async () => {
    const created = await submitListingReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      listingId,
      'Auth detail check'
    );
    assert.equal(created.status, 201);

    const response = await api(baseUrl, 'GET', `/api/admin/reports/${created.data.id}`, {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(response.status, 403);
  });
});
