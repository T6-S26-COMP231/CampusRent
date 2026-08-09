import mongoose, { Schema } from 'mongoose';

/**
 * US-19.3 — Review persistence for completed-rental feedback.
 *
 * Team implementation decision (GitHub #162): rating is a whole-number star
 * from 1–5 (not an instructor-specified TAC scale).
 *
 * Renter-side flow (US-19.2): reviewer is the renter; reviewed_user_id is the
 * listing owner counterpart. Bidirectional reviewing is not modeled here.
 *
 * Relationships (numeric ids matching the rest of CampusRent):
 *   - reviewer_id → User (authenticated student; no name/email copy)
 *   - rental_request_id → RentalRequest (completed transaction)
 *   - listing_id → Listing (from the request; no title/description copy)
 *   - reviewed_user_id → User (owner counterpart for the renter flow)
 *
 * One review per (reviewer_id, rental_request_id) via unique compound index.
 * Completed-rental / API enforcement belongs to US-19.4 / US-19.5.
 */

export const STAR_RATING_MIN = 1;
export const STAR_RATING_MAX = 5;
export const WHOLE_STAR_RATINGS = [1, 2, 3, 4, 5] as const;
export type StarRating = (typeof WHOLE_STAR_RATINGS)[number];

export interface ReviewDoc {
  _id: number;
  reviewer_id: number;
  rental_request_id: number;
  listing_id: number;
  reviewed_user_id: number;
  rating: StarRating;
  comment: string;
  created_at: Date;
}

function assertPositiveInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return numeric;
}

/** Whole-number 1–5 only — rejects decimals, 0, and values above 5. */
export function normalizeReviewRating(raw: unknown): StarRating {
  if (raw == null || raw === '') {
    throw new Error('Rating is required');
  }
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error('Rating must be a whole number from 1 to 5');
  }
  if (numeric < STAR_RATING_MIN || numeric > STAR_RATING_MAX) {
    throw new Error('Rating must be a whole number from 1 to 5');
  }
  return numeric as StarRating;
}

export function isWholeStarRating(value: unknown): value is StarRating {
  try {
    normalizeReviewRating(value);
    return true;
  } catch {
    return false;
  }
}

/** Required, trimmed, non-empty. No invented min/max length. */
export function normalizeReviewComment(raw: unknown): string {
  if (raw == null) {
    throw new Error('Review comment is required');
  }
  if (typeof raw !== 'string') {
    throw new Error('Review comment must be a string');
  }
  const comment = raw.trim();
  if (comment.length === 0) {
    throw new Error('Review comment cannot be blank');
  }
  return comment;
}

export function assertReviewIdentifiers(
  reviewerId: unknown,
  rentalRequestId: unknown,
  listingId: unknown,
  reviewedUserId: unknown
): {
  reviewer_id: number;
  rental_request_id: number;
  listing_id: number;
  reviewed_user_id: number;
} {
  return {
    reviewer_id: assertPositiveInteger(reviewerId, 'reviewer_id'),
    rental_request_id: assertPositiveInteger(rentalRequestId, 'rental_request_id'),
    listing_id: assertPositiveInteger(listingId, 'listing_id'),
    reviewed_user_id: assertPositiveInteger(reviewedUserId, 'reviewed_user_id'),
  };
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    _id: { type: Number, required: true },
    reviewer_id: { type: Number, required: true, index: true, min: 1 },
    rental_request_id: { type: Number, required: true, index: true, min: 1 },
    listing_id: { type: Number, required: true, index: true, min: 1 },
    reviewed_user_id: { type: Number, required: true, index: true, min: 1 },
    rating: {
      type: Number,
      required: true,
      min: STAR_RATING_MIN,
      max: STAR_RATING_MAX,
    },
    comment: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/**
 * One review per reviewing student per completed rental transaction.
 * Application duplicate handling belongs to US-19.5; this is the DB safeguard.
 */
reviewSchema.index(
  { reviewer_id: 1, rental_request_id: 1 },
  { unique: true, name: 'uniq_review_reviewer_rental_request' }
);

/** Listing detail review list: newest first. */
reviewSchema.index(
  { listing_id: 1, created_at: -1, _id: -1 },
  { name: 'idx_review_listing_chronology' }
);

reviewSchema.pre('validate', function () {
  const ids = assertReviewIdentifiers(
    this.reviewer_id,
    this.rental_request_id,
    this.listing_id,
    this.reviewed_user_id
  );
  this.reviewer_id = ids.reviewer_id;
  this.rental_request_id = ids.rental_request_id;
  this.listing_id = ids.listing_id;
  this.reviewed_user_id = ids.reviewed_user_id;
  this.rating = normalizeReviewRating(this.rating);
  this.comment = normalizeReviewComment(this.comment);
});

export const Review =
  mongoose.models.Review || mongoose.model<ReviewDoc>('Review', reviewSchema);

/** API-facing row shape for later create/list endpoints (US-19.4). */
export function toReviewRow(review: ReviewDoc) {
  return {
    id: review._id,
    reviewer_id: review.reviewer_id,
    rental_request_id: review.rental_request_id,
    listing_id: review.listing_id,
    reviewed_user_id: review.reviewed_user_id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at.toISOString(),
  };
}
