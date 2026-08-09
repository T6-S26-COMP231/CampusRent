/**
 * US-22 — TAC acceptance for Verify student accounts.
 *
 * TAC Test 1 — Review pending account → pending students listed
 * TAC Test 2 — Approve → verified
 * TAC Test 3 — Reject → rejected
 * TAC Test 4 — Request more information → remains pending
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

let server: Server;
let baseUrl: string;
let adminId: number;
let pendingStudentId: number;

async function createUser(
  email: string,
  options: {
    role?: 'student' | 'admin';
    verification_status?: 'pending' | 'verified' | 'rejected';
    first_name?: string;
    last_name?: string;
  } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash',
    first_name: options.first_name ?? 'Test',
    last_name: options.last_name ?? 'User',
    phone: '',
    role: options.role ?? 'student',
    verification_status: options.verification_status ?? 'pending',
    status: 'active',
  });
  return id;
}

function adminToken() {
  return signToken({ id: adminId, email: 'admin@mycentennialcollege.ca', role: 'admin' });
}

before(async () => {
  const uri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  await connectDatabase(uri);

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

beforeEach(async () => {
  await clearDatabase();
  adminId = await createUser('admin@mycentennialcollege.ca', {
    role: 'admin',
    verification_status: 'verified',
    first_name: 'Admin',
    last_name: 'User',
  });
  pendingStudentId = await createUser('pending@mycentennialcollege.ca', {
    role: 'student',
    verification_status: 'pending',
    first_name: 'Pending',
    last_name: 'Student',
  });
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-22 TAC acceptance — verify student accounts', () => {
  test('TAC Test 1 — pending student can be reviewed in admin verifications list', async () => {
    const list = await api(baseUrl, 'GET', '/api/admin/verifications', {
      token: adminToken(),
    });
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].id, pendingStudentId);
    assert.equal(list.data[0].verification_status, 'pending');
    assert.equal(list.data[0].email, 'pending@mycentennialcollege.ca');
  });

  test('TAC Test 2 — admin approves pending student → verified', async () => {
    const response = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'approve' } }
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.verification_status, 'verified');

    const stored = await User.findById(pendingStudentId).lean();
    assert.equal(stored?.verification_status, 'verified');
  });

  test('TAC Test 3 — admin rejects pending student → rejected', async () => {
    const response = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'reject' } }
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.verification_status, 'rejected');

    const stored = await User.findById(pendingStudentId).lean();
    assert.equal(stored?.verification_status, 'rejected');
  });

  test('TAC Test 4 — request more information keeps verification_status pending', async () => {
    const response = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'request_more_info' } }
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.verification_status, 'pending');
    assert.equal(response.data.action, 'request_more_info');

    const stored = await User.findById(pendingStudentId).lean();
    assert.equal(stored?.verification_status, 'pending');

    const list = await api(baseUrl, 'GET', '/api/admin/verifications', {
      token: adminToken(),
    });
    assert.equal(list.status, 200);
    assert.equal(list.data.some((row: { id: number }) => row.id === pendingStudentId), true);
  });

  test('after request more information the student can still be approved', async () => {
    await api(baseUrl, 'PATCH', `/api/admin/verifications/${pendingStudentId}`, {
      token: adminToken(),
      body: { action: 'request_more_info' },
    });

    const approved = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'approve' } }
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.data.verification_status, 'verified');
  });

  test('after request more information the student can still be rejected', async () => {
    await api(baseUrl, 'PATCH', `/api/admin/verifications/${pendingStudentId}`, {
      token: adminToken(),
      body: { action: 'request_more_info' },
    });

    const rejected = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'reject' } }
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.verification_status, 'rejected');
  });

  test('non-admin request-more-information is denied', async () => {
    const studentId = await createUser('verified@mycentennialcollege.ca', {
      verification_status: 'verified',
    });
    const denied = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      {
        token: signToken({
          id: studentId,
          email: 'verified@mycentennialcollege.ca',
          role: 'student',
        }),
        body: { action: 'request_more_info' },
      }
    );
    assert.equal(denied.status, 403);

    const stored = await User.findById(pendingStudentId).lean();
    assert.equal(stored?.verification_status, 'pending');
  });

  test('missing/invalid user returns a safe error', async () => {
    const invalid = await api(baseUrl, 'PATCH', '/api/admin/verifications/not-an-id', {
      token: adminToken(),
      body: { action: 'request_more_info' },
    });
    assert.equal(invalid.status, 400);

    const missing = await api(baseUrl, 'PATCH', '/api/admin/verifications/999999', {
      token: adminToken(),
      body: { action: 'request_more_info' },
    });
    assert.equal(missing.status, 404);
  });

  test('request-more-information never sets verified or rejected', async () => {
    const response = await api(
      baseUrl,
      'PATCH',
      `/api/admin/verifications/${pendingStudentId}`,
      { token: adminToken(), body: { action: 'request_more_info' } }
    );
    assert.equal(response.status, 200);
    assert.notEqual(response.data.verification_status, 'verified');
    assert.notEqual(response.data.verification_status, 'rejected');
    assert.equal(response.data.verification_status, 'pending');
  });
});
