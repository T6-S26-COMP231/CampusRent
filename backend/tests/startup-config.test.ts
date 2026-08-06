import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

describe('production database configuration', () => {
  const originalUri = process.env.MONGODB_URI;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  test('startup configuration fails clearly when production MONGODB_URI is missing', async () => {
    delete process.env.MONGODB_URI;
    process.env.NODE_ENV = 'production';

    const { requireMongoUri } = await import('../src/config/env');
    assert.throws(
      () => requireMongoUri(),
      (error: unknown) =>
        error instanceof Error &&
        /MONGODB_URI is required in production/i.test(error.message) &&
        !/mongodb\+srv:\/\//i.test(error.message)
    );
  });

  test('startup configuration fails clearly when MONGODB_URI is missing in development', async () => {
    delete process.env.MONGODB_URI;
    process.env.NODE_ENV = 'development';

    const { requireMongoUri } = await import('../src/config/env');
    assert.throws(
      () => requireMongoUri(),
      (error: unknown) =>
        error instanceof Error &&
        /MONGODB_URI is required/i.test(error.message) &&
        /Local JSON storage is not supported/i.test(error.message)
    );
  });

  test('invalid MONGODB_URI scheme is rejected without exposing secrets', async () => {
    process.env.MONGODB_URI = 'postgres://user:secret@host/db';
    process.env.NODE_ENV = 'production';

    const { requireMongoUri } = await import('../src/config/env');
    assert.throws(
      () => requireMongoUri(),
      (error: unknown) =>
        error instanceof Error &&
        /MONGODB_URI is invalid/i.test(error.message) &&
        !error.message.includes('secret')
    );
  });
});
