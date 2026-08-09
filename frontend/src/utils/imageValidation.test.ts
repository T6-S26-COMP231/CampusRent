/**
 * Multi-image listing upload/selection/detail helpers.
 * Proves 1–5 images work, 6 are rejected, FormData appends every file,
 * and listing details expose every saved image URL.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  MAX_LISTING_IMAGES,
  appendListingImages,
  clampActiveImageIndex,
  listingDetailImageEntries,
  resolveListingImageSelection,
  validateListingImages,
} from './imageValidation';
import { GUEST_PREVIEW_FIELDS } from './guestCatalogue';
import { GUEST_ITEM_DETAILS_FIELDS } from './guestItemDetails';

const here = dirname(fileURLToPath(import.meta.url));
const createSource = readFileSync(join(here, '../pages/CreateListingPage.tsx'), 'utf8');
const editSource = readFileSync(join(here, '../pages/EditListingPage.tsx'), 'utf8');
const detailSource = readFileSync(join(here, '../pages/ListingDetailPage.tsx'), 'utf8');

function fakeFile(name: string, type = 'image/jpeg', size = 1024): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

describe('listing image selection validation', () => {
  test('one image can be selected', () => {
    const result = resolveListingImageSelection([fakeFile('one.jpg')]);
    assert.equal(result.error, null);
    assert.equal(result.files.length, 1);
    assert.equal(validateListingImages(result.files), null);
  });

  test('two images can be selected', () => {
    const result = resolveListingImageSelection([
      fakeFile('one.jpg'),
      fakeFile('two.png', 'image/png'),
    ]);
    assert.equal(result.error, null);
    assert.equal(result.files.length, 2);
  });

  test('five images can be selected', () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      fakeFile(`img-${index}.webp`, 'image/webp')
    );
    const result = resolveListingImageSelection(files);
    assert.equal(result.error, null);
    assert.equal(result.files.length, MAX_LISTING_IMAGES);
  });

  test('six images are rejected without keeping a silent subset', () => {
    const files = Array.from({ length: 6 }, (_, index) => fakeFile(`img-${index}.jpg`));
    const result = resolveListingImageSelection(files);
    assert.match(result.error || '', /maximum of 5 images/i);
    assert.equal(result.files.length, 0);
    assert.match(validateListingImages(files) || '', /maximum of 5 images/i);
  });

  test('edit selection rejects existing + new above five', () => {
    const result = resolveListingImageSelection(
      [fakeFile('a.jpg'), fakeFile('b.jpg'), fakeFile('c.jpg')],
      { existingCount: 3 }
    );
    assert.match(result.error || '', /only 2 more image/i);
    assert.equal(result.files.length, 0);
  });

  test('edit selection accepts existing + new up to five', () => {
    const result = resolveListingImageSelection(
      [fakeFile('a.jpg'), fakeFile('b.jpg')],
      { existingCount: 3 }
    );
    assert.equal(result.error, null);
    assert.equal(result.files.length, 2);
  });
});

describe('listing FormData image append', () => {
  test('every selected file is appended under images', () => {
    const formData = new FormData();
    const files = [
      fakeFile('one.jpg'),
      fakeFile('two.png', 'image/png'),
      fakeFile('three.webp', 'image/webp'),
    ];
    const appended = appendListingImages(formData, files);
    assert.equal(appended, 3);

    const values = formData.getAll('images');
    assert.equal(values.length, 3);
    assert.equal((values[0] as File).name, 'one.jpg');
    assert.equal((values[1] as File).name, 'two.png');
    assert.equal((values[2] as File).name, 'three.webp');
  });

  test('single-image FormData still appends exactly one file', () => {
    const formData = new FormData();
    appendListingImages(formData, [fakeFile('solo.jpg')]);
    assert.equal(formData.getAll('images').length, 1);
  });
});

describe('listing details multi-image presentation helpers', () => {
  test('listing details entries include every saved image', () => {
    const entries = listingDetailImageEntries([
      { url: '/uploads/a.jpg' },
      { url: '/uploads/b.jpg' },
      { url: '/uploads/c.jpg' },
      { url: '/uploads/d.jpg' },
      { url: '/uploads/e.jpg' },
    ]);
    assert.equal(entries.length, 5);
    assert.deepEqual(
      entries.map((entry) => entry.url),
      [
        '/uploads/a.jpg',
        '/uploads/b.jpg',
        '/uploads/c.jpg',
        '/uploads/d.jpg',
        '/uploads/e.jpg',
      ]
    );
  });

  test('single-image listing still works', () => {
    const entries = listingDetailImageEntries([{ url: '/uploads/only.jpg' }]);
    assert.equal(entries.length, 1);
    assert.equal(clampActiveImageIndex(0, 1), 0);
    assert.equal(clampActiveImageIndex(4, 1), 0);
  });
});

describe('create/edit/detail source wiring for multi-image listings', () => {
  test('create listing form supports multiple files, previews, and append helper', () => {
    assert.match(createSource, /type="file"/);
    assert.match(createSource, /\bmultiple\b/);
    assert.match(createSource, /resolveListingImageSelection/);
    assert.match(createSource, /appendListingImages/);
    assert.match(createSource, /previewUrls/);
    assert.equal(createSource.includes('files[0]'), false);
    assert.equal(createSource.includes('.single('), false);
  });

  test('edit listing form preserves existing images and caps total at five', () => {
    assert.match(editSource, /\bmultiple\b/);
    assert.match(editSource, /existingCount/);
    assert.match(editSource, /appendListingImages/);
    assert.match(editSource, /listing\.images\.map/);
    assert.match(editSource, /newPreviewUrls/);
  });

  test('listing details page renders all saved images via gallery entries', () => {
    assert.match(detailSource, /listingDetailImageEntries/);
    assert.match(detailSource, /galleryImages\.map/);
    assert.match(detailSource, /onError/);
    assert.equal(detailSource.includes('images.slice(1, 5)'), false);
  });

  test('guest privacy allow-lists remain unchanged by this fix', () => {
    assert.deepEqual([...GUEST_PREVIEW_FIELDS], [
      'id',
      'title',
      'category',
      'availability',
      'thumbnail_url',
    ]);
    assert.deepEqual([...GUEST_ITEM_DETAILS_FIELDS], [
      'id',
      'title',
      'category',
      'description',
      'availability',
    ]);
    assert.equal(GUEST_ITEM_DETAILS_FIELDS.includes('images' as never), false);
    assert.equal(GUEST_ITEM_DETAILS_FIELDS.includes('owner' as never), false);
    assert.equal(GUEST_PREVIEW_FIELDS.includes('images' as never), false);
  });
});
