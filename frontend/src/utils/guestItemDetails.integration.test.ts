/**
 * US-02.5 — GuestItemDetails ↔ GET /api/guest/listings/:id integration helpers.
 * Pure logic + source wiring checks; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
  GUEST_ITEM_DETAILS_LOADING_LABEL,
  GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE,
  GUEST_ITEM_DETAILS_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestItemDetailsRentalRequestUi,
  buildGetGuestItemDetailsCall,
  buildGuestItemDetailsApiPath,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsUiStatus,
  guestItemDetailsView,
  mapGuestItemDetailsFromApi,
  resolveListingDetailsRouteAudience,
  runGuestItemDetailsFetchFlow,
  type GuestItemDetails,
  type GuestItemDetailsResponse,
} from './guestItemDetails';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  join(here, '../pages/ListingDetailsRoute.tsx'),
  'utf8'
);
const detailsSource = readFileSync(
  join(here, '../components/GuestItemDetails.tsx'),
  'utf8'
);
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');
const cardSource = readFileSync(
  join(here, '../components/GuestListingCard.tsx'),
  'utf8'
);
const listingDetailSource = readFileSync(
  join(here, '../pages/ListingDetailPage.tsx'),
  'utf8'
);

function sampleDetails(
  overrides: Partial<GuestItemDetails> = {}
): GuestItemDetails {
  return {
    id: 12,
    title: 'Campus Camera',
    category: 'Electronics',
    description: 'DSL kit for student media projects.',
    availability: 'available',
    ...overrides,
  };
}

function sampleResponse(
  listing: GuestItemDetails = sampleDetails()
): GuestItemDetailsResponse {
  return { listing };
}

describe('US-02.5 guest details API client and audience routing', () => {
  test('getGuestListingDetails path is public and separate from registered details', () => {
    const call = buildGetGuestItemDetailsCall(12);
    assert.equal(call.method, 'GET');
    assert.equal(call.path, '/guest/listings/12');
    assert.equal(call.requiresAuth, false);
    assert.equal(buildGuestItemDetailsApiPath(12), '/guest/listings/12');
    assert.notEqual(call.path, '/listings/12');

    assert.ok(clientSource.includes('getGuestListingDetails'));
    assert.ok(clientSource.includes('buildGuestItemDetailsApiPath'));
    assert.ok(clientSource.includes('GuestItemDetailsResponse'));
  });

  test('auth resolution chooses guest vs verified experience without flicker', () => {
    assert.deepEqual(
      resolveListingDetailsRouteAudience({ authLoading: true }),
      { ready: false, experience: 'auth_loading' }
    );
    assert.deepEqual(
      resolveListingDetailsRouteAudience({
        authLoading: false,
        isVerified: true,
      }),
      { ready: true, experience: 'registered_full_details_us10' }
    );
    assert.deepEqual(
      resolveListingDetailsRouteAudience({
        authLoading: false,
        isAdmin: true,
      }),
      { ready: true, experience: 'admin_redirect' }
    );
    assert.deepEqual(
      resolveListingDetailsRouteAudience({
        authLoading: false,
        hasUser: true,
      }),
      { ready: true, experience: 'pending_account' }
    );
    assert.deepEqual(
      resolveListingDetailsRouteAudience({ authLoading: false }),
      { ready: true, experience: 'guest_basic_details_us02' }
    );

    assert.ok(routeSource.includes('resolveListingDetailsRouteAudience'));
    assert.ok(routeSource.includes('listing-details-auth-loading'));
    assert.ok(routeSource.includes('ListingDetailPage'));
    assert.ok(routeSource.includes('GuestItemDetails'));
    assert.ok(routeSource.includes('api.getGuestListingDetails'));
    assert.equal(routeSource.includes('api.getGuestListings'), false);
    assert.equal(routeSource.includes("api.post"), false);
    assert.equal(routeSource.includes('fetch('), false);

    assert.ok(appSource.includes('ListingDetailsRoute'));
    assert.ok(appSource.includes('path="listings/:id"'));
    assert.match(
      appSource,
      /path="listings\/:id"\s+element=\{<ListingDetailsRoute\s*\/>\}/
    );
    // Edit remains protected; the open details route uses ListingDetailsRoute.
    assert.match(
      appSource,
      /path="listings\/:id\/edit"[\s\S]*?requireVerifiedStudent/
    );
    assert.ok(appSource.includes('<ProtectedRoute requireVerifiedStudent>'));
    assert.ok((appSource.match(/requireVerifiedStudent/g) || []).length >= 6);
  });
});

describe('US-02.5 guest details load / privacy / availability flows', () => {
  test('initial load uses guest endpoint, loading copy, and allow-listed rows', async () => {
    assert.equal(GUEST_ITEM_DETAILS_LOADING_LABEL, 'Loading item details...');
    assert.equal(guestItemDetailsUiStatus({ loading: true }), 'loading');

    let seenId = 0;
    const loaded = await runGuestItemDetailsFetchFlow(async (listingId) => {
      seenId = listingId;
      return sampleResponse(
        sampleDetails({
          id: listingId,
          title: 'Loaded Camera',
          description: 'Visible guest description.',
          availability: 'available',
        })
      );
    }, '12');

    assert.equal(seenId, 12);
    assert.equal(loaded.called, true);
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.notFound, false);
    assert.equal(loaded.error, '');
    assert.ok(loaded.details);
    assert.equal(loaded.details!.title, 'Loaded Camera');
    assert.equal(loaded.details!.description, 'Visible guest description.');
    assert.equal(loaded.details!.availability, 'available');
    assert.equal(guestItemDetailsKeysMatchAllowList(loaded.details), true);
    assert.deepEqual(Object.keys(loaded.details!).sort(), [
      ...GUEST_ITEM_DETAILS_FIELDS,
    ].sort());

    const view = guestItemDetailsView(loaded.details!);
    assert.equal(view.availability_display_label, 'Available');
    assert.equal(view.shows_owner_contact, false);
    assert.equal(view.shows_rental_terms, false);

    assert.ok(routeSource.includes('mapGuestItemDetailsFromApi'));
    assert.ok(routeSource.includes('GUEST_ITEM_DETAILS_LOADING_LABEL') === false);
    assert.ok(detailsSource.includes('GUEST_ITEM_DETAILS_LOADING_LABEL'));
  });

  test('privacy mapping strips owner/contact/rental_terms from API envelopes', async () => {
    const mapped = mapGuestItemDetailsFromApi({
      listing: {
        id: 9,
        title: 'Safe Details',
        category: 'Tools',
        description: 'Guest description',
        availability: 'unavailable',
        owner: {
          first_name: 'Pat',
          last_name: 'Owner',
          email: 'owner@mycentennialcollege.ca',
          phone: '416-555-0100',
        },
        owner_id: 4,
        rental_terms: 'Cash only',
        contact_hidden: false,
        images: [{ url: '/uploads/x.jpg' }],
      },
    });
    assert.ok(mapped);
    assert.equal(guestItemDetailsKeysMatchAllowList(mapped), true);
    assert.equal(guestItemDetailsContainsHiddenField(mapped), false);
    assert.equal(mapped!.availability, 'unavailable');
    assert.equal('owner' in mapped!, false);
    assert.equal('rental_terms' in mapped!, false);

    const loaded = await runGuestItemDetailsFetchFlow(async () => ({
      listing: {
        id: 9,
        title: 'Safe Details',
        category: 'Tools',
        description: 'Guest description',
        availability: 'unavailable',
        owner: { email: 'owner@mycentennialcollege.ca' },
        rental_terms: 'hidden',
      },
    }), 9);
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.details!.availability, 'unavailable');
    assert.equal(
      guestItemDetailsView(loaded.details!).availability_display_label,
      'Unavailable'
    );
    assert.equal(loaded.details!.title, 'Safe Details');
    assert.equal(loaded.details!.description, 'Guest description');
  });

  test('404 and other failures map to safe UI states without fake data', async () => {
    const missing = await runGuestItemDetailsFetchFlow(async () => {
      const error = new Error('Listing not found') as Error & { status: number };
      error.status = 404;
      throw error;
    }, '55');
    assert.equal(missing.called, true);
    assert.equal(missing.status, 'not_found');
    assert.equal(missing.notFound, true);
    assert.equal(missing.details, null);
    assert.equal(GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE, 'Item not found.');

    const failed = await runGuestItemDetailsFetchFlow(async () => {
      throw new Error('Network down');
    }, '55');
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Network down');
    assert.equal(failed.details, null);
    assert.equal(
      GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
      'Unable to load item details.'
    );

    const invalid = await runGuestItemDetailsFetchFlow(async () => {
      throw new Error('should not call');
    }, 'abc');
    assert.equal(invalid.called, false);
    assert.equal(invalid.status, 'not_found');
    assert.equal(invalid.details, null);

    assert.ok(routeSource.includes('status === 404'));
    assert.ok(detailsSource.includes('guest-item-details-not-found'));
    assert.ok(detailsSource.includes('guest-item-details-error'));
  });
});

describe('US-02.5 restricted action and navigation regressions', () => {
  test('Request rental still opens registration prompt; no rental API', () => {
    const attempt = attemptGuestItemDetailsRentalRequestUi('available');
    assert.equal(attempt.apiCalled, false);
    assert.equal(attempt.rental_enabled, false);
    assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
    assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
    assert.equal(attempt.prompt.pretends_success, false);

    assert.ok(detailsSource.includes('GuestRegistrationPrompt'));
    assert.equal(detailsSource.includes('/api/requests'), false);
    assert.equal(routeSource.includes('/api/requests'), false);
    assert.equal(routeSource.includes('api.post'), false);
  });

  test('US-01 guest cards still link to /listings/:id; US-10 page unchanged', () => {
    assert.ok(cardSource.includes('guest-listing-card-detail-link'));
    assert.ok(cardSource.includes('detail_path') || cardSource.includes('view.detail_path'));
    assert.ok(cardSource.includes('/listings/') || cardSource.includes('detail_path'));

    assert.ok(listingDetailSource.includes('listing.owner'));
    assert.ok(listingDetailSource.includes('listing.rental_terms'));
    assert.ok(listingDetailSource.includes("api.post<RentalRequest>('/requests'"));
    assert.ok(listingDetailSource.includes("api.get<Listing>(`/listings/${listingId}`)"));
    assert.equal(listingDetailSource.includes('getGuestListingDetails'), false);
  });
});
