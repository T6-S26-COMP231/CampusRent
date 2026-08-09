import { Star } from 'lucide-react';
import {
  APPROVED_RATING_VALUES,
  REVIEW_RATING_LABEL,
  STAR_RATING_MAX,
  ratingAriaLabel,
  type StarRating,
} from '../utils/ratingsReviews';

interface Props {
  value: StarRating | null;
  onChange: (value: StarRating) => void;
  disabled?: boolean;
  id?: string;
  error?: string;
}

/**
 * US-19.2 — 1–5 whole-number star rating control (team decision on #162).
 * Radiogroup semantics; no half-stars.
 */
export default function StarRatingInput({
  value,
  onChange,
  disabled = false,
  id = 'review-rating',
  error = '',
}: Props) {
  return (
    <div>
      <p id={`${id}-label`} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {REVIEW_RATING_LABEL}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-required="true"
        className="flex flex-wrap items-center gap-1"
      >
        {APPROVED_RATING_VALUES.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              id={selected ? id : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={ratingAriaLabel(option.value)}
              disabled={disabled}
              className={`rounded-lg p-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-campus-600 ${
                selected ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() => onChange(option.value)}
            >
              <Star
                className="h-7 w-7"
                fill={selected || (value != null && option.value <= value) ? 'currentColor' : 'none'}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
        <span className="ml-2 text-sm font-medium text-slate-600" aria-live="polite">
          {value != null ? `${value} / ${STAR_RATING_MAX}` : 'Select a rating'}
        </span>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
