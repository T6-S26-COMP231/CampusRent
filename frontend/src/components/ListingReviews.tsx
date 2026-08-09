import { MessageSquareText, Star } from 'lucide-react';
import {
  REVIEW_DISPLAY_EMPTY_MESSAGE,
  REVIEW_DISPLAY_HEADING,
  STAR_RATING_MAX,
  filledStarCount,
  formatReviewTimestamp,
  ratingAriaLabel,
  type ReviewDisplayItem,
  type StarRating,
} from '../utils/ratingsReviews';

interface Props {
  reviews?: ReviewDisplayItem[];
}

function StarDisplay({ rating }: { rating: StarRating }) {
  const filled = filledStarCount(rating);
  return (
    <div className="flex items-center gap-0.5" aria-label={ratingAriaLabel(rating)}>
      {Array.from({ length: STAR_RATING_MAX }, (_, index) => {
        const starValue = index + 1;
        const isFilled = starValue <= filled;
        return (
          <Star
            key={starValue}
            className={`h-4 w-4 ${isFilled ? 'text-amber-500' : 'text-slate-200'}`}
            fill={isFilled ? 'currentColor' : 'none'}
            strokeWidth={1.75}
          />
        );
      })}
    </div>
  );
}

/**
 * US-19.2 — listing detail reviews section.
 * Renders only the reviews provided by the parent (no fabricated production data).
 */
export default function ListingReviews({ reviews = [] }: Props) {
  return (
    <section className="mt-6" aria-label={REVIEW_DISPLAY_HEADING}>
      <h2 className="font-display text-lg font-bold text-slate-900">{REVIEW_DISPLAY_HEADING}</h2>

      {reviews.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{REVIEW_DISPLAY_EMPTY_MESSAGE}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => (
            <li
              key={review.review_id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{review.reviewer_label}</p>
                  <div className="mt-1">
                    <StarDisplay rating={review.rating} />
                  </div>
                </div>
                {review.created_at && (
                  <p className="text-xs text-slate-400">
                    {formatReviewTimestamp(review.created_at)}
                  </p>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {review.comment}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
