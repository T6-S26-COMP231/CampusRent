/**
 * US-19.1 — rating-and-review form and display layout design.
 *
 * TAC: registered students leave ratings and reviews after a completed rental
 * so they can contribute feedback to the CampusRent community.
 *
 * Entry points (prefer existing completed-rental surfaces — US-19.2 wires UI):
 *
 *   Primary — My Requests (/my-requests)
 *     Renter’s completed RentalRequest cards already track past rentals and
 *     are linked from ListingDetailPage when status is completed.
 *
 *   Secondary — Incoming Requests (/requests)
 *     Listing owner’s completed request cards (owners may also mark complete).
 *
 *   Do not invent a standalone /reviews route for submission.
 *   Inline panel on the request card (same pattern as ReportContentForm /
 *   Mark Completed confirms), not a new navigation area.
 *
 * Conceptual flow:
 *   Completed rental → Review option available → open form
 *   → rating + written review → submit → review appears on listing detail
 *
 * Incomplete rental:
 *   Review action unavailable in the UI (do not show the form and reject later).
 *
 * Already reviewed (one review per completed transaction per reviewing student):
 *   Review action unavailable; show “already submitted” state instead of a second form.
 *
 * Form layout (US-19.2 ReviewForm):
 *   1. Heading — “Leave a review”
 *   2. Context summary — listing title + counterpart name + rental dates (read-only)
 *   3. Rating — required discrete control (scale TBD — see APPROVED_RATING_VALUES)
 *   4. Written review — required <textarea className="input-field">
 *   5. Actions — Submit (btn-primary) + Cancel (btn-secondary)
 *
 * Trust model:
 *   - rental_request_id, listing_id, reviewed_user_id come from the completed
 *     request context (never typed by the reviewer)
 *   - reviewer identity comes from authentication later (US-19.4/19.6) —
 *     never from a user-editable form field
 *
 * Rating scale:
 *   TAC confirms ratings are supported but does not specify 1–5 (or any scale).
 *   Repository / GitHub #160 / #161 / planning docs have no approved scale.
 *   Do NOT invent 1–5, half-stars, 10-point, emojis, or likes here.
 *   Rating control is abstract; concrete options are supplied when an approved
 *   source exists (same pattern as REPORT_REASON_OPTIONS for US-20).
 *
 * Written review:
 *   Required, trimmed, non-empty. No min/max length, profanity, edit/delete,
 *   or anonymous-review rules are approved — do not invent them.
 *
 * Display (US-19.2):
 *   ListingDetailPage — compact “Reviews” section under listing content.
 *   Smallest community surface: feedback about the listing from completed
 *   rentals. Each row shows reviewer display name, rating, comment, and
 *   created time when persisted. No helpful votes, replies, badges, or
 *   aggregate formulas unless later approved.
 *
 * Persistence / APIs belong to US-19.3–19.6 — not this design task.
 */

export const REVIEW_FORM_HEADING = 'Leave a review';
export const REVIEW_ENTRY_LABEL = 'Leave a review';
export const REVIEW_ALREADY_SUBMITTED_LABEL = 'Review submitted';
export const REVIEW_UNAVAILABLE_LABEL = 'Review unavailable';
export const SUBMIT_REVIEW_LABEL = 'Submit review';
export const SUBMITTING_REVIEW_LABEL = 'Submitting...';
export const CANCEL_REVIEW_LABEL = 'Cancel';
export const REVIEW_RATING_LABEL = 'Rating';
export const REVIEW_COMMENT_LABEL = 'Written review';
export const REVIEW_COMMENT_PLACEHOLDER =
  'Share your experience with this completed rental…';
