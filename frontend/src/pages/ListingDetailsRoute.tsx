import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import GuestItemDetails from '../components/GuestItemDetails';
import { useAuth } from '../context/AuthContext';
import {
  GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
  mapGuestItemDetailsFromApi,
  parseGuestItemDetailsIdParam,
  resolveListingDetailsRouteAudience,
  type GuestItemDetails as GuestItemDetailsData,
  type GuestItemDetailsResponse,
} from '../utils/guestItemDetails';
import ListingDetailPage from './ListingDetailPage';

export interface ListingDetailsRouteProps {
  /** Optional inject for tests — defaults to api.getGuestListingDetails. */
  fetchGuestListingDetails?: (
    listingId: number
  ) => Promise<GuestItemDetailsResponse>;
}

/**
 * US-02.5 — /listings/:id audience router.
 * Guest → public GET /api/guest/listings/:id + GuestItemDetails.
 * Verified student → existing US-10 ListingDetailPage + /api/listings/:id.
 * Waits for auth resolution before choosing an experience.
 */
export default function ListingDetailsRoute({
  fetchGuestListingDetails = (listingId) => api.getGuestListingDetails(listingId),
}: ListingDetailsRouteProps) {
  const { id } = useParams();
  const { user, loading: authLoading, isVerified, isAdmin } = useAuth();

  const audience = resolveListingDetailsRouteAudience({
    authLoading,
    isAdmin,
    isVerified,
    hasUser: Boolean(user),
  });

  if (!audience.ready || audience.experience === 'auth_loading') {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        data-testid="listing-details-auth-loading"
      >
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-campus-200 border-t-campus-600" />
      </div>
    );
  }

  if (audience.experience === 'admin_redirect') {
    return <Navigate to="/admin" replace />;
  }

  if (audience.experience === 'registered_full_details_us10') {
    return <ListingDetailPage />;
  }

  if (audience.experience === 'pending_account') {
    return <Navigate to="/account" replace />;
  }

  return (
    <GuestItemDetailsPage
      listingIdParam={id}
      fetchGuestListingDetails={fetchGuestListingDetails}
    />
  );
}

function GuestItemDetailsPage({
  listingIdParam,
  fetchGuestListingDetails,
}: {
  listingIdParam: string | undefined;
  fetchGuestListingDetails: (
    listingId: number
  ) => Promise<GuestItemDetailsResponse>;
}) {
  const [details, setDetails] = useState<GuestItemDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const fetchRef = useRef(fetchGuestListingDetails);
  fetchRef.current = fetchGuestListingDetails;

  const loadDetails = useCallback(async (rawId: string | undefined) => {
    const parsed = parseGuestItemDetailsIdParam(rawId);
    if (parsed.id == null) {
      setDetails(null);
      setError('');
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);
    setDetails(null);

    try {
      const response = await fetchRef.current(parsed.id);
      const mapped = mapGuestItemDetailsFromApi(response);
      if (!mapped) {
        setDetails(null);
        setError(GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK);
        setNotFound(false);
        return;
      }
      setDetails(mapped);
      setError('');
      setNotFound(false);
    } catch (err) {
      setDetails(null);
      const status =
        err &&
        typeof err === 'object' &&
        'status' in err &&
        typeof (err as { status: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 0;
      if (status === 404) {
        setNotFound(true);
        setError('');
      } else {
        setNotFound(false);
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetails(listingIdParam);
  }, [listingIdParam, loadDetails]);

  return (
    <GuestItemDetails
      details={details}
      loading={loading}
      error={error}
      notFound={notFound}
    />
  );
}
