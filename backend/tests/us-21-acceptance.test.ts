/**
 * US-21.7 — Team6 TAC acceptance mapping for Manage profile information.
 *
 * TAC Test 1 — View profile → Current profile displayed
 * TAC Test 2 — Update profile → Changes saved successfully
 * TAC Test 3 — Submit invalid information → Validation error displayed
 * TAC Test 4 — View verification status → Current status displayed
 *
 * Also covers unauthorized access, owner isolation, and protected-field
 * boundaries at the acceptance level.
 *
 * Broader low-level coverage remains in profile-api.test.ts (US-21.3 / US-21.4).
 *
 * Do NOT claim production Overall Result: PASSED — US-21.8 (#177) owns
 * PR merge, deployment, and manual deployed acceptance.
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

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_21_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-21.8' as const;
export const US_21_PRODUCTION_ACCEPTANCE_REASON =
  'US-21.8 (#177) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

let connectDatabase: (uri?: string) => Promise<unknown>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;

let server: Server;
let baseUrl: string;
let studentAId: number;
let studentBId: number;
let adminId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: {
    phone?: string;
    verification_status?: 'pending' | 'verified' | 'rejected';
    status?: 'active' | 'suspended';
  } = {}
) {
  const id = await nextId('users');
  await User.create({
    _id: id,
    email,
    password_hash: 'test-password-hash-secret',
    first_name: firstName,
    last_name: lastName,
    phone: options.phone ?? '416-555-0100',
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

function tokenFor(userId: number, email: string, role: 'student' | 'admin' = 'student') {
  return signToken({ id: userId, email, role });
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
  studentAId = await createStudent(
    'student-a@mycentennialcollege.ca',
    'Ramika',
    'Student',
    { phone: '416-555-0100', verification_status: 'verified' }
  );
  studentBId = await createStudent(
    'student-b@mycentennialcollege.ca',
    'Other',
    'Student',
    { phone: '416-555-0199', verification_status: 'verified' }
  );
  adminId = await createAdmin('admin@campusrent.test');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-21 TAC acceptance (automated)', () => {
  test('TAC Test 1 — View profile: current profile displayed', async () => {
    const response = await api(baseUrl, 'GET', '/api/profile', {
      token: tokenFor(studentAId, 'student-a@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.id, studentAId);
    assert.equal(response.data.first_name, 'Ramika');
    assert.equal(response.data.last_name, 'Student');
    assert.equal(response.data.phone, '416-555-0100');
    assert.equal(response.data.email, 'student-a@mycentennialcollege.ca');
    assert.equal(response.data.verification_status, 'verified');
    assert.equal(response.data.role, 'student');
    assert.equal(response.data.status, 'active');
    assert.equal('password' in response.data, false);
    assert.equal('password_hash' in response.data, false);
    assert.equal(JSON.stringify(response.data).includes('test-password-hash'), false);
    assert.equal(US_21_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-21.8');
  });

  test('TAC Test 2 — Update profile: changes saved successfully', async () => {
    const token = tokenFor(studentAId, 'student-a@mycentennialcollege.ca');
    const beforeB = await User.findById(studentBId).lean();

    const patch = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Updated',
        last_name: 'Student',
        phone: '555-1234',
      },
    });

    assert.equal(patch.status, 200);
    assert.equal(patch.data.id, studentAId);
    assert.equal(patch.data.first_name, 'Updated');
    assert.equal(patch.data.last_name, 'Student');
    assert.equal(patch.data.phone, '555-1234');
    assert.equal(patch.data.email, 'student-a@mycentennialcollege.ca');
    assert.equal(patch.data.verification_status, 'verified');

    const stored = await User.findById(studentAId).lean();
    assert.ok(stored);
    assert.equal(stored!.first_name, 'Updated');
    assert.equal(stored!.last_name, 'Student');
    assert.equal(stored!.phone, '555-1234');

    const getAfter = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(getAfter.status, 200);
    assert.equal(getAfter.data.first_name, 'Updated');
    assert.equal(getAfter.data.last_name, 'Student');
    assert.equal(getAfter.data.phone, '555-1234');
    assert.equal(getAfter.data.verification_status, 'verified');

    const afterB = await User.findById(studentBId).lean();
    assert.equal(afterB!.first_name, beforeB!.first_name);
    assert.equal(afterB!.last_name, beforeB!.last_name);
    assert.equal(afterB!.phone, beforeB!.phone);
    assert.equal(afterB!.email, beforeB!.email);
  });

  test('TAC Test 3 — Invalid information: validation error; record unchanged', async () => {
    const token = tokenFor(studentAId, 'student-a@mycentennialcollege.ca');
    const before = await User.findById(studentAId).lean();

    const cases = [
      { first_name: '', last_name: 'Student', phone: '416-555-0100', match: /first name/i },
      { first_name: '   ', last_name: 'Student', phone: '416-555-0100', match: /first name/i },
      { first_name: 'Ramika', last_name: '', phone: '416-555-0100', match: /last name/i },
      { first_name: 'Ramika', last_name: '   ', phone: '416-555-0100', match: /last name/i },
      { first_name: 123, last_name: 'Student', phone: '416-555-0100', match: /.+/ },
      { first_name: 'Ramika', last_name: 'Student', phone: 5551234, match: /.+/ },
    ] as const;

    for (const body of cases) {
      const response = await api(baseUrl, 'PATCH', '/api/profile', {
        token,
        body: {
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
        },
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.match(String(response.data.error ?? ''), body.match);
    }

    const after = await User.findById(studentAId).lean();
    assert.equal(after!.first_name, before!.first_name);
    assert.equal(after!.last_name, before!.last_name);
    assert.equal(after!.phone, before!.phone);
    assert.equal(after!.email, before!.email);
    assert.equal(after!.verification_status, before!.verification_status);
    assert.equal(after!.password_hash, before!.password_hash);
  });

  test('TAC Test 4 — View verification status: current status displayed read-only', async () => {
    const token = tokenFor(studentAId, 'student-a@mycentennialcollege.ca');

    const viewed = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(viewed.status, 200);
    assert.equal(viewed.data.verification_status, 'verified');

    const spoof = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        verification_status: 'rejected',
      },
    });
    assert.equal(spoof.status, 400);
    assert.match(String(spoof.data.error ?? ''), /verification_status/i);

    const stored = await User.findById(studentAId).lean();
    assert.equal(stored!.verification_status, 'verified');

    const stillViewed = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(stillViewed.data.verification_status, 'verified');
    assert.equal(US_21_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-21.8');
    assert.match(US_21_PRODUCTION_ACCEPTANCE_REASON, /US-21\.8/);
  });
});

describe('US-21.7 unauthorized and owner authorization', () => {
  test('unauthenticated, pending, rejected, admin, and suspended cannot use profile APIs', async () => {
    const unauthGet = await api(baseUrl, 'GET', '/api/profile');
    const unauthPatch = await api(baseUrl, 'PATCH', '/api/profile', {
      body: { first_name: 'Nope', last_name: 'Nope', phone: '' },
    });
    assert.equal(unauthGet.status, 401);
    assert.equal(unauthPatch.status, 401);

    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );
    const pendingToken = tokenFor(pendingId, 'pending@mycentennialcollege.ca');
    assert.equal(
      (await api(baseUrl, 'GET', '/api/profile', { token: pendingToken })).status,
      403
    );
    assert.equal(
      (
        await api(baseUrl, 'PATCH', '/api/profile', {
          token: pendingToken,
          body: { first_name: 'P', last_name: 'S', phone: '' },
        })
      ).status,
      403
    );

    const rejectedId = await createStudent(
      'rejected@mycentennialcollege.ca',
      'Rejected',
      'Student',
      { verification_status: 'rejected' }
    );
    const rejectedToken = tokenFor(rejectedId, 'rejected@mycentennialcollege.ca');
    assert.equal(
      (await api(baseUrl, 'GET', '/api/profile', { token: rejectedToken })).status,
      403
    );
    assert.equal(
      (
        await api(baseUrl, 'PATCH', '/api/profile', {
          token: rejectedToken,
          body: { first_name: 'R', last_name: 'S', phone: '' },
        })
      ).status,
      403
    );

    const adminToken = tokenFor(adminId, 'admin@campusrent.test', 'admin');
    assert.equal(
      (await api(baseUrl, 'GET', '/api/profile', { token: adminToken })).status,
      403
    );
    assert.equal(
      (
        await api(baseUrl, 'PATCH', '/api/profile', {
          token: adminToken,
          body: { first_name: 'A', last_name: 'U', phone: '' },
        })
      ).status,
      403
    );

    const suspendedId = await createStudent(
      'suspended@mycentennialcollege.ca',
      'Suspended',
      'Student',
      { verification_status: 'verified', status: 'suspended' }
    );
    const suspendedToken = tokenFor(suspendedId, 'suspended@mycentennialcollege.ca');
    const suspendedGet = await api(baseUrl, 'GET', '/api/profile', {
      token: suspendedToken,
    });
    const suspendedPatch = await api(baseUrl, 'PATCH', '/api/profile', {
      token: suspendedToken,
      body: { first_name: 'S', last_name: 'S', phone: '' },
    });
    assert.equal(suspendedGet.status, 403);
    assert.match(String(suspendedGet.data.error ?? ''), /suspended/i);
    assert.equal(suspendedPatch.status, 403);
    assert.match(String(suspendedPatch.data.error ?? ''), /suspended/i);
  });

  test('Student A update cannot retarget Student B via id/_id/user_id', async () => {
    const token = tokenFor(studentAId, 'student-a@mycentennialcollege.ca');
    const beforeB = await User.findById(studentBId).lean();
    const beforeA = await User.findById(studentAId).lean();

    for (const field of ['id', '_id', 'user_id'] as const) {
      const response = await api(baseUrl, 'PATCH', '/api/profile', {
        token,
        body: {
          first_name: 'Hijack',
          last_name: 'Attempt',
          phone: '000',
          [field]: studentBId,
        },
      });
      assert.equal(response.status, 400, field);
      assert.match(String(response.data.error ?? ''), /protected field/i, field);
    }

    const afterA = await User.findById(studentAId).lean();
    const afterB = await User.findById(studentBId).lean();
    assert.equal(afterA!.first_name, beforeA!.first_name);
    assert.equal(afterB!.first_name, beforeB!.first_name);
    assert.equal(afterB!.email, beforeB!.email);
  });
});

describe('US-21.7 protected-field acceptance', () => {
  test('protected fields are rejected and stored identity values remain unchanged', async () => {
    const token = tokenFor(studentAId, 'student-a@mycentennialcollege.ca');
    const before = await User.findById(studentAId).lean();

    const protectedBodies = [
      { email: 'hijack@mycentennialcollege.ca' },
      { verification_status: 'pending' },
      { role: 'admin' },
      { status: 'suspended' },
      { id: studentBId },
      { _id: studentBId },
      { user_id: studentBId },
      { created_at: '2000-01-01T00:00:00.000Z' },
      { password: 'new-secret' },
      { password_hash: 'forged-hash' },
    ] as const;

    for (const extra of protectedBodies) {
      const response = await api(baseUrl, 'PATCH', '/api/profile', {
        token,
        body: {
          first_name: 'Ramika',
          last_name: 'Student',
          phone: '416-555-0100',
          ...extra,
        },
      });
      assert.equal(response.status, 400, JSON.stringify(extra));
      assert.match(String(response.data.error ?? ''), /protected field/i);
    }

    const after = await User.findById(studentAId).lean();
    assert.equal(after!.email, before!.email);
    assert.equal(after!.verification_status, 'verified');
    assert.equal(after!.role, 'student');
    assert.equal(after!.status, 'active');
    assert.equal(after!.password_hash, before!.password_hash);
    assert.equal(after!.created_at.toISOString(), before!.created_at.toISOString());
    assert.equal(after!.first_name, before!.first_name);
  });
});
