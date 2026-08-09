/**
 * Multi-image listing upload/storage coverage.
 * Proves backend accepts 1–5 images, rejects 6, and persists every uploaded image.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  api,
  clearDatabase,
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
let Listing: typeof import('../src/models/Listing').Listing;

let mongoUri: string;
let ownerId: number;
let token: string;

const here = dirname(fileURLToPath(import.meta.url));
const listingRoutesSource = readFileSync(
  join(here, '../src/routes/listings.ts'),
  'utf8'
);

/** Minimal 1x1 PNG — valid enough for multer type/extension checks. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W3WAAAAAASUVORK5CYII=',
  'base64'
);

function imageBlob(name: string) {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

function listingFormData(
  fields: Record<string, string>,
  imageNames: string[]
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  for (const name of imageNames) {
    formData.append('images', imageBlob(name), name);
  }
  return formData;
}

async function withServer(run: (baseUrl: string) => Promise<void>) {
  await disconnectDatabase();
  await connectDatabase(mongoUri);
  const app = createApp();
  const { server, baseUrl } = await listenApp(app);
  try {
    await run(baseUrl);
  } finally {
    await closeServer(server);
  }
}

before(async () => {
  mongoUri = await startTestDatabase();
  ({ connectDatabase, disconnectDatabase } = await import('../src/db/connection'));
  ({ createApp } = await import('../src/app'));
  ({ signToken } = await import('../src/middleware/auth'));
  ({ nextId } = await import('../src/models/Counter'));
  ({ User } = await import('../src/models/User'));
  ({ Listing } = await import('../src/models/Listing'));
  await connectDatabase(mongoUri);
});

beforeEach(async () => {
  await clearDatabase();
  ownerId = await nextId('users');
  await User.create({
    _id: ownerId,
    email: 'images-owner@mycentennialcollege.ca',
    password_hash: 'test-hash',
    first_name: 'Image',
    last_name: 'Owner',
    phone: '',
    role: 'student',
    verification_status: 'verified',
    status: 'active',
  });
  token = signToken({
    id: ownerId,
    email: 'images-owner@mycentennialcollege.ca',
    role: 'student',
  });
});

after(async () => {
  await stopTestDatabase();
});

describe('listing multi-image upload middleware contract', () => {
  test('upload middleware accepts an images array up to five and validates six', () => {
    assert.match(listingRoutesSource, /const MAX_IMAGES = 5/);
    assert.match(listingRoutesSource, /upload\.array\('images',\s*10\)/);
    assert.match(listingRoutesSource, /files\.length > MAX_IMAGES/);
    assert.match(listingRoutesSource, /maximum of 5 images/);
    assert.equal(listingRoutesSource.includes('.single('), false);
  });
});

describe('listing create with multiple images', () => {
  test('one image can be uploaded and saved', async () => {
    await withServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        formData: listingFormData(
          {
            title: 'One Image Camera',
            category: 'Electronics',
            description: 'Single shot',
            rental_terms: '',
            availability: 'available',
          },
          ['one.png']
        ),
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.images.length, 1);
      assert.match(created.data.images[0].url, /^\/uploads\//);

      const stored = await Listing.findById(created.data.id).lean();
      assert.equal(stored?.images.length, 1);
    });
  });

  test('two images can be uploaded and saved', async () => {
    await withServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        formData: listingFormData(
          {
            title: 'Two Image Tripod',
            category: 'Electronics',
            description: 'Two angles',
            rental_terms: '',
            availability: 'available',
          },
          ['a.png', 'b.png']
        ),
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.images.length, 2);

      const fetched = await api(baseUrl, 'GET', `/api/listings/${created.data.id}`, {
        token,
      });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.data.images.length, 2);
    });
  });

  test('five images can be uploaded and all image records are saved', async () => {
    await withServer(async (baseUrl) => {
      const names = ['1.png', '2.png', '3.png', '4.png', '5.png'];
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        formData: listingFormData(
          {
            title: 'Five Image Kit',
            category: 'Electronics',
            description: 'Full set',
            rental_terms: '',
            availability: 'available',
          },
          names
        ),
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.images.length, 5);

      const stored = await Listing.findById(created.data.id).lean();
      assert.equal(stored?.images.length, 5);
      assert.equal(new Set(stored?.images.map((image) => image.filename)).size, 5);
    });
  });

  test('six images are rejected by the backend', async () => {
    await withServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        formData: listingFormData(
          {
            title: 'Too Many Images',
            category: 'Electronics',
            description: 'Should fail',
            rental_terms: '',
            availability: 'available',
          },
          ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png']
        ),
      });
      assert.equal(created.status, 400);
      assert.match(String(created.data?.error || ''), /maximum of 5 images/i);

      const count = await Listing.countDocuments({ title: 'Too Many Images' });
      assert.equal(count, 0);
    });
  });
});

describe('listing edit image append behavior', () => {
  test('edit appends new images without deleting existing ones and still caps at five', async () => {
    await withServer(async (baseUrl) => {
      const created = await api(baseUrl, 'POST', '/api/listings', {
        token,
        formData: listingFormData(
          {
            title: 'Editable Kit',
            category: 'Electronics',
            description: 'Start with two',
            rental_terms: '',
            availability: 'available',
          },
          ['existing-a.png', 'existing-b.png']
        ),
      });
      assert.equal(created.status, 201);
      const listingId = created.data.id;
      const originalUrls = created.data.images.map((image: { url: string }) => image.url);

      const updated = await api(baseUrl, 'PUT', `/api/listings/${listingId}`, {
        token,
        formData: listingFormData(
          {
            title: 'Editable Kit',
            category: 'Electronics',
            description: 'Now three',
            rental_terms: '',
          },
          ['new-c.png']
        ),
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.data.images.length, 3);
      for (const url of originalUrls) {
        assert.equal(
          updated.data.images.some((image: { url: string }) => image.url === url),
          true,
          `expected existing image ${url} to remain`
        );
      }

      const rejected = await api(baseUrl, 'PUT', `/api/listings/${listingId}`, {
        token,
        formData: listingFormData(
          {
            title: 'Editable Kit',
            category: 'Electronics',
            description: 'Overflow',
            rental_terms: '',
          },
          ['x.png', 'y.png', 'z.png']
        ),
      });
      assert.equal(rejected.status, 400);
      assert.match(String(rejected.data?.error || ''), /maximum of 5 images/i);

      const fetched = await api(baseUrl, 'GET', `/api/listings/${listingId}`, { token });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.data.images.length, 3);
    });
  });
});
