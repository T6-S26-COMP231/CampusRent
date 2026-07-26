import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, PackageOpen } from 'lucide-react';
import { api, Listing } from '../api/client';
import ListingCard from '../components/ListingCard';

export default function MyListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Listing[]>('/listings/mine')
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load listings'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Listing management</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">My listings</h1>
          <p className="mt-2 text-slate-500">Edit, remove, or update availability for the items you own.</p>
        </div>
        <Link to="/listings/new" className="btn-primary">
          <PlusCircle className="h-4 w-4" /> Create Listing
        </Link>
      </div>

      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl bg-slate-200" />)}
        </div>
      ) : listings.length === 0 ? (
        <div className="card mt-8 py-14 text-center">
          <PackageOpen className="mx-auto h-12 w-12 text-campus-300" />
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">No listings yet</h2>
          <p className="mt-2 text-sm text-slate-500">Create your first item listing to start sharing with students.</p>
          <Link to="/listings/new" className="btn-primary mt-5">Create Listing</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <div key={listing.id} className="space-y-3">
              <ListingCard listing={listing} />
              <Link to={`/listings/${listing.id}/edit`} className="btn-secondary w-full">Manage Listing</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
