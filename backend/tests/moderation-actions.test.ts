/**
 * US-23.4 — dismiss / warn / remove-listing / suspend-user domain logic.
 * HTTP action routes and report-status/audit persistence belong to later tasks.
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
let executeModerationAction: typeof import('../src/utils/moderationActions').executeModerationAction;
let ModerationActionError: typeof import('../src/utils/moderationActions').ModerationActionError;

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
  options: { verification_status?: 'pending' | 'verified' | 'rejected'; status?: 'active' | 'suspended' } = {}
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
    status: options.status ?? 'active',
  });
  return id;
}

async function createAdmin() {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email: 'admin@mycentennialcollege.ca',
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
    description: 'Moderation action target listing.',
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

async function submitReport(
  token: string,
  body: { target_type: 'listing' | 'user'; target_id: number; reason: string }
) {
  return api(baseUrl, 'POST', '/api/reports', {
    token,
    body: {
      ...body,
      details: `Details for ${body.reason}`,
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
  ({
    executeModerationAction,
    ModerationActionError,
  } = await import('../src/utils/moderationActions'));
  await connectDatabase(uri);
  await Report.syncIndexes();

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  adminId = await createAdmin();
  reporterId = await createStudent('reporter@mycentennialcollege.ca', 'Ramika', 'Student');
  ownerId = await createStudent('owner@mycentennialcollege.ca', 'Test', 'Test');
  listingId = await createListing(ownerId, 'Campus Camera');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-23.4 moderation action logic', () => {
  test('listing report can remove its own listing via report.target_id', async () => {
    const created = await submitReport(studentToken(reporterId, 'reporter@mycentennialcollege.ca'), {
      target_type: 'listing',
      target_id: listingId,
      reason: 'Remove this listing',
    });
    assert.equal(created.status, 201);

    const result = await executeModerationAction(created.data.id, 'remove_listing');
    assert.equal(result.action, 'remove_listing');
    assert.equal(result.target_id, listingId);
    assert.equal(result.target_mutated, true);
    assert.equal(result.report_status_persisted, false);

    assert.equal(await Listing.findById(listingId), null);

    const browse = await api(baseUrl, 'GET', `/api/listings/${listingId}`, {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(browse.status, 404);
  });

  test('remove_listing rejects user reports and missing listings', async () => {
    const userReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'user', target_id: ownerId, reason: 'User only' }
    );
    assert.equal(userReport.status, 201);

    await assert.rejects(
      () => executeModerationAction(userReport.data.id, 'remove_listing'),
      (error: unknown) =>
        error instanceof ModerationActionError &&
        error.statusCode === 400 &&
        /listing reports/i.test(error.message)
    );
    assert.ok(await User.findById(ownerId));

    const listingReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'listing', target_id: listingId, reason: 'Gone listing' }
    );
    await Listing.findByIdAndDelete(listingId);

    await assert.rejects(
      () => executeModerationAction(listingReport.data.id, 'remove_listing'),
      (error: unknown) =>
        error instanceof ModerationActionError &&
        error.statusCode === 404 &&
        /listing not found/i.test(error.message)
    );
  });

  test('removal uses report.target_id rather than an arbitrary client id', async () => {
    const otherListingId = await createListing(ownerId, 'Other Item');
    const created = await submitReport(studentToken(reporterId, 'reporter@mycentennialcollege.ca'), {
      target_type: 'listing',
      target_id: listingId,
      reason: 'Target lock',
    });

    // Service API has no client target override — only report id + action.
    const result = await executeModerationAction(created.data.id, 'remove_listing');
    assert.equal(result.target_id, listingId);
    assert.equal(await Listing.findById(listingId), null);
    assert.ok(await Listing.findById(otherListingId));
  });

  test('user report can suspend its own user; suspension blocks protected access', async () => {
    const created = await submitReport(studentToken(reporterId, 'reporter@mycentennialcollege.ca'), {
      target_type: 'user',
      target_id: ownerId,
      reason: 'Suspend owner',
    });
    assert.equal(created.status, 201);

    const before = await User.findById(ownerId).lean();
    assert.equal(before!.status, 'active');

    const result = await executeModerationAction(created.data.id, 'suspend_user');
    assert.equal(result.action, 'suspend_user');
    assert.equal(result.target_id, ownerId);
    assert.equal(result.target_mutated, true);

    const after = await User.findById(ownerId).lean();
    assert.equal(after!.status, 'suspended');

    const blocked = await api(baseUrl, 'GET', '/api/listings', {
      token: studentToken(ownerId, 'owner@mycentennialcollege.ca'),
    });
    assert.equal(blocked.status, 403);
    assert.match(String(blocked.data.error ?? ''), /suspended/i);

    const activeStillOk = await api(baseUrl, 'GET', '/api/listings', {
      token: studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
    });
    assert.equal(activeStillOk.status, 200);

    const adminOk = await api(baseUrl, 'GET', '/api/admin/reports', {
      token: adminToken(),
    });
    assert.equal(adminOk.status, 200);
  });

  test('suspend_user rejects listing reports and uses report.target_id only', async () => {
    const listingReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'listing', target_id: listingId, reason: 'Not a user' }
    );

    await assert.rejects(
      () => executeModerationAction(listingReport.data.id, 'suspend_user'),
      (error: unknown) =>
        error instanceof ModerationActionError &&
        error.statusCode === 400 &&
        /user reports/i.test(error.message)
    );
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');

    const otherStudentId = await createStudent(
      'other@mycentennialcollege.ca',
      'Other',
      'Student'
    );
    const userReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'user', target_id: ownerId, reason: 'Only owner' }
    );
    await executeModerationAction(userReport.data.id, 'suspend_user');
    assert.equal((await User.findById(ownerId).lean())!.status, 'suspended');
    assert.equal((await User.findById(otherStudentId).lean())!.status, 'active');
  });

  test('warn accepts listing and user reports without inventing notifications or mutations', async () => {
    const listingReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'listing', target_id: listingId, reason: 'Warn listing' }
    );
    const userReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'user', target_id: ownerId, reason: 'Warn user' }
    );

    const listingWarn = await executeModerationAction(listingReport.data.id, 'warn');
    const userWarn = await executeModerationAction(userReport.data.id, 'warn');

    assert.equal(listingWarn.notification_delivered, false);
    assert.equal(userWarn.notification_delivered, false);
    assert.equal(listingWarn.target_mutated, false);
    assert.equal(userWarn.target_mutated, false);
    assert.match(listingWarn.message, /no user notification/i);

    assert.ok(await Listing.findById(listingId));
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');
  });

  test('dismiss performs no punitive target mutation', async () => {
    const listingReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'listing', target_id: listingId, reason: 'Dismiss listing' }
    );
    const userReport = await submitReport(
      studentToken(reporterId, 'reporter@mycentennialcollege.ca'),
      { target_type: 'user', target_id: ownerId, reason: 'Dismiss user' }
    );

    const dismissedListing = await executeModerationAction(listingReport.data.id, 'dismiss');
    const dismissedUser = await executeModerationAction(userReport.data.id, 'dismiss');

    assert.equal(dismissedListing.target_mutated, false);
    assert.equal(dismissedUser.target_mutated, false);
    assert.equal(dismissedListing.report_status_persisted, false);
    assert.ok(await Listing.findById(listingId));
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');
    assert.equal(await Report.countDocuments(), 2);
  });

  test('unsupported action and missing report are rejected; mismatch cannot mutate unrelated data', async () => {
    const created = await submitReport(studentToken(reporterId, 'reporter@mycentennialcollege.ca'), {
      target_type: 'listing',
      target_id: listingId,
      reason: 'Validation',
    });

    await assert.rejects(
      () => executeModerationAction(created.data.id, 'shadow_ban'),
      (error: unknown) => error instanceof ModerationActionError && error.statusCode === 400
    );

    await assert.rejects(
      () => executeModerationAction(99999, 'warn'),
      (error: unknown) => error instanceof ModerationActionError && error.statusCode === 404
    );

    const otherListingId = await createListing(ownerId, 'Safe listing');
    await executeModerationAction(created.data.id, 'remove_listing');
    assert.equal(await Listing.findById(listingId), null);
    assert.ok(await Listing.findById(otherListingId));
    assert.equal((await User.findById(ownerId).lean())!.status, 'active');
  });
});