export const REVIEW_SUCCESS_MESSAGE = 'Review submitted successfully.';
export const REVIEW_INCOMPLETE_RATING_MESSAGE = 'A rating is required.';
export const REVIEW_INCOMPLETE_COMMENT_MESSAGE = 'A written review is required.';
export const REVIEW_DISPLAY_HEADING = 'Reviews';
export const REVIEW_DISPLAY_EMPTY_MESSAGE = 'No reviews yet for this listing.';
export const REVIEW_RATING_SCALE_UNAPPROVED_NOTE =
  'No approved rating scale is defined yet; rating options remain unset until an approved requirement exists.';

/** RentalRequest statuses relevant to review eligibility. */
export type ReviewableRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed';

/**
 * UI eligibility for the Review action on a request card.
 * - available: completed + this student has not reviewed yet
 * - already_reviewed: completed + this student already submitted a review
 * - unavailable: rental is not completed (or viewer is not a participant)
 */
export type ReviewEligibilityState = 'available' | 'already_reviewed' | 'unavailable';

/**
 * Rating value type is intentionally unconstrained until an approved scale exists.
 * Later tasks replace this with the concrete approved domain (e.g. integer steps).
 */
export type RatingValue = string | number;

/** Option shape for the future rating control (value + display label). */
export interface RatingOption {
  value: RatingValue;
  label: string;
}

/**
 * Approved discrete rating options for the form control.
 * Intentionally empty — no approved scale exists in TAC/GitHub/repo.
 * US-19.2+ supplies options from an approved source when one is available.
 * Do not treat emptiness as “free-text rating”.
 */
export const APPROVED_RATING_VALUES: RatingOption[] = [];

/**
 * Trusted completed-rental context for opening the review form.
 * Ids come from My Requests / Incoming Requests page state only.
 */
export interface ReviewRentalContext {
  rentalRequestId: number;
  listingId: number;
  listingTitle: string;
  /** Counterpart on the rental (owner for renter; renter for owner). */
  reviewedUserId: number;
  reviewedUserName: string;
  startDate: string;
  endDate: string;
  status: ReviewableRequestStatus;
}

/**
 * Conceptual later Review document fields needed for the story.
 * Not a Mongo schema — US-19.3 owns Review.ts.
 *
 * Required relationships:
 *   - reviewer_id — authenticated student (server-derived)
 *   - rental_request_id — completed transaction (one review per reviewer+request)
 *   - listing_id — listing associated with that request (display + community context)
 *   - reviewed_user_id — rental counterpart derived from the request
 *   - rating — approved discrete value (scale TBD)
 *   - comment — written review text
 *   - created_at — persistence timestamp for display
 */
export interface ReviewRecordShape {
  id: number;
  reviewer_id: number;
  rental_request_id: number;
  listing_id: number;
  reviewed_user_id: number;
  rating: RatingValue;
  comment: string;
  created_at: string;
}

/** Conceptual POST body for later create-review API — no reviewer_id. */
export interface SubmitReviewBody {
  rental_request_id: number;
  rating: RatingValue;
  comment: string;
}

/** Display row for ListingDetailPage reviews section. */
export interface ReviewDisplayItem {
  review_id: number;
  reviewer_label: string;
  rating: RatingValue;
  comment: string;
  created_at: string;
  listing_id: number;
  listing_title?: string;
}

export interface ReviewSubmitGate {
  context: ReviewRentalContext | null;
  rating: RatingValue | null | undefined;
  comment: string;
  submitting: boolean;
  viewerId: number | string | undefined;
  /** True when this viewer already has a review for the rental_request_id. */
  alreadyReviewed: boolean;
}

