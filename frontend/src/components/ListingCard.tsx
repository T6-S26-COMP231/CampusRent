import { Link } from 'react-router-dom';
import { assetUrl, Listing } from '../api/client';
import { Package, MapPin } from 'lucide-react';

interface Props {
  listing: Listing;
}

export default function ListingCard({ listing }: Props) {
  const thumb = assetUrl(listing.images?.[0]?.url || '');

  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-campus-50 to-slate-100">
        {thumb ? (
          <img
            src={thumb}
            alt={listing.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-campus-300" />
          </div>
        )}
        <span
          className={`badge absolute right-3 top-3 ${
            listing.availability === 'available'
              ? 'bg-mint-500/90 text-white'
              : 'bg-slate-500/90 text-white'
          }`}
        >
          {listing.availability}
        </span>
      </div>
      <div className="p-4">
        <span className="badge bg-campus-50 text-campus-700">{listing.category}</span>
        <h3 className="mt-2 font-display text-lg font-semibold text-slate-900 line-clamp-1 group-hover:text-campus-700">
          {listing.title}
        </h3>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{listing.description}</p>
        {listing.owner && (
          <p className="mt-3 flex items-center gap-1 text-xs text-slate-400">
            <MapPin className="h-3 w-3" />
            {listing.owner.first_name} {listing.owner.last_name}
          </p>
        )}
      </div>
    </Link>
  );
}
