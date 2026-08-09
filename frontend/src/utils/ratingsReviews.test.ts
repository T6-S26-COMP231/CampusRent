/**
 * US-19.1 / US-19.2 — rating-and-review helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  APPROVED_RATING_VALUES,
  REVIEW_ALREADY_SUBMITTED_LABEL,
  REVIEW_COMMENT_LABEL,
  REVIEW_DISPLAY_EMPTY_MESSAGE,
  REVIEW_DISPLAY_HEADING,
  REVIEW_ENTRY_LABEL,
  REVIEW_FORM_HEADING,
  REVIEW_INCOMPLETE_COMMENT_MESSAGE,
  REVIEW_INCOMPLETE_RATING_MESSAGE,
  REVIEW_NOT_CONNECTED_MESSAGE,
  REVIEW_RATING_LABEL,
  REVIEW_SUCCESS_MESSAGE,
  REVIEW_UNAVAILABLE_LABEL,
  REVIEW_WORKFLOW_STEPS,
  STAR_RATING_MAX,
  STAR_RATING_MIN,
  WHOLE_STAR_RATINGS,
  applyCancelledReviewForm,
  applyUnconnectedReviewSubmit,
  buildSubmitReviewBody,
  canSubmitReview,
  claimsReviewSavedSuccessfully,
  completedRentalReviewControls,
  filledStarCount,
  hasSelectedRating,
  isApprovedRatingValue,
  isCompletedRentalStatus,
  isHalfStarOrInvalidRating,
  isWholeStarRating,
  myRequestsReviewControls,
  reviewActionAvailable,
  reviewContextSummary,
  reviewEligibility,
  reviewSubmitBodyExcludesClientIdentity,
  reviewValidationMessages,
  toReviewDisplayItem,
  toReviewRentalContext,
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

describe('US-19.1 rating-and-review form and display design', () => {
  test('completed + not reviewed → review action available on My Requests (renter)', () => {
    assert.equal(isCompletedRentalStatus('completed'), true);
    assert.equal(
      reviewEligibility({
        status: 'completed',
        alreadyReviewed: false,
        isParticipant: true,
      }),
      'available'
    );
    assert.equal(reviewActionAvailable('available'), true);

    const renterControls = myRequestsReviewControls(completedRequest, 9, false);
    assert.equal(renterControls.showReviewAction, true);
    assert.equal(renterControls.entryLabel, REVIEW_ENTRY_LABEL);
    assert.ok(renterControls.context);
    assert.equal(renterControls.context!.rentalRequestId, 21);
    assert.equal(renterControls.context!.reviewedUserId, 4);
    assert.equal(renterControls.context!.listingId, 12);
  });

  test('incomplete rental → review option unavailable (all non-completed statuses)', () => {
    for (const status of ['pending', 'accepted', 'declined', 'cancelled'] as const) {
      assert.equal(isCompletedRentalStatus(status), false);
      const controls = completedRentalReviewControls(
        { ...completedRequest, status },
        9,
        false
      );
      assert.equal(controls.showReviewAction, false);
      assert.equal(controls.entryLabel, REVIEW_UNAVAILABLE_LABEL);
      assert.equal(reviewActionAvailable(controls.eligibility), false);
    }
  });

  test('already reviewed → second review unavailable', () => {
    assert.equal(
      reviewEligibility({
        status: 'completed',
        alreadyReviewed: true,
        isParticipant: true,
      }),
      'already_reviewed'
    );
    const controls = completedRentalReviewControls(completedRequest, 9, true);
    assert.equal(controls.showReviewAction, false);
    assert.equal(controls.entryLabel, REVIEW_ALREADY_SUBMITTED_LABEL);
    assert.equal(
      canSubmitReview({
        context: controls.context,
        rating: 5,
        comment: 'Great rental.',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: true,
      }),
      false
    );
  });

  test('form layout contract: rating + written review; trusted context; no typed ids', () => {
    assert.equal(REVIEW_FORM_HEADING, 'Leave a review');
    assert.equal(REVIEW_RATING_LABEL, 'Rating');
    assert.equal(REVIEW_COMMENT_LABEL, 'Written review');

    const context = toReviewRentalContext(completedRequest, 9);
    assert.ok(context);
    assert.equal(
      reviewContextSummary(context!),
      'Listing: Campus Camera · With: Test Owner'
    );

    const body = buildSubmitReviewBody(context!, 4, '  Smooth handoff.  ');
    assert.equal(body.rental_request_id, 21);
    assert.equal(body.rating, 4);
    assert.equal(body.comment, 'Smooth handoff.');
    assert.equal(reviewSubmitBodyExcludesClientIdentity(body), true);
    assert.equal('reviewer_id' in body, false);
    assert.equal('listing_id' in body, false);
    assert.equal('reviewed_user_id' in body, false);
  });

  test('workflow steps cover completed rental through listing display', () => {
    assert.deepEqual(REVIEW_WORKFLOW_STEPS, [
      'completed_rental_visible',
      'review_action_available',
      'open_review_form',
      'enter_rating_and_comment',
      'submit_review',
      'display_on_listing_detail',
    ]);
  });

  test('non-participant and owner cannot obtain renter review context', () => {
    assert.equal(completedRentalReviewControls(completedRequest, 99, false).context, null);
    assert.equal(completedRentalReviewControls(completedRequest, 4, false).showReviewAction, false);
    assert.equal(toReviewRentalContext(completedRequest, 4), null);
  });
});

describe('US-19.2 review form, rating control, and review display helpers', () => {
  test('completed eligible rental shows Review action; incomplete does not expose form', () => {
    const completed = myRequestsReviewControls(completedRequest, 9, false);
    assert.equal(completed.showReviewAction, true);
    assert.equal(completed.eligibility, 'available');
    assert.ok(completed.context);

    const pending = myRequestsReviewControls(
      { ...completedRequest, status: 'pending' },
      9,
      false
    );
    assert.equal(pending.showReviewAction, false);
    assert.equal(pending.eligibility, 'unavailable');
  });

  test('rating 1–5 selectable; half-stars and out-of-range rejected', () => {
    assert.deepEqual(WHOLE_STAR_RATINGS, [1, 2, 3, 4, 5]);
    assert.equal(STAR_RATING_MIN, 1);
    assert.equal(STAR_RATING_MAX, 5);
    assert.equal(APPROVED_RATING_VALUES.length, 5);

    for (const value of WHOLE_STAR_RATINGS) {
      assert.equal(isWholeStarRating(value), true);
      assert.equal(isApprovedRatingValue(value), true);
      assert.equal(hasSelectedRating(value), true);
    }

    assert.equal(isWholeStarRating(0), false);
    assert.equal(isWholeStarRating(6), false);
    assert.equal(isWholeStarRating(1.5), false);
    assert.equal(isApprovedRatingValue(1.5), false);
    assert.equal(isHalfStarOrInvalidRating(2.5), true);
    assert.equal(isHalfStarOrInvalidRating(3), false);
    assert.equal(hasSelectedRating(null), false);
  });

  test('rating and comment required; whitespace-only comment rejected', () => {
    const missing = reviewValidationMessages({ rating: null, comment: '   ' });
    assert.equal(missing.rating, REVIEW_INCOMPLETE_RATING_MESSAGE);
    assert.equal(missing.comment, REVIEW_INCOMPLETE_COMMENT_MESSAGE);

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
        comment: '\n\t ',
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
        comment: 'Great experience.',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      true
    );
  });

  test('valid form builds correct submission data without client identity fields', () => {
    const context = toReviewRentalContext(completedRequest, 9)!;
    const body = buildSubmitReviewBody(context, 5, '  Excellent handoff.  ');
    assert.deepEqual(body, {
      rental_request_id: 21,
      rating: 5,
      comment: 'Excellent handoff.',
    });
    assert.equal(reviewSubmitBodyExcludesClientIdentity(body), true);
    assert.throws(() => buildSubmitReviewBody(context, 2.5 as never, 'Nope'));
  });

  test('cancel resets form draft; unconnected submit never claims saved success', () => {
    const cleared = applyCancelledReviewForm();
    assert.equal(cleared.rating, null);
    assert.equal(cleared.comment, '');
    assert.equal(cleared.notice, '');

    const unconnected = applyUnconnectedReviewSubmit();
    assert.equal(unconnected.notice, REVIEW_NOT_CONNECTED_MESSAGE);
    assert.equal(unconnected.success, '');
    assert.equal(claimsReviewSavedSuccessfully(unconnected.notice), false);
    assert.equal(claimsReviewSavedSuccessfully(REVIEW_SUCCESS_MESSAGE), true);
  });

  test('review display renders reviewer/rating/comment; empty state is truthful', () => {
    assert.equal(REVIEW_DISPLAY_HEADING, 'Reviews');
    assert.equal(REVIEW_DISPLAY_EMPTY_MESSAGE, 'No reviews yet for this listing.');

    const item = toReviewDisplayItem(
      {
        id: 7,
        rating: 4,
        comment: 'Item was as described.',
        created_at: '2026-08-08T20:00:00.000Z',
        listing_id: 12,
      },
      'Ramika Student',
      'Campus Camera'
    );
    assert.equal(item.reviewer_label, 'Ramika Student');
    assert.equal(item.rating, 4);
    assert.equal(item.comment, 'Item was as described.');
    assert.equal(filledStarCount(item.rating), 4);
    assert.equal(filledStarCount(1.5 as never), 0);
    assert.equal('helpful_votes' in item, false);
    assert.equal('aggregate' in item, false);
  });
});