export function toPositiveIntId(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

export function sameEntityId(left: unknown, right: unknown): boolean {
  const a = toPositiveIntId(left);
  const b = toPositiveIntId(right);
  return a != null && b != null && a === b;
}

export function isCompletedRentalStatus(status: string | undefined | null): boolean {
  return status === 'completed';
}

/**
 * Hook for later UI once an approved rating scale exists.
 * Returns false when the approved list is empty or the value is not listed.
 */
export function isApprovedRatingValue(
  rating: RatingValue | null | undefined,
  approved: readonly RatingOption[] = APPROVED_RATING_VALUES
): boolean {
  if (rating === null || rating === undefined || rating === '') return false;
  if (!approved.length) return false;
  return approved.some((option) => option.value === rating);
}

/** Presence check only — not membership in an invented scale. */
export function hasSelectedRating(rating: RatingValue | null | undefined): boolean {
  if (rating === null || rating === undefined) return false;
  if (typeof rating === 'string') return rating.trim().length > 0;
  return typeof rating === 'number' && Number.isFinite(rating);
}

export function normalizeReviewComment(raw: string): string {
  return raw.trim();
}

export function isBlankReviewComment(raw: string): boolean {
  return normalizeReviewComment(raw).length === 0;
}

/**
 * Build trusted review context from an enriched RentalRequest row.
 * Counterpart is the other participant — never typed by the reviewer.
 */
export function toReviewRentalContext(
  request: {
    id: number | string;
    listing_id: number | string;
    renter_id: number | string;
    start_date: string;
    end_date: string;
    status: string;
    listing?: { id?: number | string; title?: string } | null;
    owner?: { id?: number | string; first_name?: string; last_name?: string } | null;
    renter?: { id?: number | string; first_name?: string; last_name?: string } | null;
  },
  viewerId: number | string | undefined
): ReviewRentalContext | null {
  const viewer = toPositiveIntId(viewerId);
  const requestId = toPositiveIntId(request.id);
  const listingId = toPositiveIntId(request.listing?.id ?? request.listing_id);
  const renterId = toPositiveIntId(request.renter?.id ?? request.renter_id);
  const ownerId = toPositiveIntId(request.owner?.id);

  if (viewer == null || requestId == null || listingId == null || renterId == null) {
    return null;
  }

  const isRenter = viewer === renterId;
  const isOwner = ownerId != null && viewer === ownerId;
  if (!isRenter && !isOwner) return null;

  let reviewedUserId: number | null;
  let reviewedUserName: string;
  if (isRenter) {
    reviewedUserId = ownerId;
    reviewedUserName = request.owner
      ? `${request.owner.first_name ?? ''} ${request.owner.last_name ?? ''}`.trim()
      : '';
  } else {
    reviewedUserId = renterId;
    reviewedUserName = request.renter
      ? `${request.renter.first_name ?? ''} ${request.renter.last_name ?? ''}`.trim()
      : '';
  }

  if (reviewedUserId == null) return null;

  return {
    rentalRequestId: requestId,
    listingId,
    listingTitle: request.listing?.title?.trim() || 'Untitled listing',
    reviewedUserId,
    reviewedUserName: reviewedUserName || `User #${reviewedUserId}`,
    startDate: request.start_date,
    endDate: request.end_date,
    status: request.status as ReviewableRequestStatus,
  };
}

/** Read-only summary above the form controls. */
export function reviewContextSummary(context: ReviewRentalContext): string {
  return `Listing: ${context.listingTitle} · With: ${context.reviewedUserName}`;
}

/**
 * Eligibility for showing the Review action.
 * Incomplete rentals never reach “available”.
 */
export function reviewEligibility(options: {
  status: string | undefined | null;
  alreadyReviewed: boolean;
  isParticipant: boolean;
}): ReviewEligibilityState {
  if (!options.isParticipant) return 'unavailable';
  if (!isCompletedRentalStatus(options.status)) return 'unavailable';
  if (options.alreadyReviewed) return 'already_reviewed';
  return 'available';
}

export function reviewActionAvailable(state: ReviewEligibilityState): boolean {
  return state === 'available';
}

export function reviewEntryLabel(state: ReviewEligibilityState): string {
  if (state === 'available') return REVIEW_ENTRY_LABEL;
  if (state === 'already_reviewed') return REVIEW_ALREADY_SUBMITTED_LABEL;
  return REVIEW_UNAVAILABLE_LABEL;
}

/**
 * My Requests / Incoming Requests card controls for US-19.2.
 * Incomplete → hide Review; completed+reviewed → label only; completed → show action.
 */
export function completedRentalReviewControls(
  request: Parameters<typeof toReviewRentalContext>[0],
  viewerId: number | string | undefined,
  alreadyReviewed: boolean
): {
  context: ReviewRentalContext | null;
  eligibility: ReviewEligibilityState;
  showReviewAction: boolean;
  entryLabel: string;
} {
  const context = toReviewRentalContext(request, viewerId);
  const eligibility = reviewEligibility({
    status: request.status,
    alreadyReviewed,
    isParticipant: context != null,
  });
  return {
    context,
    eligibility,
    showReviewAction: reviewActionAvailable(eligibility),
    entryLabel: reviewEntryLabel(eligibility),
  };
}

export function reviewValidationMessages(
  gate: Pick<ReviewSubmitGate, 'rating' | 'comment'>
): { rating: string; comment: string } {
  return {
    rating: hasSelectedRating(gate.rating) ? '' : REVIEW_INCOMPLETE_RATING_MESSAGE,
    comment: isBlankReviewComment(gate.comment) ? REVIEW_INCOMPLETE_COMMENT_MESSAGE : '',
  };
}

/**
 * Client gate before any future network call.
 * Incomplete rentals, already-reviewed, blank fields, and double-submit are blocked.
 * When an approved scale exists, rating must be a member of that scale.
 */
export function canSubmitReview(gate: ReviewSubmitGate): boolean {
  if (gate.submitting) return false;
  if (!gate.context) return false;
  if (gate.alreadyReviewed) return false;
  if (!isCompletedRentalStatus(gate.context.status)) return false;

  const viewer = toPositiveIntId(gate.viewerId);
  if (viewer == null) return false;

  const messages = reviewValidationMessages(gate);
  if (messages.rating || messages.comment) return false;

  if (APPROVED_RATING_VALUES.length > 0 && !isApprovedRatingValue(gate.rating)) {
    return false;
  }

  return true;
}

/** Pure request descriptor — no reviewer_id / listing_id / reviewed_user_id. */
export function buildSubmitReviewBody(
  context: ReviewRentalContext,
  rating: RatingValue,
  comment: string
): SubmitReviewBody {
  return {
    rental_request_id: context.rentalRequestId,
    rating,
    comment: normalizeReviewComment(comment),
  };
}

export function reviewSubmitBodyExcludesClientIdentity(body: SubmitReviewBody): boolean {
  const keys = Object.keys(body);
  return (
    keys.length === 3 &&
    keys.includes('rental_request_id') &&
    keys.includes('rating') &&
    keys.includes('comment') &&
    !('reviewer_id' in body) &&
    !('listing_id' in body) &&
    !('reviewed_user_id' in body)
  );
}

/** Map a persisted review (+ reviewer label) into the listing display row. */
export function toReviewDisplayItem(
  review: Pick<
    ReviewRecordShape,
    'id' | 'rating' | 'comment' | 'created_at' | 'listing_id'
  >,
  reviewerLabel: string,
  listingTitle?: string
): ReviewDisplayItem {
  return {
    review_id: review.id,
    reviewer_label: reviewerLabel.trim() || 'CampusRent student',
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    listing_id: review.listing_id,
    listing_title: listingTitle,
  };
}

export function reviewDisplayHeading(): string {
  return REVIEW_DISPLAY_HEADING;
}

export function formatReviewTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

/**
 * Workflow steps for later implementation tasks (documentation helper).
 * Not an executable pipeline.
 */
export const REVIEW_WORKFLOW_STEPS = [
  'completed_rental_visible',
  'review_action_available',
  'open_review_form',
  'enter_rating_and_comment',
  'submit_review',
  'display_on_listing_detail',
] as const;

export type ReviewWorkflowStep = (typeof REVIEW_WORKFLOW_STEPS)[number];
