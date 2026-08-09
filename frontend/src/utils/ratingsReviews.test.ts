/**
 * US-19.1 — rating-and-review form / display design helpers.
 * Pure design rules only; no persistence or API calls.
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
  REVIEW_RATING_LABEL,
  REVIEW_RATING_SCALE_UNAPPROVED_NOTE,
  REVIEW_UNAVAILABLE_LABEL,
  REVIEW_WORKFLOW_STEPS,
  buildSubmitReviewBody,
  canSubmitReview,
  completedRentalReviewControls,
  hasSelectedRating,
  isApprovedRatingValue,
  isCompletedRentalStatus,
  reviewActionAvailable,
  reviewContextSummary,
  reviewEligibility,
  reviewSubmitBodyExcludesClientIdentity,
  reviewValidationMessages,
  toReviewDisplayItem,
  toReviewRentalContext,
  type RatingOption,
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
  test('completed + not reviewed → review action available on request surfaces', () => {
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

    const renterControls = completedRentalReviewControls(completedRequest, 9, false);
    assert.equal(renterControls.showReviewAction, true);
    assert.equal(renterControls.entryLabel, REVIEW_ENTRY_LABEL);
    assert.ok(renterControls.context);
    assert.equal(renterControls.context!.rentalRequestId, 21);
    assert.equal(renterControls.context!.reviewedUserId, 4);
    assert.equal(renterControls.context!.listingId, 12);

    const ownerControls = completedRentalReviewControls(completedRequest, 4, false);
    assert.equal(ownerControls.showReviewAction, true);
    assert.equal(ownerControls.context!.reviewedUserId, 9);
  });

  test('incomplete rental → review option unavailable (all non-completed statuses)', () => {
    for (const status of ['pending', 'accepted', 'declined', 'cancelled'] as const) {
      assert.equal(isCompletedRentalStatus(status), false);
      assert.equal(
        reviewEligibility({
          status,
          alreadyReviewed: false,
          isParticipant: true,
        }),
        'unavailable'
      );
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
        rating: 'placeholder',
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

    const body = buildSubmitReviewBody(context!, 'pending-scale', '  Smooth handoff.  ');
    assert.equal(body.rental_request_id, 21);
    assert.equal(body.comment, 'Smooth handoff.');
    assert.equal(reviewSubmitBodyExcludesClientIdentity(body), true);
    assert.equal('reviewer_id' in body, false);
    assert.equal('listing_id' in body, false);
    assert.equal('reviewed_user_id' in body, false);
  });

  test('no approved rating scale invented; abstract control stays empty until approved', () => {
    assert.deepEqual(APPROVED_RATING_VALUES, []);
    assert.match(REVIEW_RATING_SCALE_UNAPPROVED_NOTE, /No approved rating scale/i);
    assert.equal(isApprovedRatingValue(5), false);
    assert.equal(isApprovedRatingValue(5, []), false);
    assert.equal(hasSelectedRating(null), false);
    assert.equal(hasSelectedRating(undefined), false);
    assert.equal(hasSelectedRating(''), false);

    // When an approved scale appears later, membership is enforced.
    const approved: RatingOption[] = [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
    ];
    assert.equal(isApprovedRatingValue(1, approved), true);
    assert.equal(isApprovedRatingValue(5, approved), false);
    assert.equal(isApprovedRatingValue(1.5, approved), false);
  });

  test('incomplete review validation: missing rating or blank comment', () => {
    const missingBoth = reviewValidationMessages({ rating: null, comment: '   ' });
    assert.equal(missingBoth.rating, REVIEW_INCOMPLETE_RATING_MESSAGE);
    assert.equal(missingBoth.comment, REVIEW_INCOMPLETE_COMMENT_MESSAGE);

    const context = toReviewRentalContext(completedRequest, 9);
    assert.equal(
      canSubmitReview({
        context,
        rating: null,
        comment: 'Has comment only',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );
    assert.equal(
      canSubmitReview({
        context,
        rating: 'selected',
        comment: '   ',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );
    // With empty approved scale, a selected rating + non-blank comment may submit
    // at the client gate; membership checks activate once a scale is approved.
    assert.equal(
      canSubmitReview({
        context,
        rating: 'selected',
        comment: 'Great experience.',
        submitting: false,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      true
    );
    assert.equal(
      canSubmitReview({
        context,
        rating: 'selected',
        comment: 'Great experience.',
        submitting: true,
        viewerId: 9,
        alreadyReviewed: false,
      }),
      false
    );
  });

  test('review display layout is listing-detail scoped without invented extras', () => {
    assert.equal(REVIEW_DISPLAY_HEADING, 'Reviews');
    assert.equal(REVIEW_DISPLAY_EMPTY_MESSAGE, 'No reviews yet for this listing.');

    const item = toReviewDisplayItem(
      {
        id: 7,
        rating: 'selected',
        comment: 'Item was as described.',
        created_at: '2026-08-08T20:00:00.000Z',
        listing_id: 12,
      },
      'Ramika Student',
      'Campus Camera'
    );
    assert.equal(item.review_id, 7);
    assert.equal(item.reviewer_label, 'Ramika Student');
    assert.equal(item.rating, 'selected');
    assert.equal(item.comment, 'Item was as described.');
    assert.equal(item.listing_id, 12);
    assert.equal(item.listing_title, 'Campus Camera');
    assert.equal('helpful_votes' in item, false);
    assert.equal('replies' in item, false);
    assert.equal('verified_purchase' in item, false);
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

  test('non-participant cannot obtain review context or action', () => {
    const controls = completedRentalReviewControls(completedRequest, 99, false);
    assert.equal(controls.context, null);
    assert.equal(controls.eligibility, 'unavailable');
    assert.equal(controls.showReviewAction, false);
  });
});
