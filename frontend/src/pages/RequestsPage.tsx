import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { api, RentalRequest } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function RequestsPage() {
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Rental coordination</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Incoming rental requests</h1>
        <p className="mt-2 text-slate-500">Review requests made for listings that you own and approve pending rentals.</p>
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
                </div>

                {request.status === 'pending' && (
                  <button
                    onClick={() => approve(request.id)}
                    className="btn-primary shrink-0"
                    disabled={approvingId === request.id}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {approvingId === request.id ? 'Approving...' : 'Approve Request'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
