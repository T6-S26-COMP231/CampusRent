/**
 * US-20.4 — submit-report API (POST /api/reports).
 * Full target existence / business validation belongs to US-20.5.
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
let Report: typeof import('../src/models/Report').Report;

let server: Server;
let baseUrl: string;
let reporterId: number;
let otherStudentId: number;

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
        target_id: 12,
        reason: 'Spam',
        details: 'Looks fake',
      },
    });
    assert.equal(response.status, 401);
  });

  test('valid verified student can reach the endpoint', async () => {
    const response = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: 12,
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
        target_id: 42,
        reason: '  Misleading listing  ',
        details: '  Photos look staged.  ',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.target_type, 'listing');
    assert.equal(response.data.target_id, 42);
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
        target_id: 7,
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
        target_id: 99,
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
    assert.equal(later!.target_id, 99);
    assert.equal(later!.reason, 'Scam concern');
    assert.equal(later!.details, 'Asked for off-platform payment.');
    assert.ok(later!.created_at instanceof Date);
  });

  test('multiple reports persist independently', async () => {
    const first = await api(baseUrl, 'POST', '/api/reports', {
      token: tokenFor(reporterId, 'reporter@mycentennialcollege.ca'),
      body: {
        target_type: 'listing',
        target_id: 1,
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
      body: { target_id: 1, reason: 'x', details: 'y' },
    });
    assert.equal(missingType.status, 400);

    const missingTarget = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', reason: 'x', details: 'y' },
    });
    assert.equal(missingTarget.status, 400);

    const missingReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: 1, details: 'y' },
    });
    assert.equal(missingReason.status, 400);

    const missingDetails = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: 1, reason: 'x' },
    });
    assert.equal(missingDetails.status, 400);

    const blankReason = await api(baseUrl, 'POST', '/api/reports', {
      token,
      body: { target_type: 'listing', target_id: 1, reason: '   ', details: 'y' },
    });
    assert.equal(blankReason.status, 400);

    assert.equal(await Report.countDocuments(), 0);
  });
});
