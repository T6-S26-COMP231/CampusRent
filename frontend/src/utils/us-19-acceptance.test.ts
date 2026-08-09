/**
 * US-19.7 — frontend helper coverage mapped to Team6 TAC ratings/reviews UX.
 *
 * TAC Test 1 — Review completed rental → Review form displayed
 * TAC Test 2 — Review incomplete rental → Review option unavailable
 * TAC Test 3 — Submit review → Review saved successfully
 * TAC Test 4 — Submit incomplete review → Validation error displayed
 *
 * Also covers one-review/duplicate UX, 1–5 whole-star decision, listing display
 * states, and create-body trust model at the acceptance level.
 *
 * Broader detail remains in ratingsReviews.test.ts and
 * ratingsReviews.integration.test.ts. This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; ReviewForm /
 * ListingReviews / MyRequestsPage / ListingDetailPage rendering is not
 * exercised here. Form “display” is proven through the helper/form contract
 * those pages use.
 *
 * Do NOT claim production Overall Result: PASSED — US-19.8 owns merge/deploy/manual acceptance.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REVIEW_ALREADY_SUBMITTED_LABEL,
  REVIEW_DISPLAY_EMPTY_MESSAGE,
  REVIEW_DUPLICATE_MESSAGE,
  REVIEW_ENTRY_LABEL,
  REVIEW_FORM_HEADING,
  REVIEW_INCOMPLETE_COMMENT_MESSAGE,
  REVIEW_INCOMPLETE_RATING_MESSAGE,
  REVIEW_SUCCESS_MESSAGE,
  REVIEW_UNAVAILABLE_LABEL,
  STAR_RATING_MAX,
  STAR_RATING_MIN,
  WHOLE_STAR_RATINGS,
  buildCreateReviewCall,
  buildGetListingReviewsCall,
  canSubmitReview,
  claimsReviewSavedSuccessfully,
  isHalfStarOrInvalidRating,
  isWholeStarRating,
  listingReviewsUiStatus,
  mapApiReviewToDisplayItem,
  myRequestsReviewControls,
  reviewSubmitBodyExcludesClientIdentity,
  reviewValidationMessages,
  runListingReviewsLoadFlow,
  runReviewSubmitFlow,
  toReviewRentalContext,
  type ListingReviewApiItem,
  type SubmitReviewBody,
} from './ratingsReviews';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_19_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-19.8' as const;
export const US_19_PRODUCTION_ACCEPTANCE_REASON =
  'US-19.8 owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

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

describe('US-19 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Review completed rental: Review form displayed / action available', () => {
    const controls = myRequestsReviewControls(completedRequest, 9, false);

    assert.equal(controls.showReviewAction, true);
    assert.equal(controls.entryLabel, REVIEW_ENTRY_LABEL);
    assert.equal(controls.eligibility, 'available');
    assert.ok(controls.context);
    assert.equal(controls.context!.rentalRequestId, 21);
    assert.equal(controls.context!.listingId, 12);
    assert.equal(controls.context!.status, 'completed');
    assert.equal(REVIEW_FORM_HEADING, 'Leave a review');
    assert.equal(REVIEW_ENTRY_LABEL, 'Leave a review');

    assert.equal(
      canSubmitReview({
        context: controls.context,
        rating: 5,
        comment: 'Ready to submit.',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      true
    );
    assert.equal(US_19_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-19.8');
  });

  test('TAC Test 2 — Review incomplete rental: Review option unavailable', async () => {
    for (const status of ['pending', 'accepted', 'declined', 'cancelled'] as const) {
      const controls = myRequestsReviewControls(
        { ...completedRequest, status },
        9,
        false
      );
      assert.equal(controls.showReviewAction, false, status);
      assert.equal(controls.eligibility, 'unavailable', status);
      assert.equal(controls.entryLabel, REVIEW_UNAVAILABLE_LABEL, status);
    }

    // Incomplete rentals must not produce a create call through the submit flow.
    let called = false;
    const pendingContext = toReviewRentalContext(
      { ...completedRequest, status: 'pending' },
      9
    )!;
    const result = await runReviewSubmitFlow(
      { ...pendingContext, status: 'pending' },
      4,
      'Should not post',
      async () => {
        called = true;
        return apiReview;
      }
    );
    assert.equal(called, false);
    assert.equal(result.body, null);
    assert.equal(result.success, '');
    assert.match(result.error, /completed rental/i);
  });

  test('TAC Test 3 — Submit review: Review saved successfully', async () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    let submitted: SubmitReviewBody | null = null;

    const call = buildCreateReviewCall(context, 5, '  Excellent handoff.  ');
    assert.equal(call.path, '/reviews');
    assert.equal(call.method, 'POST');
    assert.equal(reviewSubmitBodyExcludesClientIdentity(call.body), true);
    assert.equal('reviewer_id' in call.body, false);
    assert.equal('listing_id' in call.body, false);
    assert.equal('reviewed_user_id' in call.body, false);

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

    const listCall = buildGetListingReviewsCall(12);
    assert.equal(listCall.path, '/listings/12/reviews');
    assert.equal(listCall.method, 'GET');
  });

  test('TAC Test 4 — Submit incomplete review: Validation error displayed', () => {
    const missingRating = reviewValidationMessages({
      rating: null,
      comment: 'Has comment',
    });
    assert.equal(missingRating.rating, REVIEW_INCOMPLETE_RATING_MESSAGE);
    assert.equal(missingRating.comment, '');

    const missingComment = reviewValidationMessages({
      rating: 3,
      comment: '',
    });
    assert.equal(missingComment.rating, '');
    assert.equal(missingComment.comment, REVIEW_INCOMPLETE_COMMENT_MESSAGE);

    const whitespace = reviewValidationMessages({
      rating: 3,
      comment: '   \n\t  ',
    });
    assert.equal(whitespace.comment, REVIEW_INCOMPLETE_COMMENT_MESSAGE);

    const context = toReviewRentalContext(completedRequest, 9);
    assert.equal(
      canSubmitReview({
        context,
        rating: null,
        comment: 'Has comment',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );
    assert.equal(
      canSubmitReview({
        context,
        rating: 3,
        comment: '   ',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );
  });

  test('one-review regression — duplicate 409 maps to already-reviewed UX', async () => {
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

    const after = myRequestsReviewControls(completedRequest, 9, true);
    assert.equal(after.showReviewAction, false);
    assert.equal(after.entryLabel, REVIEW_ALREADY_SUBMITTED_LABEL);
  });

  test('rating decision — whole numbers 1–5 only; half-stars rejected', () => {
    assert.deepEqual(WHOLE_STAR_RATINGS, [1, 2, 3, 4, 5]);
    assert.equal(STAR_RATING_MIN, 1);
    assert.equal(STAR_RATING_MAX, 5);
    assert.equal(isWholeStarRating(1), true);
    assert.equal(isWholeStarRating(5), true);
    assert.equal(isWholeStarRating(3.5), false);
    assert.equal(isHalfStarOrInvalidRating(3.5), true);
    assert.equal(isWholeStarRating(0), false);
    assert.equal(isWholeStarRating(6), false);
    assert.equal(isWholeStarRating('5'), false);
  });

  test('listing review display — loading/empty/populated/error; API shape maps cleanly', async () => {
    assert.equal(listingReviewsUiStatus(true, '', 0), 'loading');

    const empty = await runListingReviewsLoadFlow(12, 'Campus Camera', async () => []);
    assert.equal(empty.status, 'empty');
    assert.deepEqual(empty.reviews, []);
    assert.equal(REVIEW_DISPLAY_EMPTY_MESSAGE, 'No reviews yet for this listing.');

    const populated = await runListingReviewsLoadFlow(12, 'Campus Camera', async () => [
      apiReview,
    ]);
    assert.equal(populated.status, 'populated');
    assert.equal(populated.reviews.length, 1);
    assert.equal(populated.reviews[0].reviewer_label, 'Ramika Student');
    assert.equal(populated.reviews[0].rating, 5);
    assert.equal(populated.reviews[0].comment, 'Excellent handoff.');
    assert.equal(populated.reviews[0].created_at, '2026-08-08T20:00:00.000Z');

    const mapped = mapApiReviewToDisplayItem(apiReview, 'Campus Camera');
    assert.equal(mapped.review_id, 7);
    assert.equal(mapped.reviewer_label, 'Ramika Student');
    assert.equal('aggregate' in mapped, false);
    assert.equal('helpful_votes' in mapped, false);

    const failed = await runListingReviewsLoadFlow(12, 'Campus Camera', async () => {
      throw new Error('Unable to load reviews for this listing.');
    });
    assert.equal(failed.status, 'error');
    assert.deepEqual(failed.reviews, []);
    assert.match(failed.error, /unable to load reviews/i);
  });
});
