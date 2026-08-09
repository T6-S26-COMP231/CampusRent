/**
 * US-19.6 — review form / listing display ↔ review API integration helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REVIEW_ALREADY_SUBMITTED_LABEL,
  REVIEW_DISPLAY_EMPTY_MESSAGE,
  REVIEW_DUPLICATE_MESSAGE,
  REVIEW_ENTRY_LABEL,
  REVIEW_INCOMPLETE_RENTAL_MESSAGE,
  REVIEW_SUCCESS_MESSAGE,
  buildCreateReviewCall,
  buildGetListingReviewsCall,
  canSubmitReview,
  classifyReviewSubmitError,
  claimsReviewSavedSuccessfully,
  isRentalMarkedReviewed,
  listingReviewsUiStatus,
  mapApiReviewToDisplayItem,
  markRentalReviewed,
  myRequestsReviewControls,
  reviewSubmitBodyExcludesClientIdentity,
  runListingReviewsLoadFlow,
  runReviewSubmitFlow,
  toReviewRentalContext,
  type ListingReviewApiItem,
  type SubmitReviewBody,
} from './ratingsReviews';

const completedRequest = {
  id: 21,
  listing_id: 12,
  renter_id: 9,
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  status: 'completed',
  listing: { id: 12, title: 'Campus Camera' },
  owner: { id: 4, first_name: 'Test', last_name: 'Owner' },
  renter: { id: 9, first_name: 'Ramika', last_name: 'Student' },
};

const apiReview: ListingReviewApiItem = {
  id: 7,
  rental_request_id: 21,
  listing_id: 12,
  reviewed_user_id: 4,
  rating: 5,
  comment: 'Excellent handoff.',
  created_at: '2026-08-08T20:00:00.000Z',
  reviewer: { id: 9, label: 'Ramika Student' },
};

describe('US-19.6 review API client descriptors', () => {
  test('createReview sends correct endpoint/method/body without identity fields', () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    const call = buildCreateReviewCall(context, 5, '  Great rental.  ');

    assert.equal(call.path, '/reviews');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.body, {
      rental_request_id: 21,
      rating: 5,
      comment: 'Great rental.',
    });
    assert.equal(reviewSubmitBodyExcludesClientIdentity(call.body), true);
    assert.equal('reviewer_id' in call.body, false);
    assert.equal('listing_id' in call.body, false);
    assert.equal('reviewed_user_id' in call.body, false);
    assert.equal(JSON.stringify(call.body).includes('reviewer_id'), false);
    assert.equal(JSON.stringify(call.body).includes('listing_id'), false);
    assert.equal(JSON.stringify(call.body).includes('reviewed_user_id'), false);
  });

  test('getListingReviews calls correct listing endpoint', () => {
    const call = buildGetListingReviewsCall(12);
    assert.equal(call.path, '/listings/12/reviews');
    assert.equal(call.method, 'GET');
  });
});

describe('US-19.6 review form integration', () => {
  test('completed rental opens ReviewForm controls; incomplete never creates', async () => {
    const completed = myRequestsReviewControls(completedRequest, 9, false);
    assert.equal(completed.showReviewAction, true);
    assert.equal(completed.entryLabel, REVIEW_ENTRY_LABEL);
    assert.ok(completed.context);

    for (const status of ['pending', 'accepted', 'declined', 'cancelled'] as const) {
      const controls = myRequestsReviewControls(
        { ...completedRequest, status },
        9,
        false
      );
      assert.equal(controls.showReviewAction, false, status);

      let called = false;
      const result = await runReviewSubmitFlow(
        { ...controls.context!, status },
        4,
        'Should not post',
        async () => {
          called = true;
          return apiReview;
        }
      );
      assert.equal(called, false, status);
      assert.equal(result.body, null, status);
      assert.equal(result.success, '', status);
      assert.match(result.error, /completed rental/i, status);
    }
  });

  test('valid submit calls createReview; success marks reviewed and shows saved message', async () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    let submitted: SubmitReviewBody | null = null;

    assert.equal(
      canSubmitReview({
        context,
        rating: 5,
        comment: 'Excellent handoff.',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      true
    );
    assert.equal(
      canSubmitReview({
        context,
        rating: 5,
        comment: 'Excellent handoff.',
        submitting: true,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );

    const result = await runReviewSubmitFlow(
      context,
      5,
      '  Excellent handoff.  ',
      async (body) => {
        submitted = body;
        return apiReview;
      }
    );

    assert.ok(submitted);
    assert.deepEqual(submitted, {
      rental_request_id: 21,
      rating: 5,
      comment: 'Excellent handoff.',
    });
    assert.equal(result.success, REVIEW_SUCCESS_MESSAGE);
    assert.equal(result.success, 'Review saved successfully.');
    assert.equal(claimsReviewSavedSuccessfully(result.success), true);
    assert.equal(result.error, '');
    assert.equal(result.alreadyReviewed, true);
    assert.equal(result.rating, null);
    assert.equal(result.comment, '');

    const reviewed = markRentalReviewed(new Set(), 21);
    assert.equal(isRentalMarkedReviewed(reviewed, 21), true);
    const after = myRequestsReviewControls(completedRequest, 9, true);
    assert.equal(after.showReviewAction, false);
    assert.equal(after.entryLabel, REVIEW_ALREADY_SUBMITTED_LABEL);
  });

  test('failure does not claim success and preserves form data', async () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    const result = await runReviewSubmitFlow(
      context,
      4,
      'Keep this comment',
      async () => {
        const error = new Error('Rating must be a whole number from 1 to 5') as Error & {
          status: number;
        };
        error.status = 400;
        throw error;
      }
    );

    assert.equal(result.success, '');
    assert.equal(claimsReviewSavedSuccessfully(result.success), false);
    assert.equal(result.alreadyReviewed, false);
    assert.equal(result.rating, 4);
    assert.equal(result.comment, 'Keep this comment');
    assert.match(result.error, /rating/i);
  });

  test('duplicate 409 produces already-reviewed conflict behavior', async () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    const result = await runReviewSubmitFlow(
      context,
      3,
      'Second attempt',
      async () => {
        const error = new Error(
          'A review for this rental request already exists'
        ) as Error & { status: number };
        error.status = 409;
        throw error;
      }
    );

    assert.equal(result.success, '');
    assert.equal(result.alreadyReviewed, true);
    assert.equal(result.error, REVIEW_DUPLICATE_MESSAGE);
    assert.equal(result.rating, 3);
    assert.equal(result.comment, 'Second attempt');

    const classified = classifyReviewSubmitError(
      Object.assign(new Error('A review for this rental request already exists'), {
        status: 409,
      })
    );
    assert.equal(classified.kind, 'duplicate');
    assert.equal(classified.alreadyReviewed, true);

    const incomplete = classifyReviewSubmitError(
      Object.assign(new Error(REVIEW_INCOMPLETE_RENTAL_MESSAGE), { status: 409 })
    );
    assert.equal(incomplete.kind, 'incomplete_rental');
    assert.equal(incomplete.alreadyReviewed, false);
  });
});

describe('US-19.6 listing review display integration', () => {
  test('loading, empty [], populated API data, and error states', async () => {
    assert.equal(listingReviewsUiStatus(true, '', 0), 'loading');

    const empty = await runListingReviewsLoadFlow(12, 'Campus Camera', async () => []);
    assert.equal(empty.status, 'empty');
    assert.deepEqual(empty.reviews, []);
    assert.equal(empty.error, '');
    assert.equal(REVIEW_DISPLAY_EMPTY_MESSAGE, 'No reviews yet for this listing.');

    const populated = await runListingReviewsLoadFlow(
      12,
      'Campus Camera',
      async (listingId) => {
        assert.equal(listingId, 12);
        return [apiReview];
      }
    );
    assert.equal(populated.status, 'populated');
    assert.equal(populated.reviews.length, 1);
    assert.equal(populated.reviews[0].reviewer_label, 'Ramika Student');
    assert.equal(populated.reviews[0].rating, 5);
    assert.equal(populated.reviews[0].comment, 'Excellent handoff.');
    assert.equal(populated.reviews[0].created_at, '2026-08-08T20:00:00.000Z');
    assert.equal(populated.reviews[0].listing_id, 12);

    const mapped = mapApiReviewToDisplayItem(apiReview, 'Campus Camera');
    assert.equal(mapped.review_id, 7);
    assert.equal(mapped.reviewer_label, 'Ramika Student');
    assert.equal('password_hash' in mapped, false);
    assert.equal('email' in mapped, false);

    const failed = await runListingReviewsLoadFlow(12, 'Campus Camera', async () => {
      throw new Error('Unable to load reviews for this listing.');
    });
    assert.equal(failed.status, 'error');
    assert.deepEqual(failed.reviews, []);
    assert.match(failed.error, /unable to load reviews/i);
  });

  test('does not fabricate reviews when API returns empty', async () => {
    const result = await runListingReviewsLoadFlow(99, undefined, async () => []);
    assert.equal(result.reviews.length, 0);
    assert.equal(result.status, 'empty');
  });
});
