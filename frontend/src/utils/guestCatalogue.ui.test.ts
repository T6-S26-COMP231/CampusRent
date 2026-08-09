/**
 * US-01.2 — guest catalogue cards / search / category / registration-prompt UI.
 * Pure helper + source inspection; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_CATALOGUE_PATH,
  GUEST_EMPTY_RESULTS_MESSAGE,
  GUEST_LISTING_CATEGORIES,
  GUEST_LOADING_LABEL,
  GUEST_PREVIEW_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestRestrictedActionUi,
  guestCatalogueUiStatus,
  guestCategorySelectOptions,
  guestListingCardView,
  guestPreviewContainsHiddenField,
  guestRegistrationPromptForAction,
  normalizeGuestCatalogueFilters,
  toGuestListingPreview,
} from './guestCatalogue';

const here = dirname(fileURLToPath(import.meta.url));
const cardSource = readFileSync(
  join(here, '../components/GuestListingCard.tsx'),
  'utf8'
);
const catalogueSource = readFileSync(
  join(here, '../components/GuestCatalogue.tsx'),
  'utf8'
);
const promptSource = readFileSync(
  join(here, '../components/GuestRegistrationPrompt.tsx'),
  'utf8'
);
const browseSource = readFileSync(join(here, '../pages/BrowsePage.tsx'), 'utf8');
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const listingCardSource = readFileSync(
  join(here, '../components/ListingCard.tsx'),
  'utf8'
);

describe('US-01.2 guest listing card presentation', () => {
  test('card view exposes title, category, availability, thumbnail; hides contact/description', () => {
    const preview = toGuestListingPreview({
      id: 12,
      title: 'Campus Camera',
      category: 'Electronics',
      availability: 'available',
      images: [{ url: '/uploads/camera.jpg' }],
    });
    const view = guestListingCardView(preview);

    assert.equal(view.title, 'Campus Camera');
    assert.equal(view.category, 'Electronics');
    assert.equal(view.availability, 'available');
    assert.equal(view.thumbnail_url, '/uploads/camera.jpg');
    assert.equal(view.has_thumbnail, true);
    assert.equal(view.detail_path, '/listings/12');
    assert.deepEqual(GUEST_PREVIEW_FIELDS, [
      'id',
      'title',
      'category',
      'availability',
      'thumbnail_url',
    ]);
    assert.equal(guestPreviewContainsHiddenField(view), false);
    assert.equal('description' in view, false);
    assert.equal('rental_terms' in view, false);
    assert.equal('owner' in view, false);
    assert.equal('email' in view, false);
    assert.equal('phone' in view, false);

    const emptyThumb = guestListingCardView(
      toGuestListingPreview({
        id: 3,
        title: 'Textbook',
        category: 'Textbooks',
        availability: 'unavailable',
        images: [],
      })
    );
    assert.equal(emptyThumb.has_thumbnail, false);
    assert.equal(emptyThumb.thumbnail_url, null);

    assert.ok(cardSource.includes('guest-listing-card-title'));
    assert.ok(cardSource.includes('guest-listing-card-category'));
    assert.ok(cardSource.includes('guest-listing-card-availability'));
    assert.ok(cardSource.includes('guest-listing-card-thumbnail'));
    assert.ok(cardSource.includes('guest-listing-card-thumbnail-fallback'));
    assert.ok(cardSource.includes('Package'));
    assert.equal(cardSource.includes('preview.description'), false);
    assert.equal(cardSource.includes('listing.description'), false);
    assert.equal(cardSource.includes('rental_terms'), false);
    assert.equal(cardSource.includes('owner.'), false);
    assert.equal(cardSource.includes('first_name'), false);
    assert.equal(cardSource.includes('owner.email'), false);
    assert.equal(cardSource.includes('owner.phone'), false);
    assert.equal(cardSource.includes('api.'), false);
    assert.equal(cardSource.includes('fetch('), false);
  });
});

describe('US-01.2 guest keyword and category filter UI', () => {
  test('keyword/category controls use guestCatalogue helpers and approved categories', () => {
    assert.ok(catalogueSource.includes('guest-catalogue-keyword'));
    assert.ok(catalogueSource.includes('guest-catalogue-category'));
    assert.ok(catalogueSource.includes('normalizeGuestCatalogueFilters'));
    assert.ok(catalogueSource.includes('guestCategorySelectOptions'));
    assert.ok(catalogueSource.includes('name="q"'));
    assert.equal(/\bprice\b/.test(catalogueSource), false);
    assert.equal(/\blocation\b/.test(catalogueSource), false);
    assert.equal(/\brating\b/.test(catalogueSource), false);

    const options = guestCategorySelectOptions();
    assert.equal(options[0].value, '');
    assert.equal(options[0].label, 'All categories');
    assert.ok(
      GUEST_LISTING_CATEGORIES.every((category) =>
        options.some((option) => option.value === category)
      )
    );

    const normalized = normalizeGuestCatalogueFilters({
      q: '  camera ',
      category: 'Electronics',
    });
    assert.equal(normalized.error, '');
    assert.deepEqual(normalized.filters, {
      q: 'camera',
      category: 'Electronics',
    });

    // Search prepares filters only — catalogue must not invent local result rows.
    assert.equal(catalogueSource.includes('Math.random'), false);
    assert.equal(catalogueSource.includes('fake'), false);
    assert.equal(catalogueSource.includes('/api/'), false);
    assert.equal(catalogueSource.includes('getAdminActivity'), false);
    assert.equal(catalogueSource.includes("api.get"), false);
  });
});

describe('US-01.2 registration prompt and restricted actions', () => {
  test('restricted action opens register/sign-in prompt without fake success or API call', () => {
    const attempt = attemptGuestRestrictedActionUi('request_rental');
    assert.equal(attempt.success, false);
    assert.equal(attempt.apiCalled, false);
    assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
    assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
    assert.equal(attempt.prompt.register_path, '/register');
    assert.equal(attempt.prompt.sign_in_path, '/login');
    assert.equal(attempt.prompt.pretends_success, false);

    const prompt = guestRegistrationPromptForAction('create_listing');
    assert.match(prompt.message, /school email/i);
    assert.equal(prompt.pretends_success, false);

    assert.ok(promptSource.includes('guest-registration-prompt'));
    assert.ok(promptSource.includes('to={prompt.register_path}'));
    assert.ok(promptSource.includes('to={prompt.sign_in_path}'));
    assert.ok(catalogueSource.includes('GuestRegistrationPrompt'));
    assert.ok(catalogueSource.includes("'create_listing'"));
    assert.ok(cardSource.includes("'request_rental'"));
    assert.ok(cardSource.includes('onRestrictedAction'));
    assert.equal(catalogueSource.includes('pretends_success: true'), false);
    assert.equal(catalogueSource.includes('/requests'), false);
    assert.equal(catalogueSource.includes('/conversations'), false);
  });
});

describe('US-01.2 loading/empty, browse routing, and authenticated regression', () => {
  test('loading/empty copy and guest browse wiring; verified catalogue remains', () => {
    assert.equal(GUEST_LOADING_LABEL, 'Loading guest listings...');
    assert.equal(GUEST_EMPTY_RESULTS_MESSAGE, 'No listings match your search.');
    assert.equal(guestCatalogueUiStatus({ loading: true }), 'loading');
    assert.equal(guestCatalogueUiStatus({ previewCount: 0 }), 'empty');
    assert.equal(guestCatalogueUiStatus({ previewCount: 2 }), 'ready');

    assert.ok(catalogueSource.includes('GUEST_LOADING_LABEL'));
    assert.ok(catalogueSource.includes('GUEST_EMPTY_RESULTS_MESSAGE'));
    assert.ok(catalogueSource.includes('guest-catalogue-loading'));
    assert.ok(catalogueSource.includes('guest-catalogue-empty'));

    assert.equal(GUEST_CATALOGUE_PATH, '/browse');
    assert.ok(browseSource.includes('GuestCatalogue'));
    assert.ok(browseSource.includes('VerifiedStudentBrowsePage'));
    assert.ok(browseSource.includes('ListingCard'));
    assert.ok(browseSource.includes('/listings?'));
    assert.ok(browseSource.includes('data-testid="verified-student-browse"'));

    // /browse is open for guests; verified-student guards remain on other student routes.
    assert.ok(appSource.includes('path="browse"'));
    assert.equal(
      appSource.includes('<ProtectedRoute requireVerifiedStudent>\n              <BrowsePage'),
      false
    );
    assert.ok(appSource.includes('<ProtectedRoute requireVerifiedStudent>'));
    assert.ok((appSource.match(/requireVerifiedStudent/g) || []).length >= 6);

    // Registered ListingCard still shows description/owner for verified students.
    assert.ok(listingCardSource.includes('listing.description'));
    assert.ok(listingCardSource.includes('listing.owner'));

    // Guest UI must not implement US-02 detail content.
    assert.equal(cardSource.includes('rental_terms'), false);
    assert.equal(catalogueSource.includes('ListingDetailPage'), false);
  });
});
