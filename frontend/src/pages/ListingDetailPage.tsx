import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Mail,
  Package,
  Phone,
  UserRound,
} from 'lucide-react';
import { api, assetUrl, Listing, RentalRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ListingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [myRequest, setMyRequest] = useState<RentalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadPage = async () => {
    try {
      const listingId = Number(id);
      const [listingResult, requestResult] = await Promise.all([
        api.get<Listing>(`/listings/${listingId}`),
        api.get<RentalRequest | null>(`/requests/mine/listing/${listingId}`),
      ]);
      setListing(listingResult);
      setMyRequest(requestResult);
    } catch {
      navigate('/browse');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [id, navigate]);

  const minimumDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const request = await api.post<RentalRequest>('/requests', {
        listing_id: Number(id),
        start_date: startDate,
        end_date: endDate,
      });
      setMyRequest(request);
      setSuccess('Rental request submitted successfully with Pending status.');
      setStartDate('');
      setEndDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="h-[32rem] animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (!listing) return null;

  const isOwner = user?.id === listing.owner?.id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        to="/browse"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to listings
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
        <section>
          {listing.images?.length ? (
            <div className="grid gap-3">
              <img
                src={assetUrl(listing.images[0].url)}
                alt={listing.title}
                className="aspect-[4/3] w-full rounded-3xl border border-slate-200 object-cover shadow-card"
              />
              {listing.images.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {listing.images.slice(1, 5).map((image, index) => (
                    <img
                      key={`${image.url}-${index}`}
                      src={assetUrl(image.url)}
                      alt={`${listing.title} ${index + 2}`}
                      className="aspect-square rounded-2xl border border-slate-200 object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-3xl border border-campus-100 bg-gradient-to-br from-campus-50 to-white shadow-card">
              <Package className="h-24 w-24 text-campus-200" />
            </div>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="badge bg-campus-50 text-campus-700">{listing.category}</span>
              <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-slate-950">
                {listing.title}
              </h1>
            </div>
            <StatusBadge status={listing.availability} />
          </div>

          <p className="mt-5 text-base leading-7 text-slate-600">{listing.description}</p>

          {listing.rental_terms && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-display text-base font-bold text-slate-900">Rental terms</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{listing.rental_terms}</p>
            </div>
          )}

          {listing.owner && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-campus-50 text-campus-700">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Listing owner</p>
                  <p className="font-semibold text-slate-900">
                    {listing.owner.first_name} {listing.owner.last_name}
                  </p>
                </div>
              </div>
              {listing.owner.email && (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Mail className="h-4 w-4" /> {listing.owner.email}
                </p>
              )}
              {listing.owner.phone && (
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                  <Phone className="h-4 w-4" /> {listing.owner.phone}
                </p>
              )}
            </div>
          )}

          {success && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!isOwner && myRequest && (
            <div className="card mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-campus-600">
                    Your request for this item
                  </p>
                  <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                    Rental request status
                  </h2>
                </div>
                <StatusBadge status={myRequest.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <p><span className="font-semibold">Start:</span> {new Date(myRequest.start_date).toLocaleDateString()}</p>
                <p><span className="font-semibold">End:</span> {new Date(myRequest.end_date).toLocaleDateString()}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                {myRequest.status === 'accepted'
                  ? 'The listing owner accepted this request. The item is now marked Unavailable.'
                  : 'The request is waiting for the listing owner to review it.'}
              </p>
            </div>
          )}

          {!isOwner && !myRequest && listing.availability === 'available' && (
            <form onSubmit={handleRequest} className="card mt-6 space-y-5">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
                  <CalendarDays className="h-5 w-5 text-campus-600" /> Submit rental request
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Choose a valid date range. New requests begin with Pending status.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Start date</label>
                  <input
                    type="date"
                    min={minimumDate}
                    className="input-field"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">End date</label>
                  <input
                    type="date"
                    min={startDate || minimumDate}
                    className="input-field"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Rental Request'}
              </button>
            </form>
          )}

          {!isOwner && !myRequest && listing.availability === 'unavailable' && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
              This item is currently unavailable and cannot receive a new rental request.
            </div>
          )}

          {isOwner && (
            <Link to={`/listings/${listing.id}/edit`} className="btn-secondary mt-6 w-full">
              Manage This Listing
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
