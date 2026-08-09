/**
 * US-19.1 / US-19.2 — rating-and-review form and display helpers.
 *
 * TAC: registered students leave ratings and reviews after a completed rental
 * so they can contribute feedback to the CampusRent community.
 *
 * Entry point for US-19.2 UI (smallest story-satisfying surface):
 *
 *   My Requests (/my-requests) — renter’s completed RentalRequest cards.
 *   Inline ReviewForm panel (same pattern as ReportContentForm / confirms).
 *   Owner-side Incoming Requests is not wired in #162 to avoid inventing
 *   bidirectional review rules before the story clarifies direction.
 *
 * Conceptual flow:
 *   Completed rental → Review option available → open form
 *   → rating + written review → submit (API in US-19.4/19.6)
 *   → review appears on ListingDetailPage Reviews section
 *
 * Incomplete rental: Review action unavailable.
 * Already reviewed: “Review submitted” — no second form (API later supplies truth).
 *
 * Rating scale (team implementation decision documented on GitHub #162):
 *   1–5 whole-number stars, required, no half-stars.
 *   This is a CampusRent team decision for implementation — not an instructor TAC scale.
 *
 * Written review: required, trimmed, non-empty. No min/max/profanity/anonymous rules.
 *
 * Persistence / APIs belong to US-19.3–19.6.
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
/** Only after a real backend save (US-19.6). Do not show from the UI-only form. */
export const REVIEW_SUCCESS_MESSAGE = 'Review submitted successfully.';
export const REVIEW_NOT_CONNECTED_MESSAGE = 'Review submission is not connected yet.';
export const REVIEW_INCOMPLETE_RATING_MESSAGE = 'A rating is required.';
export const REVIEW_INCOMPLETE_COMMENT_MESSAGE = 'A written review is required.';
export const REVIEW_DISPLAY_HEADING = 'Reviews';
export const REVIEW_DISPLAY_EMPTY_MESSAGE = 'No reviews yet for this listing.';

/** Team decision (#162): whole-number stars from 1 through 5. */
export const STAR_RATING_MIN = 1;
export const STAR_RATING_MAX = 5;
export const WHOLE_STAR_RATINGS = [1, 2, 3, 4, 5] as const;
export type StarRating = (typeof WHOLE_STAR_RATINGS)[number];
export type RatingValue = StarRating;

export interface RatingOption {
  value: StarRating;
  label: string;
}

/**
 * Team-approved discrete rating options for the form control (GitHub #162).
 * Whole numbers 1–5 only — no half-stars, 0, or values above 5.
 */
export const APPROVED_RATING_VALUES: RatingOption[] = WHOLE_STAR_RATINGS.map((value) => ({
  value,
  label: String(value),
}));

export type ReviewableRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed';

export type ReviewEligibilityState = 'available' | 'already_reviewed' | 'unavailable';

/**
 * Trusted completed-rental context for opening the review form.
 * Ids come from My Requests page state only (renter flow for US-19.2).
 */
export interface ReviewRentalContext {
  rentalRequestId: number;
  listingId: number;
  listingTitle: string;
  /** Listing owner — counterpart for the reviewing renter. */
  reviewedUserId: number;
  reviewedUserName: string;
  startDate: string;
  endDate: string;
  status: ReviewableRequestStatus;
}

/**
 * Conceptual later Review document fields (US-19.3 owns Review.ts).
 */
export interface ReviewRecordShape {
  id: number;
  reviewer_id: number;
  rental_request_id: number;
  listing_id: number;
  reviewed_user_id: number;
  rating: StarRating;
  comment: string;
  created_at: string;
}

/** Conceptual POST body for later create-review API — no reviewer_id. */
export interface SubmitReviewBody {
  rental_request_id: number;
  rating: StarRating;
  comment: string;
}

export interface ReviewDisplayItem {
  review_id: number;
  reviewer_label: string;
  rating: StarRating;
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
  alreadyReviewed: boolean;
}

export type EnrichedRentalRequestLike = {
  id: number | string;
  listing_id: number | string;
  renter_id: number | string;
  start_date: string;
  end_date: string;
  status: string;
  listing?: { id?: number | string; title?: string } | null;
  owner?: { id?: number | string; first_name?: string; last_name?: string } | null;
  renter?: { id?: number | string; first_name?: string; last_name?: string } | null;
};

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

/** True only for whole-number values in 1..5 (no halves, 0, or >5). */
export function isWholeStarRating(value: unknown): value is StarRating {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= STAR_RATING_MIN &&
    value <= STAR_RATING_MAX
  );
}

export function isApprovedRatingValue(
  rating: RatingValue | null | undefined,
  approved: readonly RatingOption[] = APPROVED_RATING_VALUES
): boolean {
  if (!isWholeStarRating(rating)) return false;
  if (!approved.length) return false;
  return approved.some((option) => option.value === rating);
}

export function hasSelectedRating(rating: RatingValue | null | undefined): boolean {
  return isApprovedRatingValue(rating);
}

/** Reject half-stars and other non-members of the 1–5 whole-star set. */
export function isHalfStarOrInvalidRating(value: unknown): boolean {
  if (typeof value === 'number' && !Number.isInteger(value)) return true;
  return !isWholeStarRating(value) && value !== null && value !== undefined && value !== '';
}

