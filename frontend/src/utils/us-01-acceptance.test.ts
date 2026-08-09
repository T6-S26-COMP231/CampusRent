/**
 * US-01.6 — frontend helper coverage mapped to Team6 TAC guest-preview UX.
 *
 * TAC Test 1 — Browse limited listing previews → limited info without owner contact
 * TAC Test 2 — Search using a keyword → matching limited previews returned
 * TAC Test 3 — Apply category filters → filtered limited previews displayed
 * TAC Test 4 — Attempt restricted action → registration prompt displayed
 *
 * Broader detail remains in guestCatalogue.test.ts, guestCatalogue.ui.test.ts,
 * guestCatalogue.security.test.ts, and guestCatalogue.integration.test.ts.
 * This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; GuestCatalogue /
 * GuestListingCard / GuestRegistrationPrompt rendering is not exercised here.
 * Browse/search/filter/prompt behavior is proven through the helper contracts
 * GuestCatalogue uses (runGuestCatalogueFetchFlow / attemptGuestRestrictedActionUi)
 * plus source-level wiring checks.
 *
 * Do NOT claim production Overall Result: PASSED — US-01.7 (#194) owns
 * merge/deploy/manual acceptance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_CATEGORY_ALL_LABEL,
  GUEST_EMPTY_RESULTS_MESSAGE,
  GUEST_LISTING_CATEGORIES,
  GUEST_LOADING_LABEL,
  GUEST_PREVIEW_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_RESTRICTED_ACTIONS,
  GUEST_SIGN_IN_PATH,
  attemptGuestRestrictedActionUi,
  buildGuestListingsPath,
  canStartGuestCatalogueRequest,
  catalogueAudienceCapabilities,
  defaultGuestCatalogueFilters,
  guestCatalogueUiStatus,
  guestCategorySelectOptions,
  guestListingCardView,
  guestPreviewContainsHiddenField,
  guestPreviewKeysMatchAllowList,
  guestPreviewSelectionIntent,
  guestRegistrationPromptForAction,
  mapGuestListingsFromApi,
  normalizeGuestCatalogueFilters,
  runGuestCatalogueFetchFlow,
  type GuestListingPreview,
  type GuestListingsResponse,
} from './guestCatalogue';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_01_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-01.7' as const;
export const US_01_PRODUCTION_ACCEPTANCE_REASON =
  'US-01.7 (#194) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

const here = dirname(fileURLToPath(import.meta.url));
const catalogueSource = readFileSync(
  join(here, '../components/GuestCatalogue.tsx'),
  'utf8'
);
const cardSource = readFileSync(
  join(here, '../components/GuestListingCard.tsx'),
  'utf8'
);
const promptSource = readFileSync(
  join(here, '../components/GuestRegistrationPrompt.tsx'),
  'utf8'
);
const browseSource = readFileSync(join(here, '../pages/BrowsePage.tsx'), 'utf8');
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');

function samplePreview(
  overrides: Partial<GuestListingPreview> = {}
): GuestListingPreview {
  return {
    id: 41,
    title: 'Acceptance Camera',
    category: 'Electronics',
    availability: 'available',
    thumbnail_url: '/uploads/accept-cam.jpg',
    ...overrides,
  };
}

function sampleResponse(
  listings: GuestListingPreview[] = [samplePreview()]
): GuestListingsResponse {
  return { listings };
}

describe('US-01 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Browse limited listing previews without owner contact', async () => {
    assert.equal(GUEST_LOADING_LABEL, 'Loading guest listings...');
    assert.equal(guestCatalogueUiStatus({ loading: true }), 'loading');
    assert.equal(canStartGuestCatalogueRequest({ loading: true }), false);

    const loaded = await runGuestCatalogueFetchFlow(async (filters) => {
      assert.deepEqual(filters, defaultGuestCatalogueFilters());
      return sampleResponse([
        samplePreview({
          id: 1,
          title: 'Campus Camera',
          category: 'Electronics',
          availability: 'available',
          thumbnail_url: '/uploads/cam.jpg',
        }),
        samplePreview({
          id: 2,
          title: 'Tripod Stand',
          category: 'Tools',
          availability: 'unavailable',
          thumbnail_url: null,
        }),
      ]);
    });

    assert.equal(loaded.called, true);
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.error, '');
    assert.equal(loaded.previews.length, 2);

    for (const preview of loaded.previews) {
      assert.equal(guestPreviewKeysMatchAllowList(preview), true);
      assert.deepEqual(Object.keys(preview).sort(), [...GUEST_PREVIEW_FIELDS].sort());
      assert.equal(guestPreviewContainsHiddenField(preview), false);

      const view = guestListingCardView(preview);
      assert.ok(view.title);
      assert.ok(view.category);
      assert.ok(view.availability);
      assert.equal('description' in view, false);
      assert.equal('rental_terms' in view, false);
      assert.equal('owner' in view, false);
      assert.equal('email' in view, false);
      assert.equal('phone' in view, false);
    }

    assert.equal(loaded.previews[0].thumbnail_url, '/uploads/cam.jpg');
    assert.equal(guestListingCardView(loaded.previews[0]).has_thumbnail, true);
    assert.equal(guestListingCardView(loaded.previews[1]).has_thumbnail, false);

    // Poisoned API payload must still strip private fields before UI use.
    const mapped = mapGuestListingsFromApi({
      listings: [
        {
          ...samplePreview({ id: 9, title: 'Safe Row' }),
          description: 'LEAK_DESCRIPTION',
          rental_terms: 'LEAK_TERMS',
          owner: {
            first_name: 'Pat',
            last_name: 'Owner',
            email: 'owner@mycentennialcollege.ca',
            phone: '416-555-0100',
          },
          owner_id: 4,
        },
      ],
    });
    assert.equal(mapped.length, 1);
    assert.equal(guestPreviewContainsHiddenField(mapped[0]), false);
    assert.equal('description' in mapped[0], false);
    assert.equal('owner' in mapped[0], false);

    assert.ok(catalogueSource.includes('api.getGuestListings'));
    assert.ok(catalogueSource.includes('GUEST_LOADING_LABEL'));
    assert.ok(catalogueSource.includes('mapGuestListingsFromApi'));
    assert.ok(cardSource.includes('preview: GuestListingPreview'));
    assert.ok(cardSource.includes('guest-listing-card-thumbnail-fallback'));
    assert.equal(catalogueSource.includes('Math.random'), false);
    assert.equal(cardSource.includes('preview.description'), false);
    assert.equal(cardSource.includes('preview.owner'), false);

    assert.equal(US_01_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-01.7');
  });

  test('TAC Test 2 — Search using a keyword returns matching limited previews', async () => {
    let seenPath = '';
    const searched = await runGuestCatalogueFetchFlow(
      async (filters) => {
        seenPath = buildGuestListingsPath(filters);
        assert.equal(filters.q, 'camera');
        return sampleResponse([
          samplePreview({ id: 5, title: 'Matching Camera Kit' }),
        ]);
      },
      { q: '  camera ', category: null }
    );

    assert.equal(seenPath, '/guest/listings?q=camera');
    assert.equal(searched.status, 'ready');
    assert.equal(searched.previews.length, 1);
    assert.equal(searched.previews[0].title, 'Matching Camera Kit');
    assert.equal(searched.appliedFilters.q, 'camera');

    const empty = await runGuestCatalogueFetchFlow(
      async (filters) => {
        assert.equal(filters.q, 'zzz-no-match');
        return sampleResponse([]);
      },
      { q: 'zzz-no-match', category: null }
    );
    assert.equal(empty.status, 'empty');
    assert.equal(empty.error, '');
    assert.equal(GUEST_EMPTY_RESULTS_MESSAGE, 'No listings match your search.');

    const normalized = normalizeGuestCatalogueFilters({ q: '  lens  ', category: '' });
    assert.equal(normalized.error, '');
    assert.equal(normalized.filters.q, 'lens');

    assert.ok(catalogueSource.includes('normalizeGuestCatalogueFilters'));
    assert.ok(catalogueSource.includes('loadPreviews'));
    assert.equal(catalogueSource.includes('includes(draftKeyword'), false);
    assert.equal(catalogueSource.includes('.filter((preview'), false);
    assert.ok(catalogueSource.includes('GUEST_EMPTY_RESULTS_MESSAGE'));
  });

  test('TAC Test 3 — Apply category filters displays filtered limited previews', async () => {
    const options = guestCategorySelectOptions();
    assert.equal(options[0].value, '');
    assert.equal(options[0].label, GUEST_CATEGORY_ALL_LABEL);
    assert.ok(
      GUEST_LISTING_CATEGORIES.every((category) =>
        options.some((option) => option.value === category)
      )
    );

    const allPath = buildGuestListingsPath(
      normalizeGuestCatalogueFilters({ q: '', category: 'all' }).filters
    );
    assert.equal(allPath, '/guest/listings');

    let seen = defaultGuestCatalogueFilters();
    const filtered = await runGuestCatalogueFetchFlow(
      async (filters) => {
        seen = filters;
        return sampleResponse([
          samplePreview({
            id: 7,
            title: 'Electronics Only',
            category: 'Electronics',
          }),
        ]);
      },
      { q: null, category: 'Electronics' }
    );

    assert.deepEqual(seen, { q: null, category: 'Electronics' });
    assert.equal(
      buildGuestListingsPath(filtered.appliedFilters),
      '/guest/listings?category=Electronics'
    );
    assert.equal(filtered.status, 'ready');
    assert.equal(filtered.previews[0].category, 'Electronics');

    const combined = await runGuestCatalogueFetchFlow(
      async (filters) => {
        assert.equal(filters.q, 'camera');
        assert.equal(filters.category, 'Electronics');
        return sampleResponse([
          samplePreview({
            id: 8,
            title: 'Filtered Camera',
            category: 'Electronics',
          }),
        ]);
      },
      { q: 'camera', category: 'Electronics' }
    );
    assert.equal(combined.status, 'ready');
    assert.equal(combined.previews.length, 1);
    assert.equal(combined.appliedFilters.q, 'camera');
    assert.equal(combined.appliedFilters.category, 'Electronics');

    assert.ok(catalogueSource.includes('guest-catalogue-category'));
    assert.ok(catalogueSource.includes('guestCategorySelectOptions'));
  });

  test('TAC Test 4 — Attempt restricted action displays registration prompt', () => {
    for (const action of [
      'request_rental',
      'create_listing',
      'start_conversation',
    ] as const) {
      assert.ok(GUEST_RESTRICTED_ACTIONS.includes(action));
      const attempt = attemptGuestRestrictedActionUi(action);
      assert.equal(attempt.success, false);
      assert.equal(attempt.apiCalled, false);
      assert.equal(attempt.blocked_before_api, true);
      assert.equal(attempt.show_registration_prompt, true);
      assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
      assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
      assert.equal(attempt.prompt.register_path, '/register');
      assert.equal(attempt.prompt.sign_in_path, '/login');
      assert.equal(attempt.prompt.pretends_success, false);

      const prompt = guestRegistrationPromptForAction(action);
      assert.equal(prompt.pretends_success, false);
      assert.match(prompt.message, /school email/i);
    }

    assert.ok(catalogueSource.includes('attemptGuestRestrictedActionUi'));
    assert.ok(catalogueSource.includes('GuestRegistrationPrompt'));
    assert.ok(catalogueSource.includes("'create_listing'"));
    assert.ok(cardSource.includes("'request_rental'"));
    assert.ok(cardSource.includes("'start_conversation'"));
    assert.ok(promptSource.includes('to={prompt.register_path}'));
    assert.ok(promptSource.includes('to={prompt.sign_in_path}'));
    assert.equal(catalogueSource.includes('/api/requests'), false);
    assert.equal(catalogueSource.includes('/api/conversations'), false);
    assert.equal(catalogueSource.includes('api.post'), false);
    assert.equal(cardSource.includes('api.post'), false);
  });
});

describe('US-01 TAC frontend acceptance regressions', () => {
  test('guest vs verified-student API audience; US-02 details not implemented', () => {
    const guest = catalogueAudienceCapabilities('guest');
    assert.equal(guest.can_open_guest_catalogue, true);
    assert.equal(guest.sees_limited_preview_only, true);
    assert.equal(guest.can_request_rental, false);
    assert.equal(guest.sees_owner_contact, false);
    assert.equal(guest.uses_existing_registered_browse, false);

    const verified = catalogueAudienceCapabilities('verified_student');
    assert.equal(verified.uses_existing_registered_browse, true);
    assert.equal(verified.sees_limited_preview_only, false);
    assert.equal(verified.can_request_rental, true);

    assert.ok(browseSource.includes('GuestCatalogue'));
    assert.ok(browseSource.includes('VerifiedStudentBrowsePage'));
    assert.ok(browseSource.includes('/listings?'));
    assert.equal(browseSource.includes('getGuestListings'), false);
    assert.ok(catalogueSource.includes('getGuestListings'));
    assert.ok(clientSource.includes('getGuestListings'));

    assert.equal(guestPreviewSelectionIntent(), 'navigate_guest_details_us02');
    assert.ok(appSource.includes('path="listings/:id"'));
    assert.ok(appSource.includes('ListingDetailsRoute'));
    assert.equal(catalogueSource.includes('ListingDetailPage'), false);
    assert.equal(cardSource.includes('rental_terms'), false);
    assert.equal(cardSource.includes('description'), false);

    assert.equal(US_01_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-01.7');
    assert.match(US_01_PRODUCTION_ACCEPTANCE_REASON, /US-01\.7/);
    assert.match(US_01_PRODUCTION_ACCEPTANCE_REASON, /#194/);
  });
});
