import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react';
import { api, RentalRequest } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function RequestsPage() {
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [confirmDeclineId, setConfirmDeclineId] = useState<number | null>(null);

  const loadRequests = () => {
    setLoading(true);
    api.get<RentalRequest[]>('/requests/incoming')
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load requests'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRequests, []);

  const approve = async (requestId: number) => {
    setError('');
    setMessage('');
    setConfirmDeclineId(null);
    setApprovingId(requestId);
    try {
      await api.patch(`/requests/${requestId}/approve`);
      setMessage('Rental request approved. The request is Accepted and the item is now Unavailable.');
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve request');
    } finally {
      setApprovingId(null);
    }
  };

  const decline = async (requestId: number) => {
    setError('');
    setMessage('');
    setDecliningId(requestId);
    try {
      await api.patch(`/requests/${requestId}/decline`);
      setMessage('Rental request declined. The request status is now Declined.');
      setConfirmDeclineId(null);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline request');
    } finally {
      setDecliningId(null);
    }
  };

  const busyId = approvingId ?? decliningId;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Rental coordination</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Incoming rental requests</h1>
        <p className="mt-2 text-slate-500">
          Review requests made for listings that you own. Approve available rentals or decline requests you cannot fulfill.
        </p>
      </div>

      {message && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-200" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card mt-8 py-14 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-campus-300" />
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">No incoming requests</h2>
          <p className="mt-2 text-sm text-slate-500">Requests for your available listings will appear here.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="card transition hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-lg font-bold text-slate-900">{request.listing?.title}</h2>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Category: {request.listing?.category}</p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p><span className="font-semibold">Renter:</span> {request.renter?.first_name} {request.renter?.last_name}</p>
                    <p><span className="font-semibold">Email:</span> {request.renter?.email}</p>
                    <p><span className="font-semibold">Start:</span> {new Date(request.start_date).toLocaleDateString()}</p>
                    <p><span className="font-semibold">End:</span> {new Date(request.end_date).toLocaleDateString()}</p>
                  </div>

                  {confirmDeclineId === request.id && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p className="font-semibold">Decline this rental request?</p>
                      <p className="mt-1 text-red-700">
                        The renter will see the Declined status. This cannot be undone from this screen.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => decline(request.id)}
                          className="btn-primary bg-red-600 hover:bg-red-700"
                          disabled={decliningId === request.id}
                        >
                          <XCircle className="h-4 w-4" />
                          {decliningId === request.id ? 'Declining...' : 'Confirm Decline'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeclineId(null)}
                          className="btn-secondary"
                          disabled={decliningId === request.id}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {request.status === 'pending' && confirmDeclineId !== request.id && (
                  <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => approve(request.id)}
                      className="btn-primary"
                      disabled={busyId === request.id}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {approvingId === request.id ? 'Approving...' : 'Approve Request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMessage('');
                        setConfirmDeclineId(request.id);
                      }}
                      className="btn-secondary"
                      disabled={busyId === request.id}
                    >
                      <XCircle className="h-4 w-4" />
                      Decline Request
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
