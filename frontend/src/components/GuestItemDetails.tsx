import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, Package } from 'lucide-react';
import {
  GUEST_ITEM_DETAILS_AVAILABILITY_LABEL,
  GUEST_ITEM_DETAILS_BACK_LABEL,
  GUEST_ITEM_DETAILS_CATEGORY_LABEL,
  GUEST_ITEM_DETAILS_DESCRIPTION_LABEL,
  GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
  GUEST_ITEM_DETAILS_LOADING_LABEL,
  GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE,
  GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL,
  GUEST_ITEM_DETAILS_SECTION_LABEL,
  attemptGuestItemDetailsRentalRequestUi,
  guestItemDetailsUiStatus,
  guestItemDetailsView,
  pickGuestItemDetailsAllowList,
  type GuestItemDetails as GuestItemDetailsData,
} from '../utils/guestItemDetails';
import GuestRegistrationPrompt from './GuestRegistrationPrompt';
import StatusBadge from './StatusBadge';

export interface GuestItemDetailsProps {
  /** Narrow guest details only — never pass a full Listing object. */
  details?: GuestItemDetailsData | null;
  loading?: boolean;
  error?: string;
  notFound?: boolean;
}

/**
 * US-02.2 — guest basic item-details presentation.
 * Props/state driven only; no guest details API call in this task (#200).
 * Request Rental opens the existing US-01 registration prompt before any API.
 */
export default function GuestItemDetails({
  details = null,
  loading = false,
  error = '',
  notFound = false,
}: GuestItemDetailsProps) {
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);

  const status = guestItemDetailsUiStatus({
    loading,
    error,
    notFound,
    hasDetails: Boolean(details),
  });

  const handleRequestRental = () => {
    const result = attemptGuestItemDetailsRentalRequestUi();
    if (
      result.blocked_before_api &&
      !result.apiCalled &&
      !result.success &&
      result.show_registration_prompt
    ) {
      setShowRegistrationPrompt(true);
    }
  };

  if (status === 'loading') {
    return (
      <section
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
        aria-label={GUEST_ITEM_DETAILS_SECTION_LABEL}
        data-testid="guest-item-details"
      >
        <div
          className="space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={GUEST_ITEM_DETAILS_LOADING_LABEL}
          data-testid="guest-item-details-loading"
        >
          <div className="h-10 w-40 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-72 animate-pulse rounded-3xl bg-slate-200" />
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />{' '}
            {GUEST_ITEM_DETAILS_LOADING_LABEL}
          </p>
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
        aria-label={GUEST_ITEM_DETAILS_SECTION_LABEL}
        data-testid="guest-item-details"
      >
        <Link
          to="/browse"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
          data-testid="guest-item-details-back"
        >
          <ArrowLeft className="h-4 w-4" /> {GUEST_ITEM_DETAILS_BACK_LABEL}
        </Link>
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
          data-testid="guest-item-details-error"
        >
          {error.trim() || GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK}
        </div>
      </section>
    );
  }

  if (status === 'not_found' || !details) {
    return (
      <section
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
        aria-label={GUEST_ITEM_DETAILS_SECTION_LABEL}
        data-testid="guest-item-details"
      >
        <Link
          to="/browse"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
          data-testid="guest-item-details-back"
        >
          <ArrowLeft className="h-4 w-4" /> {GUEST_ITEM_DETAILS_BACK_LABEL}
        </Link>
        <div
          className="card py-16 text-center"
          role="status"
          data-testid="guest-item-details-not-found"
        >
          <Package className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-lg font-medium text-slate-600">
            {GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE}
          </p>
        </div>
      </section>
    );
  }

  const safeDetails = pickGuestItemDetailsAllowList(details);
  const view = guestItemDetailsView(safeDetails);

  return (
    <section
      className="mx-auto max-w-3xl px-4 py-10 sm:px-6"
      aria-label={GUEST_ITEM_DETAILS_SECTION_LABEL}
      data-testid="guest-item-details"
      data-listing-id={view.id}
    >
      <Link
        to={view.back_path}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-campus-700 hover:text-campus-900"
        data-testid="guest-item-details-back"
      >
        <ArrowLeft className="h-4 w-4" /> {view.back_label}
      </Link>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
          {GUEST_ITEM_DETAILS_SECTION_LABEL}
        </p>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span
              className="badge bg-campus-50 text-campus-700"
              data-testid="guest-item-details-category"
              aria-label={GUEST_ITEM_DETAILS_CATEGORY_LABEL}
            >
              {view.category}
            </span>
            <h1
              className="mt-3 font-display text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl"
              data-testid="guest-item-details-title"
            >
              {view.title}
            </h1>
          </div>
          <div
            data-testid="guest-item-details-availability"
            aria-label={GUEST_ITEM_DETAILS_AVAILABILITY_LABEL}
          >
            <StatusBadge status={view.availability} />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-base font-bold text-slate-900">
            {GUEST_ITEM_DETAILS_DESCRIPTION_LABEL}
          </h2>
          <p
            className="mt-2 text-base leading-7 text-slate-600 whitespace-pre-wrap"
            data-testid="guest-item-details-description"
          >
            {view.description}
          </p>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <button
            type="button"
            className="btn-primary"
            onClick={handleRequestRental}
            data-testid="guest-item-details-request-rental"
          >
            {GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL}
          </button>
        </div>
      </div>

      {showRegistrationPrompt && (
        <GuestRegistrationPrompt
          action="request_rental"
          onDismiss={() => setShowRegistrationPrompt(false)}
        />
      )}
    </section>
  );
}
