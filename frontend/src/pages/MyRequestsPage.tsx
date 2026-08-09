import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Star, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, RentalRequest } from '../api/client';
import ConversationStartedNotice from '../components/ConversationStartedNotice';
import ReviewForm from '../components/ReviewForm';
import StartConversationButton from '../components/StartConversationButton';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  REVIEW_ALREADY_SUBMITTED_LABEL,
  myRequestsReviewControls,
} from '../utils/ratingsReviews';
import { ConversationTarget } from '../utils/startConversation';

function ownerTargetForRequest(request: RentalRequest): ConversationTarget | null {
  if (!request.owner) return null;
  return {
    listingId: request.listing?.id ?? request.listing_id,
    counterpartId: request.owner.id,
    counterpartName: `${request.owner.first_name} ${request.owner.last_name}`.trim(),
    counterpartRole: 'owner',
  };
}

export default function MyRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conversationNotice, setConversationNotice] = useState<{
    message: string;
    conversationId: number;
  } | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [confirmCompleteId, setConfirmCompleteId] = useState<number | null>(null);
  /** Inline review form for a completed rental; already-reviewed truth comes later from API. */
  const [reviewRequestId, setReviewRequestId] = useState<number | null>(null);

  const loadRequests = () => {
    setLoading(true);
    api
      .get<RentalRequest[]>('/requests/mine')
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load your requests'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRequests, []);

  const cancelRequest = async (requestId: number) => {
    setError('');
    setMessage('');
    setConversationNotice(null);
    setCancellingId(requestId);
    try {
      await api.patch(`/requests/${requestId}/cancel`);
      setMessage('Rental request cancelled. The request status is now Cancelled.');
      setConfirmCancelId(null);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel request');
    } finally {
      setCancellingId(null);
    }
  };

  const completeRequest = async (requestId: number) => {
    setError('');
    setMessage('');
    setConversationNotice(null);
    setCompletingId(requestId);
    try {
      await api.patch(`/requests/${requestId}/complete`);
      setMessage('Rental marked Completed. The item is available again for new requests.');
      setConfirmCompleteId(null);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete rental');
    } finally {
      setCompletingId(null);
    }
  };

  const busyId = cancellingId ?? completingId;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
          Rental activity
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">My rental requests</h1>
        <p className="mt-2 text-slate-500">
          Track current and past requests you submitted. Cancel pending requests or mark accepted rentals as completed.
        </p>
      </div>

      {conversationNotice && (
        <ConversationStartedNotice
          message={conversationNotice.message}
          conversationId={conversationNotice.conversationId}
        />
      )}
      {message && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="card mt-8 py-14 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-campus-300" />
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">No rental requests yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            When you request an item, it will appear here with its current status.
          </p>
          <Link to="/browse" className="btn-primary mt-6 inline-flex">
            Browse available items
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {requests.map((request) => {
            // alreadyReviewed stays false until list-review API can prove a prior review.
            const reviewControls = myRequestsReviewControls(request, user?.id, false);
            const reviewOpen = reviewRequestId === request.id && reviewControls.context != null;

            return (
            <article
              key={request.id}
              className="card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {request.listing?.title || 'Listing unavailable'}
                    </h2>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Category: {request.listing?.category || '—'}
                  </p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold">Owner:</span>{' '}
                      {request.owner
                        ? `${request.owner.first_name} ${request.owner.last_name}`
                        : '—'}
                    </p>
                    <p>
                      <span className="font-semibold">Email:</span> {request.owner?.email || '—'}
                    </p>
                    <p>
                      <span className="font-semibold">Start:</span>{' '}
                      {new Date(request.start_date).toLocaleDateString()}
                    </p>
                    <p>
                      <span className="font-semibold">End:</span>{' '}
                      {new Date(request.end_date).toLocaleDateString()}
                    </p>
                  </div>

                  {reviewOpen && reviewControls.context && (
                    <ReviewForm
                      context={reviewControls.context}
                      viewerId={user?.id}
                      alreadyReviewed={false}
                      onCancel={() => setReviewRequestId(null)}
                    />
                  )}

                  {confirmCancelId === request.id && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">Cancel this pending request?</p>
                      <p className="mt-1 text-amber-800">
                        The owner will see the Cancelled status. The request record is kept.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => cancelRequest(request.id)}
                          className="btn-primary bg-amber-600 hover:bg-amber-700"
                          disabled={cancellingId === request.id}
                        >
                          <XCircle className="h-4 w-4" />
                          {cancellingId === request.id ? 'Cancelling...' : 'Confirm Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          className="btn-secondary"
                          disabled={cancellingId === request.id}
                        >
                          Keep Request
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmCompleteId === request.id && (
                    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                      <p className="font-semibold">Mark this rental as Completed?</p>
                      <p className="mt-1 text-sky-800">
                        Use this when the rental period is finished. The item becomes Available again.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => completeRequest(request.id)}
                          className="btn-primary"
                          disabled={completingId === request.id}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {completingId === request.id ? 'Completing...' : 'Confirm Complete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCompleteId(null)}
                          className="btn-secondary"
                          disabled={completingId === request.id}
                        >
                          Not Yet
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {confirmCancelId !== request.id &&
                  confirmCompleteId !== request.id &&
                  !reviewOpen && (
                  <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
                    <StartConversationButton
                      viewerId={user?.id}
                      target={ownerTargetForRequest(request)}
                      disabled={busyId === request.id}
                      onSuccess={(result) => {
                        setError('');
                        setMessage('');
                        setConversationNotice({
                          message: result.message,
                          conversationId: result.conversationId,
                        });
                      }}
                      onError={(text) => {
                        setMessage('');
                        setConversationNotice(null);
                        setError(text);
                      }}
                    />

                    {request.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setMessage('');
                          setConfirmCompleteId(null);
                          setReviewRequestId(null);
                          setConfirmCancelId(request.id);
                        }}
                        className="btn-secondary"
                        disabled={busyId === request.id}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel Request
                      </button>
                    )}

                    {request.status === 'accepted' && (
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setMessage('');
                          setConfirmCancelId(null);
                          setReviewRequestId(null);
                          setConfirmCompleteId(request.id);
                        }}
                        className="btn-primary"
                        disabled={busyId === request.id}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark Completed
                      </button>
                    )}

                    {reviewControls.showReviewAction && (
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setMessage('');
                          setConfirmCancelId(null);
                          setConfirmCompleteId(null);
                          setReviewRequestId(request.id);
                        }}
                        className="btn-secondary"
                        disabled={busyId === request.id}
                      >
                        <Star className="h-4 w-4" />
                        {reviewControls.entryLabel}
                      </button>
                    )}

                    {reviewControls.eligibility === 'already_reviewed' && (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-500">
                        {REVIEW_ALREADY_SUBMITTED_LABEL}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
