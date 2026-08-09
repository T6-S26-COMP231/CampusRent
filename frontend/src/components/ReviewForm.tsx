import { FormEvent, useState } from 'react';
import StarRatingInput from './StarRatingInput';
import {
  CANCEL_REVIEW_LABEL,
  REVIEW_COMMENT_LABEL,
  REVIEW_COMMENT_PLACEHOLDER,
  REVIEW_FORM_HEADING,
  applyCancelledReviewForm,
  applyUnconnectedReviewSubmit,
  buildSubmitReviewBody,
  canSubmitReview,
  reviewContextSummary,
  reviewDateRangeSummary,
  reviewSubmitLabel,
  reviewValidationMessages,
  type ReviewRentalContext,
  type StarRating,
  type SubmitReviewBody,
} from '../utils/ratingsReviews';

interface Props {
  context: ReviewRentalContext;
  viewerId: number | string | undefined;
  alreadyReviewed?: boolean;
  onCancel: () => void;
  /**
   * US-19.6 — persist via createReview. When omitted, validated submits show the
   * truthful not-connected notice and never claim a successful save.
   */
  onSubmit?: (body: SubmitReviewBody) => void | Promise<void>;
}

/**
 * US-19.2 — review form (rating + written comment) for a completed rental.
 * Context ids come from the `context` prop only — never editable fields.
 */
export default function ReviewForm({
  context,
  viewerId,
  alreadyReviewed = false,
  onCancel,
  onSubmit,
}: Props) {
  const [rating, setRating] = useState<StarRating | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [commentError, setCommentError] = useState('');

  const submitEnabled = canSubmitReview({
    context,
    rating,
    comment,
    submitting,
    viewerId,
    alreadyReviewed,
  });

  const handleCancel = () => {
    const cleared = applyCancelledReviewForm();
    setRating(cleared.rating);
    setComment(cleared.comment);
    setError(cleared.error);
    setNotice(cleared.notice);
    setRatingError('');
    setCommentError('');
    onCancel();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const messages = reviewValidationMessages({ rating, comment });
    setRatingError(messages.rating);
    setCommentError(messages.comment);

    if (
      !canSubmitReview({
        context,
        rating,
        comment,
        submitting,
        viewerId,
        alreadyReviewed,
      }) ||
      rating == null
    ) {
      return;
    }

    const body = buildSubmitReviewBody(context, rating, comment);

    if (!onSubmit) {
      const unconnected = applyUnconnectedReviewSubmit();
      setNotice(unconnected.notice);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(body);
      // Callers that persist for real (US-19.6) own success messaging.
      const cleared = applyCancelledReviewForm();
      setRating(cleared.rating);
      setComment(cleared.comment);
      setRatingError('');
      setCommentError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyReviewed) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        You have already submitted a review for this completed rental.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      aria-label={REVIEW_FORM_HEADING}
    >
      <div>
        <h3 className="font-display text-lg font-bold text-slate-950">{REVIEW_FORM_HEADING}</h3>
        <p className="mt-1 text-sm font-medium text-slate-600">{reviewContextSummary(context)}</p>
        <p className="mt-1 text-xs text-slate-400">
          Rental dates: {reviewDateRangeSummary(context)}
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <StarRatingInput
        value={rating}
        disabled={submitting}
        error={ratingError}
        onChange={(next) => {
          setRating(next);
          setRatingError('');
          setError('');
          setNotice('');
        }}
      />

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="review-comment">
          {REVIEW_COMMENT_LABEL}
        </label>
        <textarea
          id="review-comment"
          className="input-field min-h-[7rem] resize-y"
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setCommentError('');
            setError('');
            setNotice('');
          }}
          placeholder={REVIEW_COMMENT_PLACEHOLDER}
          disabled={submitting}
        />
        {commentError && (
          <p className="mt-1 text-xs font-medium text-red-600">{commentError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleCancel}
          disabled={submitting}
        >
          {CANCEL_REVIEW_LABEL}
        </button>
        <button type="submit" className="btn-primary" disabled={!submitEnabled}>
          {reviewSubmitLabel(submitting)}
        </button>
      </div>
    </form>
  );
}
