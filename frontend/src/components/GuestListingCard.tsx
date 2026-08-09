import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { assetUrl } from '../api/client';
import {
  GUEST_REQUEST_RENTAL_CTA_LABEL,
  guestListingCardView,
  type GuestListingPreview,
  type GuestRestrictedAction,
} from '../utils/guestCatalogue';

export interface GuestListingCardProps {
  preview: GuestListingPreview;
  onRestrictedAction?: (action: GuestRestrictedAction) => void;
}

/**
 * US-01.2 — limited guest listing preview card.
 * Displays only approved preview fields. No description, rental terms, or owner contact.
 */
export default function GuestListingCard({
  preview,
  onRestrictedAction,
}: GuestListingCardProps) {
  const view = guestListingCardView(preview);
  const thumb = view.has_thumbnail ? assetUrl(view.thumbnail_url || '') : '';

  const handleRequestRental = () => {
    onRestrictedAction?.('request_rental');
  };

  return (
    <article
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card"
      data-testid="guest-listing-card"
      data-listing-id={view.id}
    >
      <Link
        to={view.detail_path}
        className="group block transition hover:-translate-y-0.5 hover:shadow-card-hover"
        aria-label={`View preview details for ${view.title}`}
        data-testid="guest-listing-card-detail-link"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-campus-50 to-slate-100">
          {thumb ? (
            <img
              src={thumb}
              alt={view.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
              data-testid="guest-listing-card-thumbnail"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center"
              data-testid="guest-listing-card-thumbnail-fallback"
            >
              <Package className="h-12 w-12 text-campus-300" />
            </div>
          )}
          <span
            className={`badge absolute right-3 top-3 ${
              view.availability === 'available'
                ? 'bg-mint-500/90 text-white'
                : 'bg-slate-500/90 text-white'
            }`}
            data-testid="guest-listing-card-availability"
          >
            {view.availability}
          </span>
        </div>
        <div className="p-4">
          <span
            className="badge bg-campus-50 text-campus-700"
            data-testid="guest-listing-card-category"
          >
            {view.category}
          </span>
          <h3
            className="mt-2 font-display text-lg font-semibold text-slate-900 line-clamp-1 group-hover:text-campus-700"
            data-testid="guest-listing-card-title"
          >
            {view.title}
          </h3>
        </div>
      </Link>

      <div className="border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          className="btn-secondary w-full !py-2 text-sm"
          onClick={handleRequestRental}
          data-testid="guest-listing-card-request-rental"
        >
          {GUEST_REQUEST_RENTAL_CTA_LABEL}
        </button>
      </div>
    </article>
  );
}
