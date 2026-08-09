/**
 * US-02.6 — frontend helper coverage mapped to Team6 TAC guest item-details UX.
 *
 * TAC Test 1 — Open item details page → Basic item information displayed
 * TAC Test 2 — View listing as guest → Owner contact information hidden
 * TAC Test 3 — Attempt rental request → Registration prompt displayed
 * TAC Test 4 — View unavailable item → Availability status displayed
 *
 * Broader detail remains in guestItemDetails.test.ts, guestItemDetails.ui.test.ts,
 * guestItemDetails.security.test.ts, and guestItemDetails.integration.test.ts.
 * This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; GuestItemDetails /
 * ListingDetailsRoute / GuestRegistrationPrompt rendering is not exercised here.
 * Load/privacy/prompt/unavailable behavior is proven through the helper contracts
 * those pages use (runGuestItemDetailsFetchFlow / attemptGuestItemDetailsRentalRequestUi)
 * plus source-level wiring checks.
 *
 * Do NOT claim production Overall Result: PASSED — US-02.7 (#202) owns
 * merge/deploy/manual acceptance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_ITEM_DETAILS_FIELDS,
  GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
  GUEST_ITEM_DETAILS_LOADING_LABEL,
  GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestItemDetailsRentalRequestUi,
  buildGetGuestItemDetailsCall,
  guestItemDetailsAvailabilityDisplayLabel,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsRemainsViewableWhenUnavailable,
  guestItemDetailsUiStatus,
  guestItemDetailsPath,
  guestItemDetailsView,
  mapGuestItemDetailsFromApi,
  resolveListingDetailsRouteAudience,
  runGuestItemDetailsFetchFlow,
  type GuestItemDetails,
  type GuestItemDetailsResponse,
} from './guestItemDetails';
import {
  guestListingCardView,
  guestPreviewSelectionIntent,
  toGuestListingPreview,
} from './guestCatalogue';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_02_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-02.7' as const;
export const US_02_PRODUCTION_ACCEPTANCE_REASON =
  'US-02.7 (#202) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

const here = dirname(fileURLToPath(import.meta.url));
const detailsSource = readFileSync(
  join(here, '../components/GuestItemDetails.tsx'),
  'utf8'
);
const routeSource = readFileSync(
  join(here, '../pages/ListingDetailsRoute.tsx'),
  'utf8'
);
const promptSource = readFileSync(
  join(here, '../components/GuestRegistrationPrompt.tsx'),
  'utf8'
);
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');
const cardSource = readFileSync(
  join(here, '../components/GuestListingCard.tsx'),
  'utf8'
);
const catalogueSource = readFileSync(
  join(here, '../components/GuestCatalogue.tsx'),
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
    id: 42,
    title: 'Acceptance Campus Camera',
    category: 'Electronics',
    description: 'DSL kit for guest basic details acceptance.',
    availability: 'available',
    ...overrides,
  };
}

function sampleResponse(
  listing: GuestItemDetails = sampleDetails()
): GuestItemDetailsResponse {
  return { listing };
}

describe('US-02 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Open item details page: basic item information displayed', async () => {
    assert.equal(GUEST_ITEM_DETAILS_LOADING_LABEL, 'Loading item details...');
    assert.equal(guestItemDetailsUiStatus({ loading: true }), 'loading');

    assert.deepEqual(
      resolveListingDetailsRouteAudience({ authLoading: false }),
      { ready: true, experience: 'guest_basic_details_us02' }
    );

    const call = buildGetGuestItemDetailsCall(42);
    assert.equal(call.path, '/guest/listings/42');
    assert.equal(call.requiresAuth, false);

    let seenId = 0;
    const loaded = await runGuestItemDetailsFetchFlow(async (listingId) => {
      seenId = listingId;
      return sampleResponse(sampleDetails({ id: listingId }));
    }, '42');

    assert.equal(seenId, 42);
    assert.equal(loaded.called, true);
    assert.equal(loaded.status, 'ready');
    assert.ok(loaded.details);
    assert.equal(loaded.details!.title, 'Acceptance Campus Camera');
    assert.equal(loaded.details!.category, 'Electronics');
    assert.equal(
      loaded.details!.description,
      'DSL kit for guest basic details acceptance.'
    );
    assert.equal(loaded.details!.availability, 'available');
    assert.deepEqual(Object.keys(loaded.details!).sort(), [
      ...GUEST_ITEM_DETAILS_FIELDS,
    ].sort());

    const view = guestItemDetailsView(loaded.details!);
    assert.equal(view.title, 'Acceptance Campus Camera');
    assert.equal(view.category, 'Electronics');
    assert.equal(view.description, 'DSL kit for guest basic details acceptance.');
    assert.equal(view.availability_display_label, 'Available');

    assert.ok(routeSource.includes('api.getGuestListingDetails'));
    assert.ok(routeSource.includes('GuestItemDetails'));
    assert.ok(routeSource.includes('mapGuestItemDetailsFromApi'));
    assert.ok(detailsSource.includes('GUEST_ITEM_DETAILS_LOADING_LABEL'));
    assert.ok(detailsSource.includes('guest-item-details-title'));
    assert.ok(detailsSource.includes('guest-item-details-category'));
    assert.ok(detailsSource.includes('guest-item-details-description'));
    assert.ok(detailsSource.includes('guest-item-details-availability'));
    assert.ok(clientSource.includes('getGuestListingDetails'));
    assert.ok(appSource.includes('ListingDetailsRoute'));

    assert.equal(US_02_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-02.7');
  });

  test('TAC Test 2 — View listing as guest: owner contact information hidden', async () => {
    const mapped = mapGuestItemDetailsFromApi({
      listing: {
        id: 9,
        title: 'Privacy Acceptance Tripod',
        category: 'Tools',
        description: 'US02_TAC2_VISIBLE_DESCRIPTION',
        availability: 'available',
        owner: {
          first_name: 'Hidden',
          last_name: 'Contact',
          email: 'privacy@mycentennialcollege.ca',
          phone: '416-555-0299',
        },
        owner_id: 4,
        rental_terms: 'US02_TAC2_HIDDEN_RENTAL_TERMS',
        contact_hidden: false,
        images: [{ url: '/uploads/private.jpg' }],
      },
    });

    assert.ok(mapped);
    assert.equal(guestItemDetailsKeysMatchAllowList(mapped), true);
    assert.equal(guestItemDetailsContainsHiddenField(mapped), false);
    assert.deepEqual(Object.keys(mapped!).sort(), [...GUEST_ITEM_DETAILS_FIELDS].sort());
    assert.equal(mapped!.description, 'US02_TAC2_VISIBLE_DESCRIPTION');
    assert.equal('owner' in mapped!, false);
    assert.equal('email' in mapped!, false);
    assert.equal('phone' in mapped!, false);
    assert.equal('rental_terms' in mapped!, false);

    const view = guestItemDetailsView(mapped!);
    assert.equal(view.shows_owner_contact, false);
    assert.equal(view.shows_rental_terms, false);
    assert.equal('owner' in view, false);
    assert.equal('email' in view, false);
    assert.equal('phone' in view, false);
    assert.equal('rental_terms' in view, false);

    assert.ok(detailsSource.includes('pickGuestItemDetailsAllowList'));
    assert.ok(routeSource.includes('mapGuestItemDetailsFromApi'));
    assert.equal(detailsSource.includes('details.owner'), false);
    assert.equal(detailsSource.includes('rental_terms'), false);
    assert.equal(detailsSource.includes('listing: Listing'), false);
  });

  test('TAC Test 3 — Attempt rental request: registration prompt displayed', () => {
    for (const availability of ['available', 'unavailable'] as const) {
      const attempt = attemptGuestItemDetailsRentalRequestUi(availability);
      assert.equal(attempt.success, false);
      assert.equal(attempt.apiCalled, false);
      assert.equal(attempt.blocked_before_api, true);
      assert.equal(attempt.rental_enabled, false);
      assert.equal(attempt.show_registration_prompt, true);
      assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
      assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
      assert.equal(attempt.prompt.register_path, '/register');
      assert.equal(attempt.prompt.sign_in_path, '/login');
      assert.equal(attempt.prompt.pretends_success, false);
      assert.equal(attempt.listing_availability, availability);
    }

    assert.ok(detailsSource.includes('attemptGuestItemDetailsRentalRequestUi'));
    assert.ok(detailsSource.includes('GuestRegistrationPrompt'));
    assert.ok(detailsSource.includes('action="request_rental"'));
    assert.ok(promptSource.includes('to={prompt.register_path}'));
    assert.ok(promptSource.includes('to={prompt.sign_in_path}'));
    assert.equal(detailsSource.includes('/api/requests'), false);
    assert.equal(routeSource.includes('/api/requests'), false);
    assert.equal(detailsSource.includes('api.post'), false);
    assert.equal(detailsSource.includes('Rental request submitted'), false);
  });

  test('TAC Test 4 — View unavailable item: availability status displayed', async () => {
    const loaded = await runGuestItemDetailsFetchFlow(async () =>
      sampleResponse(
        sampleDetails({
          id: 77,
          title: 'Unavailable Lab Microscope',
          category: 'Lab Equipment',
          description: 'Still visible while unavailable for acceptance.',
          availability: 'unavailable',
        })
      )
    , '77');

    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.notFound, false);
    assert.ok(loaded.details);
    assert.equal(loaded.details!.availability, 'unavailable');
    assert.equal(
      guestItemDetailsRemainsViewableWhenUnavailable(
        loaded.details!.availability
      ),
      true
    );

    const view = guestItemDetailsView(loaded.details!);
    assert.equal(view.availability, 'unavailable');
    assert.equal(view.availability_display_label, 'Unavailable');
    assert.equal(guestItemDetailsAvailabilityDisplayLabel('unavailable'), 'Unavailable');
    assert.notEqual(view.availability_display_label, 'Available');
    assert.equal(view.title, 'Unavailable Lab Microscope');
    assert.equal(view.category, 'Lab Equipment');
    assert.equal(
      view.description,
      'Still visible while unavailable for acceptance.'
    );
    assert.equal(view.is_unavailable, true);
    assert.equal(view.remains_viewable, true);

    assert.ok(detailsSource.includes('StatusBadge'));
    assert.ok(detailsSource.includes('data-availability={view.availability}'));
    assert.ok(detailsSource.includes('guest-item-details-unavailable-note'));
    assert.equal(
      detailsSource.includes("availability === 'unavailable' && return null"),
      false
    );
  });
});

describe('US-02 TAC frontend acceptance regressions', () => {
  test('routing, US-10, US-01 navigation, and safe error states', async () => {
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

    assert.ok(routeSource.includes('listing-details-auth-loading'));
    assert.ok(routeSource.includes('ListingDetailPage'));
    assert.ok(routeSource.includes("Navigate to=\"/admin\""));
    assert.ok(routeSource.includes("Navigate to=\"/account\""));
    assert.ok(appSource.includes('ListingDetailsRoute'));
    assert.match(
      appSource,
      /path="listings\/:id"\s+element=\{<ListingDetailsRoute\s*\/>\}/
    );

    assert.ok(listingDetailSource.includes('listing.owner'));
    assert.ok(listingDetailSource.includes('listing.rental_terms'));
    assert.ok(listingDetailSource.includes("api.post<RentalRequest>('/requests'"));
    assert.ok(listingDetailSource.includes("api.get<Listing>(`/listings/${listingId}`)"));
    assert.equal(listingDetailSource.includes('getGuestListingDetails'), false);

    assert.equal(guestPreviewSelectionIntent(), 'navigate_guest_details_us02');
    assert.equal(guestItemDetailsPath(12), '/listings/12');
    const cardView = guestListingCardView(
      toGuestListingPreview({
        id: 12,
        title: 'Catalogue Camera',
        category: 'Electronics',
        availability: 'available',
        images: [{ url: '/uploads/cam.jpg' }],
      })
    );
    assert.equal(cardView.detail_path, '/listings/12');
    assert.ok(cardSource.includes('guest-listing-card-detail-link'));
    assert.ok(catalogueSource.includes('api.getGuestListings'));

    const missing = await runGuestItemDetailsFetchFlow(async () => {
      const error = new Error('Listing not found') as Error & { status: number };
      error.status = 404;
      throw error;
    }, '999');
    assert.equal(missing.status, 'not_found');
    assert.equal(GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE, 'Item not found.');

    const failed = await runGuestItemDetailsFetchFlow(async () => {
      throw new Error('Network down');
    }, '999');
    assert.equal(failed.status, 'error');
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

    assert.equal(US_02_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-02.7');
    assert.match(US_02_PRODUCTION_ACCEPTANCE_REASON, /US-02\.7/);
    assert.match(US_02_PRODUCTION_ACCEPTANCE_REASON, /#202/);
  });
});
