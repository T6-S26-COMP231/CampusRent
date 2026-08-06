import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Server } from 'node:http';
import {
  api,
  closeServer,
  listenApp,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let disconnectDatabase: () => Promise<void>;
let createApp: () => import('express').Express;
let signToken: (user: { id: number; email: string; role: string }) => string;
let nextId: (name: string) => Promise<number>;
let User: typeof import('../src/models/User').User;

let server: Server;
let baseUrl: string;
let ownerToken: string;

before(async () => {
  const uri = await startTestDatabase();
  ({ connectDatabase, disconnectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));

  await connectDatabase(uri);
  const ownerId = await nextId('users');
  await User.create({
    _id: ownerId,
    email: 'db-error@mycentennialcollege.ca',
    password_hash: 'test-hash',
    first_name: 'Db',
    last_name: 'Error',
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  ownerToken = signToken({
    id: ownerId,
    email: 'db-error@mycentennialcollege.ca',
    role: 'student',
  });

  const listening = await listenApp(createApp());
  server = listening.server;
  baseUrl = listening.baseUrl;
});

after(async () => {
  await closeServer(server);
  await stopTestDatabase();
});

describe('database error HTTP responses', () => {
  test('requests return a database unavailable response when the connection is down', async () => {
    await disconnectDatabase();

    const response = await api(baseUrl, 'GET', '/api/listings/mine', { token: ownerToken });
    assert.equal(response.status, 503);
    assert.equal(response.data.error, 'Database unavailable. Please try again later.');

    const health = await api(baseUrl, 'GET', '/api/health');
    assert.equal(health.status, 503);
    assert.equal(health.data.database.connected, false);
  });
});
