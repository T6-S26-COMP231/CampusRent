import { MessageSquareText, Star } from 'lucide-react';
import {
  REVIEW_DISPLAY_EMPTY_MESSAGE,
  REVIEW_DISPLAY_HEADING,
  REVIEW_LOAD_ERROR_FALLBACK,
  STAR_RATING_MAX,
  filledStarCount,
  formatReviewTimestamp,
  listingReviewsUiStatus,
  ratingAriaLabel,
  type ReviewDisplayItem,
  type StarRating,
} from '../utils/ratingsReviews';

interface Props {
  reviews?: ReviewDisplayItem[];
  loading?: boolean;
  error?: string;
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
 * US-19.2 / US-19.6 — listing detail reviews section.
 * Parent supplies API-mapped reviews; never fabricates production data.
 */
export default function ListingReviews({
  reviews = [],
  loading = false,
  error = '',
}: Props) {
  const status = listingReviewsUiStatus(loading, error, reviews.length);

  return (
    <section className="mt-6" aria-label={REVIEW_DISPLAY_HEADING}>
      <h2 className="font-display text-lg font-bold text-slate-900">{REVIEW_DISPLAY_HEADING}</h2>

      {status === 'loading' && (
        <div className="mt-3 space-y-3" aria-busy="true" aria-label="Loading reviews">
          {[1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm text-red-700">{error || REVIEW_LOAD_ERROR_FALLBACK}</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{REVIEW_DISPLAY_EMPTY_MESSAGE}</p>
        </div>
      )}

      {status === 'populated' && (
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
