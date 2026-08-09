/**
 * US-21.3 — GET /api/profile and PATCH /api/profile.
 * Auth: authenticate + requireVerifiedStudent.
 * Stronger protected-field attack coverage belongs to US-21.4.
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
let studentId: number;
let otherStudentId: number;
let adminId: number;

async function createStudent(
  email: string,
  firstName: string,
  lastName: string,
  options: {
    phone?: string;
    verification_status?: 'pending' | 'verified' | 'rejected';
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
    status: 'active',
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

function studentToken(userId: number, email: string) {
  return signToken({ id: userId, email, role: 'student' });
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
  studentId = await createStudent(
    'student@mycentennialcollege.ca',
    'Ramika',
    'Student',
    { phone: '416-555-0100', verification_status: 'verified' }
  );
  otherStudentId = await createStudent(
    'other@mycentennialcollege.ca',
    'Other',
    'Student',
    { phone: '416-555-0199' }
  );
  adminId = await createAdmin('admin@campusrent.test');
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('US-21.3 profile authorization (authenticate + requireVerifiedStudent)', () => {
  test('unauthenticated GET and PATCH are denied with 401', async () => {
    const getResponse = await api(baseUrl, 'GET', '/api/profile');
    assert.equal(getResponse.status, 401);

    const patchResponse = await api(baseUrl, 'PATCH', '/api/profile', {
      body: { first_name: 'Nope', last_name: 'Nope', phone: '' },
    });
    assert.equal(patchResponse.status, 401);
  });

  test('pending student GET and PATCH are denied by requireVerifiedStudent', async () => {
    const pendingId = await createStudent(
      'pending@mycentennialcollege.ca',
      'Pending',
      'Student',
      { verification_status: 'pending' }
    );
    const token = studentToken(pendingId, 'pending@mycentennialcollege.ca');

    const getResponse = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(getResponse.status, 403);
    assert.match(String(getResponse.data.error ?? ''), /verification required/i);
    assert.equal(getResponse.data.verification_status, 'pending');

    const patchResponse = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Pending', last_name: 'Update', phone: '' },
    });
    assert.equal(patchResponse.status, 403);
    assert.match(String(patchResponse.data.error ?? ''), /verification required/i);
  });

  test('rejected student GET and PATCH are denied by requireVerifiedStudent', async () => {
    const rejectedId = await createStudent(
      'rejected@mycentennialcollege.ca',
      'Rejected',
      'Student',
      { verification_status: 'rejected' }
    );
    const token = studentToken(rejectedId, 'rejected@mycentennialcollege.ca');

    const getResponse = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(getResponse.status, 403);
    assert.match(String(getResponse.data.error ?? ''), /verification required/i);
    assert.equal(getResponse.data.verification_status, 'rejected');

    const patchResponse = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Rejected', last_name: 'Update', phone: '' },
    });
    assert.equal(patchResponse.status, 403);
  });

  test('admin cannot use student profile endpoint', async () => {
    const token = signToken({
      id: adminId,
      email: 'admin@campusrent.test',
      role: 'admin',
    });
    const getResponse = await api(baseUrl, 'GET', '/api/profile', { token });
    assert.equal(getResponse.status, 403);

    const patchResponse = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Admin', last_name: 'Nope', phone: '' },
    });
    assert.equal(patchResponse.status, 403);
  });
});

describe('US-21.3 GET /api/profile', () => {
  test('verified student fetches own safe profile including verification_status verified', async () => {
    const response = await api(baseUrl, 'GET', '/api/profile', {
      token: studentToken(studentId, 'student@mycentennialcollege.ca'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.id, studentId);
    assert.equal(response.data.first_name, 'Ramika');
    assert.equal(response.data.last_name, 'Student');
    assert.equal(response.data.phone, '416-555-0100');
    assert.equal(response.data.email, 'student@mycentennialcollege.ca');
    assert.equal(response.data.verification_status, 'verified');
    assert.equal(response.data.role, 'student');
    assert.equal(response.data.status, 'active');
    assert.equal(typeof response.data.created_at, 'string');
    assert.equal('password_hash' in response.data, false);
    assert.equal('password' in response.data, false);
    assert.equal(JSON.stringify(response.data).includes('password_hash'), false);
    assert.equal(JSON.stringify(response.data).includes('test-password-hash'), false);
  });
});

describe('US-21.3 PATCH /api/profile', () => {
  test('verified student can update first_name, last_name, and phone', async () => {
    const response = await api(baseUrl, 'PATCH', '/api/profile', {
      token: studentToken(studentId, 'student@mycentennialcollege.ca'),
      body: {
        first_name: '  Updated  ',
        last_name: '  Name  ',
        phone: '  416-555-0111  ',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.id, studentId);
    assert.equal(response.data.first_name, 'Updated');
    assert.equal(response.data.last_name, 'Name');
    assert.equal(response.data.phone, '416-555-0111');
    assert.equal(response.data.email, 'student@mycentennialcollege.ca');
    assert.equal(response.data.verification_status, 'verified');
    assert.equal(response.data.role, 'student');
    assert.equal('password_hash' in response.data, false);

    const stored = await User.findById(studentId).lean();
    assert.ok(stored);
    assert.equal(stored!.first_name, 'Updated');
    assert.equal(stored!.last_name, 'Name');
    assert.equal(stored!.phone, '416-555-0111');
    assert.equal(stored!.email, 'student@mycentennialcollege.ca');
    assert.equal(stored!.verification_status, 'verified');
    assert.equal(stored!.role, 'student');
  });

  test('blank first_name and last_name are rejected; blank phone normalizes to empty string', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');

    const blankFirst = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: '   ', last_name: 'Student', phone: '416-555-0100' },
    });
    assert.equal(blankFirst.status, 400);
    assert.match(String(blankFirst.data.error ?? ''), /first name/i);

    const blankLast = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Ramika', last_name: '', phone: '416-555-0100' },
    });
    assert.equal(blankLast.status, 400);
    assert.match(String(blankLast.data.error ?? ''), /last name/i);

    const blankPhone = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Ramika', last_name: 'Student', phone: '   ' },
    });
    assert.equal(blankPhone.status, 200);
    assert.equal(blankPhone.data.phone, '');
    assert.equal(blankPhone.data.verification_status, 'verified');
    const stored = await User.findById(studentId).lean();
    assert.equal(stored!.phone, '');
  });

  test('non-string editable values are rejected', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');

    const badFirst = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 123, last_name: 'Student', phone: '' },
    });
    assert.equal(badFirst.status, 400);

    const badPhone = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: { first_name: 'Ramika', last_name: 'Student', phone: 4165550100 },
    });
    assert.equal(badPhone.status, 400);
  });

  test('valid update is tied to req.user.id; another student remains unchanged', async () => {
    const beforeOther = await User.findById(otherStudentId).lean();

    const response = await api(baseUrl, 'PATCH', '/api/profile', {
      token: studentToken(studentId, 'student@mycentennialcollege.ca'),
      body: {
        first_name: 'OnlyMe',
        last_name: 'Updated',
        phone: '416-555-0001',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.id, studentId);
    assert.equal(response.data.first_name, 'OnlyMe');

    const afterOther = await User.findById(otherStudentId).lean();
    assert.equal(afterOther!.first_name, beforeOther!.first_name);
    assert.equal(afterOther!.last_name, beforeOther!.last_name);
    assert.equal(afterOther!.phone, beforeOther!.phone);
    assert.equal(afterOther!.email, beforeOther!.email);
  });
});

describe('US-21.4 owner authorization and protected-field validation', () => {
  test('body id, user_id, and _id cannot redirect update to another student', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');
    const beforeOther = await User.findById(otherStudentId).lean();
    const beforeSelf = await User.findById(studentId).lean();

    for (const field of ['id', 'user_id', '_id'] as const) {
      const response = await api(baseUrl, 'PATCH', '/api/profile', {
        token,
        body: {
          first_name: 'Hijack',
          last_name: 'Attempt',
          phone: '000',
          [field]: otherStudentId,
        },
      });
      assert.equal(response.status, 400, field);
      assert.match(String(response.data.error ?? ''), /protected field/i, field);
    }

    const afterSelf = await User.findById(studentId).lean();
    const afterOther = await User.findById(otherStudentId).lean();
    assert.equal(afterSelf!.first_name, beforeSelf!.first_name);
    assert.equal(afterSelf!.last_name, beforeSelf!.last_name);
    assert.equal(afterOther!.first_name, beforeOther!.first_name);
    assert.equal(afterOther!.email, beforeOther!.email);
  });

  test('verification_status spoof values are rejected and stored status unchanged', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');

    for (const spoof of ['verified', 'rejected', 'pending'] as const) {
      const response = await api(baseUrl, 'PATCH', '/api/profile', {
        token,
        body: {
          first_name: 'Ramika',
          last_name: 'Student',
          phone: '416-555-0100',
          verification_status: spoof,
        },
      });
      assert.equal(response.status, 400, spoof);
      assert.match(String(response.data.error ?? ''), /verification_status/i, spoof);
    }

    const stored = await User.findById(studentId).lean();
    assert.equal(stored!.verification_status, 'verified');
    assert.equal(stored!.first_name, 'Ramika');
  });

  test('email cannot be changed through profile update', async () => {
    const response = await api(baseUrl, 'PATCH', '/api/profile', {
      token: studentToken(studentId, 'student@mycentennialcollege.ca'),
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        email: 'hijack@mycentennialcollege.ca',
      },
    });
    assert.equal(response.status, 400);
    assert.match(String(response.data.error ?? ''), /email/i);

    const stored = await User.findById(studentId).lean();
    assert.equal(stored!.email, 'student@mycentennialcollege.ca');
  });

  test('role and status cannot be changed through profile update', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');

    const roleAttempt = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        role: 'admin',
      },
    });
    assert.equal(roleAttempt.status, 400);
    assert.match(String(roleAttempt.data.error ?? ''), /role/i);

    const statusAttempt = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        status: 'suspended',
      },
    });
    assert.equal(statusAttempt.status, 400);
    assert.match(String(statusAttempt.data.error ?? ''), /status/i);

    const stored = await User.findById(studentId).lean();
    assert.equal(stored!.role, 'student');
    assert.equal(stored!.status, 'active');
  });

  test('password and password_hash are rejected; existing hash unchanged', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');
    const before = await User.findById(studentId).lean();

    const passwordAttempt = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        password: 'new-secret',
      },
    });
    assert.equal(passwordAttempt.status, 400);
    assert.match(String(passwordAttempt.data.error ?? ''), /password/i);

    const hashAttempt = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        password_hash: 'forged-hash',
      },
    });
    assert.equal(hashAttempt.status, 400);
    assert.match(String(hashAttempt.data.error ?? ''), /password_hash/i);

    const after = await User.findById(studentId).lean();
    assert.equal(after!.password_hash, before!.password_hash);
  });

  test('created_at cannot be changed; valid update still returns safe public user', async () => {
    const token = studentToken(studentId, 'student@mycentennialcollege.ca');
    const before = await User.findById(studentId).lean();

    const createdAttempt = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '416-555-0100',
        created_at: '2000-01-01T00:00:00.000Z',
      },
    });
    assert.equal(createdAttempt.status, 400);
    assert.match(String(createdAttempt.data.error ?? ''), /created_at/i);

    const valid = await api(baseUrl, 'PATCH', '/api/profile', {
      token,
      body: {
        first_name: 'Safe',
        last_name: 'Update',
        phone: '416-555-2222',
      },
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.data.first_name, 'Safe');
    assert.equal(valid.data.last_name, 'Update');
    assert.equal(valid.data.phone, '416-555-2222');
    assert.equal(valid.data.verification_status, 'verified');
    assert.equal(valid.data.email, 'student@mycentennialcollege.ca');
    assert.equal(valid.data.role, 'student');
    assert.equal(valid.data.status, 'active');
    assert.equal('password_hash' in valid.data, false);

    const after = await User.findById(studentId).lean();
    assert.equal(after!.created_at.toISOString(), before!.created_at.toISOString());
    assert.equal(after!.password_hash, before!.password_hash);
  });
});