export function normalizeReviewComment(raw: string): string {
  return raw.trim();
}

export function isBlankReviewComment(raw: string): boolean {
  return normalizeReviewComment(raw).length === 0;
}

/**
 * Build trusted review context for the reviewing renter only (US-19.2).
 * Owner-side review entry is not enabled here.
 */
export function toReviewRentalContext(
  request: EnrichedRentalRequestLike,
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

  // US-19.2: renter-side My Requests only — do not open owner review here.
  if (viewer !== renterId) return null;
  if (ownerId == null) return null;

  const reviewedUserName = request.owner
    ? `${request.owner.first_name ?? ''} ${request.owner.last_name ?? ''}`.trim()
    : '';

  return {
    rentalRequestId: requestId,
    listingId,
    listingTitle: request.listing?.title?.trim() || 'Untitled listing',
    reviewedUserId: ownerId,
    reviewedUserName: reviewedUserName || `User #${ownerId}`,
    startDate: request.start_date,
    endDate: request.end_date,
    status: request.status as ReviewableRequestStatus,
  };
}

export function reviewContextSummary(context: ReviewRentalContext): string {
  return `Listing: ${context.listingTitle} · With: ${context.reviewedUserName}`;
}

export function reviewDateRangeSummary(context: ReviewRentalContext): string {
  const start = formatReviewDate(context.startDate);
  const end = formatReviewDate(context.endDate);
  return `${start} – ${end}`;
}

function formatReviewDate(isoOrDate: string): string {
  const parsed = Date.parse(isoOrDate);
  if (Number.isNaN(parsed)) return isoOrDate;
  return new Date(parsed).toLocaleDateString();
}

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
 * My Requests card controls (renter completed rentals).
 * Incomplete → no action; completed+reviewed → label only; completed → show Review.
 */
export function completedRentalReviewControls(
  request: EnrichedRentalRequestLike,
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

/** Alias used by MyRequestsPage — same renter-only rules. */
export const myRequestsReviewControls = completedRentalReviewControls;

export function reviewValidationMessages(
  gate: Pick<ReviewSubmitGate, 'rating' | 'comment'>
): { rating: string; comment: string } {
  return {
    rating: isApprovedRatingValue(gate.rating) ? '' : REVIEW_INCOMPLETE_RATING_MESSAGE,
    comment: isBlankReviewComment(gate.comment) ? REVIEW_INCOMPLETE_COMMENT_MESSAGE : '',
  };
}

export function canSubmitReview(gate: ReviewSubmitGate): boolean {
  if (gate.submitting) return false;
  if (!gate.context) return false;
  if (gate.alreadyReviewed) return false;
  if (!isCompletedRentalStatus(gate.context.status)) return false;

  const viewer = toPositiveIntId(gate.viewerId);
  if (viewer == null) return false;

  const messages = reviewValidationMessages(gate);
  if (messages.rating || messages.comment) return false;
  if (!isApprovedRatingValue(gate.rating)) return false;

  return true;
}

export function reviewSubmitLabel(submitting: boolean): string {
  return submitting ? SUBMITTING_REVIEW_LABEL : SUBMIT_REVIEW_LABEL;
}

/** Pure request descriptor — no reviewer_id / listing_id / reviewed_user_id. */
export function buildSubmitReviewBody(
  context: ReviewRentalContext,
  rating: RatingValue,
  comment: string
): SubmitReviewBody {
  if (!isWholeStarRating(rating)) {
    throw new Error('Rating must be a whole number from 1 to 5');
  }
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

export function toReviewDisplayItem(
  review: Pick<
    ReviewRecordShape,
    'id' | 'rating' | 'comment' | 'created_at' | 'listing_id'
  >,
  reviewerLabel: string,
  listingTitle?: string
): ReviewDisplayItem {
  const rating = isWholeStarRating(review.rating) ? review.rating : STAR_RATING_MIN;
  return {
    review_id: review.id,
    reviewer_label: reviewerLabel.trim() || 'CampusRent student',
    rating,
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

/** Whole filled stars for display (1–5); never fractional. */
export function filledStarCount(rating: RatingValue | null | undefined): number {
  return isWholeStarRating(rating) ? rating : 0;
}

export function ratingAriaLabel(rating: StarRating): string {
  return `${rating} out of ${STAR_RATING_MAX} stars`;
}

export function applyCancelledReviewForm(): {
  rating: StarRating | null;
  comment: string;
  error: string;
  notice: string;
} {
  return { rating: null, comment: '', error: '', notice: '' };
}

/**
 * UI-only submit path before US-19.6 API wiring.
 * Never claims the review was saved on the server.
 */
export function applyUnconnectedReviewSubmit(): {
  notice: string;
  success: string;
} {
  return {
    notice: REVIEW_NOT_CONNECTED_MESSAGE,
    success: '',
  };
}

export function claimsReviewSavedSuccessfully(message: string): boolean {
  return /saved successfully|submitted successfully/i.test(message);
}

export const REVIEW_WORKFLOW_STEPS = [
  'completed_rental_visible',
  'review_action_available',
  'open_review_form',
  'enter_rating_and_comment',
  'submit_review',
  'display_on_listing_detail',
] as const;

export type ReviewWorkflowStep = (typeof REVIEW_WORKFLOW_STEPS)[number];
