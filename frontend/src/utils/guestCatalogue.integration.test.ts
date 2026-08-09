/**
 * US-01.5 — GuestCatalogue ↔ GET /api/guest/listings integration helpers.
 * Pure logic + source wiring checks; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_EMPTY_RESULTS_MESSAGE,
  GUEST_LOAD_ERROR_FALLBACK,
  GUEST_LOADING_LABEL,
  GUEST_PREVIEW_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestRestrictedActionUi,
  buildGetGuestListingsCall,
  buildGuestListingsPath,
  canStartGuestCatalogueRequest,
  defaultGuestCatalogueFilters,
  guestCatalogueUiStatus,
  guestListingCardView,
  guestPreviewContainsHiddenField,
  guestPreviewKeysMatchAllowList,
  mapGuestListingsFromApi,
  normalizeGuestCatalogueFilters,
  runGuestCatalogueFetchFlow,
  type GuestListingPreview,
  type GuestListingsResponse,
} from './guestCatalogue';

const here = dirname(fileURLToPath(import.meta.url));
const catalogueSource = readFileSync(
  join(here, '../components/GuestCatalogue.tsx'),
  'utf8'
);
const cardSource = readFileSync(
  join(here, '../components/GuestListingCard.tsx'),
  'utf8'
);
const browseSource = readFileSync(join(here, '../pages/BrowsePage.tsx'), 'utf8');
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');

function samplePreview(
  overrides: Partial<GuestListingPreview> = {}
): GuestListingPreview {
  return {
    id: 11,
    title: 'Campus Camera',
    category: 'Electronics',
    availability: 'available',
    thumbnail_url: '/uploads/camera.jpg',
    ...overrides,
  };
}

function sampleResponse(
  listings: GuestListingPreview[] = [samplePreview()]
): GuestListingsResponse {
  return { listings };
}

describe('US-01.5 guest listings API client descriptors', () => {
  test('getGuestListings path omits blank filters and does not require auth', () => {
    const defaults = buildGetGuestListingsCall();
    assert.equal(defaults.method, 'GET');
    assert.equal(defaults.path, '/guest/listings');
    assert.equal(defaults.requiresAuth, false);
    assert.equal(defaults.path.includes('q='), false);
    assert.equal(defaults.path.includes('category='), false);

    const trimmed = normalizeGuestCatalogueFilters({
      q: '  camera ',
      category: 'all',
    });
    assert.equal(trimmed.error, '');
    assert.equal(
      buildGuestListingsPath(trimmed.filters),
      '/guest/listings?q=camera'
    );

    const withCategory = buildGuestListingsPath({
      q: null,
      category: 'Electronics',
    });
    assert.equal(withCategory, '/guest/listings?category=Electronics');

    const combined = buildGuestListingsPath({
      q: 'kit',
      category: 'Lab Equipment',
    });
    assert.equal(
      combined,
      '/guest/listings?q=kit&category=Lab+Equipment'
    );
    assert.equal(combined.includes('undefined'), false);
    assert.equal(combined.includes('null'), false);

    assert.ok(clientSource.includes('getGuestListings'));
    assert.ok(clientSource.includes('buildGuestListingsPath'));
    assert.ok(clientSource.includes('GuestListingsResponse'));
  });
});

describe('US-01.5 initial load / search / category / combined flows', () => {
  test('initial load uses unfiltered guest endpoint and renders allow-listed rows', async () => {
    assert.equal(GUEST_LOADING_LABEL, 'Loading guest listings...');
    assert.equal(guestCatalogueUiStatus({ loading: true }), 'loading');
    assert.equal(canStartGuestCatalogueRequest({ loading: true }), false);
    assert.equal(canStartGuestCatalogueRequest({ loading: false }), true);

    let seen = defaultGuestCatalogueFilters();
    const loaded = await runGuestCatalogueFetchFlow(async (filters) => {
      seen = filters;
      return sampleResponse([
        samplePreview({ id: 1, title: 'Tripod' }),
        samplePreview({ id: 2, title: 'Lens', category: 'Electronics' }),
      ]);
    });

    assert.deepEqual(seen, defaultGuestCatalogueFilters());
    assert.equal(loaded.called, true);
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.error, '');
    assert.equal(loaded.previews.length, 2);
    assert.equal(loaded.previews[0].title, 'Tripod');
    assert.ok(
      loaded.previews.every((row) => guestPreviewKeysMatchAllowList(row))
    );
    assert.ok(
      loaded.previews.every((row) => !guestPreviewContainsHiddenField(row))
    );

    assert.ok(catalogueSource.includes('api.getGuestListings'));
    assert.ok(catalogueSource.includes('GUEST_LOADING_LABEL'));
    assert.ok(catalogueSource.includes('autoLoad'));
    assert.ok(browseSource.includes('<GuestCatalogue'));
  });

  test('keyword search trims q, hits guest endpoint, and does not search locally', async () => {
    let seenPath = '';
    const result = await runGuestCatalogueFetchFlow(async (filters) => {
      seenPath = buildGuestListingsPath(filters);
      assert.equal(filters.q, 'camera');
      return sampleResponse([samplePreview({ title: 'Camera Kit' })]);
    }, { q: '  camera ', category: null });

    assert.equal(seenPath, '/guest/listings?q=camera');
    assert.equal(result.status, 'ready');
    assert.equal(result.previews[0].title, 'Camera Kit');

    // Catalogue must not invent or filter rows locally.
    assert.equal(catalogueSource.includes('Math.random'), false);
    assert.equal(catalogueSource.includes('.filter((preview'), false);
    assert.equal(catalogueSource.includes('includes(draftKeyword'), false);
  });

  test('category All omits category; valid category and combined filters are sent', async () => {
    const allPath = buildGuestListingsPath(
      normalizeGuestCatalogueFilters({ q: '', category: '' }).filters
    );
    assert.equal(allPath, '/guest/listings');

    let seen = defaultGuestCatalogueFilters();
    const categoryOnly = await runGuestCatalogueFetchFlow(async (filters) => {
      seen = filters;
      return sampleResponse([
        samplePreview({ category: 'Electronics' }),
      ]);
    }, { q: null, category: 'Electronics' });

    assert.deepEqual(seen, { q: null, category: 'Electronics' });
    assert.equal(
      buildGuestListingsPath(categoryOnly.appliedFilters),
      '/guest/listings?category=Electronics'
    );
    assert.equal(categoryOnly.previews[0].category, 'Electronics');

    const combined = await runGuestCatalogueFetchFlow(async (filters) => {
      assert.equal(filters.q, 'camera');
      assert.equal(filters.category, 'Electronics');
      return sampleResponse([
        samplePreview({ title: 'Filtered Camera', category: 'Electronics' }),
      ]);
    }, { q: 'camera', category: 'Electronics' });

    assert.equal(combined.status, 'ready');
    assert.equal(combined.previews.length, 1);
    assert.equal(combined.appliedFilters.q, 'camera');
    assert.equal(combined.appliedFilters.category, 'Electronics');
  });
});

describe('US-01.5 preview privacy, empty, error, restricted actions', () => {
  test('API mapper keeps only approved preview fields', () => {
    const mapped = mapGuestListingsFromApi({
      listings: [
        {
          id: 9,
          title: 'Safe Preview',
          category: 'Tools',
          availability: 'unavailable',
          thumbnail_url: '/uploads/tool.jpg',
          description: 'HIDDEN_DESCRIPTION',
          rental_terms: 'HIDDEN_TERMS',
          owner: {
            email: 'owner@mycentennialcollege.ca',
            phone: '416-555-0100',
            first_name: 'Pat',
            last_name: 'Owner',
          },
          owner_id: 4,
          contact_hidden: false,
        },
      ],
    });

    assert.equal(mapped.length, 1);
    assert.deepEqual(Object.keys(mapped[0]).sort(), [...GUEST_PREVIEW_FIELDS].sort());
    assert.equal(guestPreviewContainsHiddenField(mapped[0]), false);
    assert.equal('description' in mapped[0], false);
    assert.equal('owner' in mapped[0], false);

    const view = guestListingCardView(mapped[0]);
    assert.equal('description' in view, false);
    assert.equal('rental_terms' in view, false);
    assert.equal('email' in view, false);
    assert.equal('phone' in view, false);
    assert.ok(cardSource.includes('preview: GuestListingPreview'));
  });

  test('empty listings array is success empty state, not an error', async () => {
    const empty = await runGuestCatalogueFetchFlow(async () => sampleResponse([]));
    assert.equal(empty.called, true);
    assert.equal(empty.status, 'empty');
    assert.equal(empty.error, '');
    assert.equal(empty.previews.length, 0);
    assert.equal(GUEST_EMPTY_RESULTS_MESSAGE, 'No listings match your search.');
    assert.ok(catalogueSource.includes('GUEST_EMPTY_RESULTS_MESSAGE'));
    assert.ok(catalogueSource.includes('guest-catalogue-empty'));
  });

  test('failed request shows error, clears rows, preserves prior applied filters for retry', async () => {
    const previous = {
      previews: [samplePreview({ title: 'Prior' })],
      appliedFilters: { q: 'prior', category: 'Electronics' as const },
    };

    const failed = await runGuestCatalogueFetchFlow(
      async () => {
        throw new Error('Guest catalogue unavailable');
      },
      { q: 'retry-me', category: null },
      previous
    );

    assert.equal(failed.called, true);
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Guest catalogue unavailable');
    assert.equal(failed.previews.length, 0);
    assert.deepEqual(failed.appliedFilters, previous.appliedFilters);
    assert.equal(GUEST_LOAD_ERROR_FALLBACK, 'Unable to load guest listings.');

    const retry = await runGuestCatalogueFetchFlow(
      async (filters) => {
        assert.equal(filters.q, 'retry-me');
        return sampleResponse([samplePreview({ title: 'Recovered' })]);
      },
      { q: 'retry-me', category: null },
      { previews: failed.previews, appliedFilters: failed.appliedFilters }
    );
    assert.equal(retry.status, 'ready');
    assert.equal(retry.previews[0].title, 'Recovered');
    assert.ok(catalogueSource.includes('GUEST_LOAD_ERROR_FALLBACK'));
    assert.ok(catalogueSource.includes('guest-catalogue-error'));
    assert.ok(catalogueSource.includes('disabled={busy}'));
  });

  test('restricted actions still open registration prompt before any registered API', () => {
    for (const action of [
      'request_rental',
      'create_listing',
      'start_conversation',
    ] as const) {
      const attempt = attemptGuestRestrictedActionUi(action);
      assert.equal(attempt.success, false);
      assert.equal(attempt.apiCalled, false);
      assert.equal(attempt.blocked_before_api, true);
      assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
      assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
      assert.equal(attempt.prompt.pretends_success, false);
    }

    assert.ok(catalogueSource.includes('attemptGuestRestrictedActionUi'));
    assert.ok(catalogueSource.includes('GuestRegistrationPrompt'));
    assert.ok(cardSource.includes("'request_rental'"));
    assert.ok(cardSource.includes("'start_conversation'"));
    assert.equal(catalogueSource.includes('/api/requests'), false);
    assert.equal(catalogueSource.includes('/api/conversations'), false);
    assert.equal(catalogueSource.includes('api.post'), false);
  });
});

describe('US-01.5 auth and US-02 boundary regression', () => {
  test('guest uses public preview API; verified student keeps registered browse', () => {
    assert.ok(browseSource.includes('GuestCatalogue'));
    assert.ok(browseSource.includes('VerifiedStudentBrowsePage'));
    assert.ok(browseSource.includes('/listings?'));
    assert.ok(browseSource.includes('data-testid="verified-student-browse"'));
    assert.equal(browseSource.includes('getGuestListings'), false);

    assert.ok(catalogueSource.includes('getGuestListings'));
    assert.equal(catalogueSource.includes('fetch('), false);
    assert.equal(catalogueSource.includes("api.get('/listings"), false);
    assert.ok(clientSource.includes('buildGuestListingsPath(filters)'));

    assert.match(
      appSource,
      /path="listings\/:id"[\s\S]*?requireVerifiedStudent/
    );
    assert.equal(catalogueSource.includes('ListingDetailPage'), false);
    assert.equal(cardSource.includes('rental_terms'), false);
    assert.equal(cardSource.includes('description'), false);
  });
});
