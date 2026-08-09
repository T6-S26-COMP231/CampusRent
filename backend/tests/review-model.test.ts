/**
 * US-19.3 — Review model persistence.
 * Create/list APIs and completed-rental business rules belong to US-19.4 / US-19.5.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers';

let connectDatabase: (uri?: string) => Promise<unknown>;
let nextId: (name: string) => Promise<number>;
let Review: typeof import('../src/models/Review').Review;
let normalizeReviewRating: typeof import('../src/models/Review').normalizeReviewRating;
let normalizeReviewComment: typeof import('../src/models/Review').normalizeReviewComment;
let assertReviewIdentifiers: typeof import('../src/models/Review').assertReviewIdentifiers;
let toReviewRow: typeof import('../src/models/Review').toReviewRow;
let isWholeStarRating: typeof import('../src/models/Review').isWholeStarRating;

async function createValidReview(
  overrides: Partial<{
    _id: number;
    reviewer_id: number;
    rental_request_id: number;
    listing_id: number;
    reviewed_user_id: number;
    rating: number;
    comment: string;
  }> = {}
) {
  const id = overrides._id ?? (await nextId('reviews'));
  return Review.create({
    _id: id,
    reviewer_id: overrides.reviewer_id ?? 9,
    rental_request_id: overrides.rental_request_id ?? 21,
    listing_id: overrides.listing_id ?? 12,
    reviewed_user_id: overrides.reviewed_user_id ?? 4,
    rating: overrides.rating ?? 4,
    comment: overrides.comment ?? 'Item was as described.',
  });
}

before(async () => {
  const mongoUri = await startTestDatabase();
  ({ connectDatabase } = await import('../src/db/connection'));
  ({ nextId } = await import('../src/models/Counter'));
  ({
    Review,
    normalizeReviewRating,
    normalizeReviewComment,
    assertReviewIdentifiers,
    toReviewRow,
    isWholeStarRating,
  } = await import('../src/models/Review'));
  await connectDatabase(mongoUri);
  await Review.syncIndexes();
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await stopTestDatabase();
});

describe('US-19.3 Review model persistence', () => {
  test('valid review persists with generated numeric id and created_at', async () => {
    const id = await nextId('reviews');
    const created = await Review.create({
      _id: id,
      reviewer_id: 9,
      rental_request_id: 21,
      listing_id: 12,
      reviewed_user_id: 4,
      rating: 5,
      comment: '  Excellent handoff.  ',
    });

    assert.equal(created._id, id);
    assert.equal(typeof created._id, 'number');
    assert.equal(created.reviewer_id, 9);
    assert.equal(created.rental_request_id, 21);
    assert.equal(created.listing_id, 12);
    assert.equal(created.reviewed_user_id, 4);
    assert.equal(created.rating, 5);
    assert.equal(created.comment, 'Excellent handoff.');
    assert.ok(created.created_at instanceof Date);

    const row = toReviewRow(created);
    assert.equal(row.id, id);
    assert.equal(row.rating, 5);
    assert.equal(row.comment, 'Excellent handoff.');
    assert.equal(typeof row.created_at, 'string');
    assert.ok(!Number.isNaN(Date.parse(row.created_at)));
  });

  test('reviewer_id, rental_request_id, listing_id, and reviewed_user_id are required/valid', async () => {
    assert.deepEqual(assertReviewIdentifiers(9, 21, 12, 4), {
      reviewer_id: 9,
      rental_request_id: 21,
      listing_id: 12,
      reviewed_user_id: 4,
    });
    assert.throws(() => assertReviewIdentifiers(0, 21, 12, 4), /reviewer_id/i);
    assert.throws(() => assertReviewIdentifiers(9, -1, 12, 4), /rental_request_id/i);
    assert.throws(() => assertReviewIdentifiers(9, 21, 1.5, 4), /listing_id/i);
    assert.throws(() => assertReviewIdentifiers(9, 21, 12, 0), /reviewed_user_id/i);

    await assert.rejects(
      async () =>
        Review.create({
          _id: await nextId('reviews'),
          rental_request_id: 21,
          listing_id: 12,
          reviewed_user_id: 4,
          rating: 3,
          comment: 'Missing reviewer',
        }),
      /reviewer_id|required|positive integer/i
    );

    await assert.rejects(
      async () =>
        Review.create({
          _id: await nextId('reviews'),
          reviewer_id: 9,
          listing_id: 12,
          reviewed_user_id: 4,
          rating: 3,
          comment: 'Missing rental request',
        }),
      /rental_request_id|required|positive integer/i
    );

    await assert.rejects(
      async () =>
        Review.create({
          _id: await nextId('reviews'),
          reviewer_id: 9,
          rental_request_id: 21,
          reviewed_user_id: 4,
          rating: 3,
          comment: 'Missing listing',
        }),
      /listing_id|required|positive integer/i
    );

    await assert.rejects(
      async () =>
        Review.create({
          _id: await nextId('reviews'),
          reviewer_id: 9,
          rental_request_id: 21,
          listing_id: 12,
          rating: 3,
          comment: 'Missing reviewed user',
        }),
      /reviewed_user_id|required|positive integer/i
    );
  });

  test('rating 1 and 5 are accepted; below 1, above 5, and decimals are rejected', async () => {
    assert.equal(normalizeReviewRating(1), 1);
    assert.equal(normalizeReviewRating(5), 5);
    assert.equal(isWholeStarRating(3), true);
    assert.equal(isWholeStarRating(1.5), false);

    const one = await createValidReview({ rental_request_id: 101, rating: 1 });
    assert.equal(one.rating, 1);
    const five = await createValidReview({ rental_request_id: 102, rating: 5 });
    assert.equal(five.rating, 5);

    assert.throws(() => normalizeReviewRating(0), /1 to 5/i);
    assert.throws(() => normalizeReviewRating(6), /1 to 5/i);
    assert.throws(() => normalizeReviewRating(2.5), /whole number/i);
    assert.throws(() => normalizeReviewRating(null), /required/i);
    assert.throws(() => normalizeReviewRating('5'), /whole number/i);
    assert.throws(() => normalizeReviewRating(Number.NaN), /whole number/i);

    await assert.rejects(
      () => createValidReview({ rental_request_id: 103, rating: 0 }),
      /1 to 5|Rating/i
    );
    await assert.rejects(
      () => createValidReview({ rental_request_id: 104, rating: 6 }),
      /1 to 5|Rating/i
    );
    await assert.rejects(
      () => createValidReview({ rental_request_id: 105, rating: 3.5 }),
      /whole number|1 to 5|Rating/i
    );
  });

  test('comment is required, trimmed, and rejects whitespace-only values', async () => {
    assert.equal(normalizeReviewComment('  Smooth return.  '), 'Smooth return.');
    assert.throws(() => normalizeReviewComment(''), /blank/i);
    assert.throws(() => normalizeReviewComment('   \n\t  '), /blank/i);
    assert.throws(() => normalizeReviewComment(null), /required/i);

    const created = await createValidReview({
      rental_request_id: 201,
      comment: '  Trimmed comment.  ',
    });
    assert.equal(created.comment, 'Trimmed comment.');

    await assert.rejects(
      () =>
        createValidReview({
          rental_request_id: 202,
          comment: '   ',
        }),
      /comment|blank/i
    );
  });

  test('duplicate reviewer + rental_request is prevented by unique index', async () => {
    await createValidReview({
      reviewer_id: 9,
      rental_request_id: 77,
      listing_id: 12,
      reviewed_user_id: 4,
      rating: 4,
      comment: 'First review for this rental.',
    });

    await assert.rejects(
      () =>
        createValidReview({
          reviewer_id: 9,
          rental_request_id: 77,
          listing_id: 12,
          reviewed_user_id: 4,
          rating: 5,
          comment: 'Second review for the same rental.',
        }),
      /duplicate|E11000|uniq_review_reviewer_rental_request/i
    );

    // Different rental request for the same reviewer is still allowed.
    const other = await createValidReview({
      reviewer_id: 9,
      rental_request_id: 78,
      listing_id: 12,
      reviewed_user_id: 4,
      rating: 3,
      comment: 'Different completed rental.',
    });
    assert.equal(other.rental_request_id, 78);
    assert.equal(await Review.countDocuments({ reviewer_id: 9 }), 2);
  });

  test('created_at exists on persisted documents', async () => {
    const created = await createValidReview({ rental_request_id: 301 });
    assert.ok(created.created_at instanceof Date);

    const stored = await Review.findById(created._id).lean();
    assert.ok(stored);
    assert.ok(stored!.created_at instanceof Date);
  });
});
