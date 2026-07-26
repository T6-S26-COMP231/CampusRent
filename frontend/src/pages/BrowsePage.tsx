import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';
import { api, Listing } from '../api/client';
import ListingCard from '../components/ListingCard';

interface ListingResponse {
  listings: Listing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function BrowsePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState<'available' | 'unavailable'>('available');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchListings = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        availability,
        page: String(targetPage),
        limit: '6',
      });
      if (q.trim()) params.set('q', q.trim());
      if (category) params.set('category', category);

      const response = await api.get<ListingResponse>(`/listings?${params.toString()}`);
      setListings(response.listings);
      setPage(response.pagination.page);
      setTotalPages(response.pagination.pages);
      setTotal(response.pagination.total);
    } catch (err) {
      setListings([]);
      setError(err instanceof Error ? err.message : 'Unable to load listings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get<string[]>('/listings/categories')
      .then(setCategories)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load categories'));
  }, []);

  useEffect(() => {
    fetchListings(page);
  }, [category, availability, page]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (page === 1) fetchListings(1);
    else setPage(1);
  };

  const changeCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const changeAvailability = (value: 'available' | 'unavailable') => {
    setAvailability(value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Item discovery</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Browse Listings</h1>
        <p className="mt-1 text-slate-500">
          Search the verified-student catalogue by keyword, category, and availability.
        </p>
      </div>

      <div className="card mb-8">
        <form onSubmit={handleSearch} className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field pl-10"
                placeholder="Search title or description..."
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
          </div>

          <div className="w-full lg:w-52">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
            <select
              className="input-field"
              value={category}
              onChange={(event) => changeCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="w-full lg:w-48">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Availability</label>
            <select
              className="input-field"
              value={availability}
              onChange={(event) => changeAvailability(event.target.value as 'available' | 'unavailable')}
            >
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          <button type="submit" className="btn-primary">
            <Filter className="h-4 w-4" /> Search
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p>
            {total} {availability} listing{total === 1 ? '' : 's'} found
          </p>
          <p>Page {page} of {totalPages}</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-lg font-medium text-slate-600">No matching listings found</p>
          <p className="mt-1 text-sm text-slate-400">Try a different keyword, category, or availability filter.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
