/**
 * US-01.4 — guest restricted-action rules and preview privacy hardening.
 * Pure helper + source inspection; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_PREVIEW_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_RESTRICTED_ACTIONS,
  GUEST_SIGN_IN_PATH,
  attemptGuestRestrictedActionUi,
  guestActionRequiresRegistration,
  guestListingCardView,
  guestPreviewContainsHiddenField,
  guestPreviewKeysMatchAllowList,
  pickGuestListingPreviewAllowList,
  toGuestListingPreview,
  type GuestListingPreview,
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

describe('US-01.4 guest preview type / privacy', () => {
  test('GuestListingCard uses allow-listed preview shape only', () => {
    const preview = toGuestListingPreview({
      id: 9,
      title: 'Lab Kit',
      category: 'Lab Equipment',
      availability: 'available',
      thumbnail_url: '/uploads/kit.jpg',
    });

    assert.equal(guestPreviewKeysMatchAllowList(preview), true);
    assert.deepEqual(Object.keys(preview).sort(), [...GUEST_PREVIEW_FIELDS].sort());
    assert.equal(guestPreviewContainsHiddenField(preview), false);

    const cardView = guestListingCardView(preview);
    assert.equal('description' in cardView, false);
    assert.equal('rental_terms' in cardView, false);
    assert.equal('owner' in cardView, false);
    assert.equal('email' in cardView, false);
    assert.equal('phone' in cardView, false);

    const poisoned = {
      ...preview,
      description: 'leak',
      email: 'leak@mycentennialcollege.ca',
      owner: { phone: '416-555-0100' },
    } as GuestListingPreview & {
      description: string;
      email: string;
      owner: { phone: string };
    };
    const cleaned = pickGuestListingPreviewAllowList(poisoned);
    assert.equal(guestPreviewKeysMatchAllowList(cleaned), true);
    assert.equal('description' in cleaned, false);
    assert.equal('email' in cleaned, false);
    assert.equal('owner' in cleaned, false);

    assert.ok(cardSource.includes('preview: GuestListingPreview'));
    assert.ok(cardSource.includes('pickGuestListingPreviewAllowList'));
    assert.equal(cardSource.includes('listing: Listing'), false);
    assert.equal(cardSource.includes('preview.description'), false);
    assert.equal(cardSource.includes('preview.owner'), false);
    assert.equal(cardSource.includes('api.'), false);
    assert.equal(cardSource.includes('fetch('), false);
  });
});

describe('US-01.4 restricted-action blocking', () => {
  test('restricted actions open register/sign-in prompt before any API call', () => {
    for (const action of GUEST_RESTRICTED_ACTIONS) {
      assert.equal(guestActionRequiresRegistration(action), true);
      const result = attemptGuestRestrictedActionUi(action);
      assert.equal(result.success, false);
      assert.equal(result.apiCalled, false);
      assert.equal(result.blocked_before_api, true);
      assert.equal(result.show_registration_prompt, true);
      assert.equal(result.prompt.register_path, GUEST_REGISTER_PATH);
      assert.equal(result.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
      assert.equal(result.prompt.pretends_success, false);
    }

    assert.ok(cardSource.includes('guest-listing-card-request-rental'));
    assert.ok(cardSource.includes('guest-listing-card-message-owner'));
    assert.ok(cardSource.includes("'request_rental'"));
    assert.ok(cardSource.includes("'start_conversation'"));
    assert.ok(catalogueSource.includes("'create_listing'"));
    assert.ok(catalogueSource.includes('blocked_before_api'));
    assert.ok(catalogueSource.includes('GuestRegistrationPrompt'));
    assert.ok(promptSource.includes("to={prompt.register_path}"));
    assert.ok(promptSource.includes("to={prompt.sign_in_path}"));
    assert.equal(catalogueSource.includes('/api/requests'), false);
    assert.equal(catalogueSource.includes('/api/conversations'), false);
    assert.equal(catalogueSource.includes('/api/listings'), false);
    // Card may import assetUrl from api/client for thumbnails; it must not call APIs.
    assert.equal(cardSource.includes('/api/requests'), false);
    assert.equal(cardSource.includes('/api/conversations'), false);
    assert.equal(cardSource.includes('/api/listings'), false);
    assert.equal(cardSource.includes('api.'), false);
    assert.equal(cardSource.includes('fetch('), false);
  });
});

describe('US-01.4 direct-route and catalogue regression', () => {
  test('guest /browse stays open; registered routes and verified browse remain protected', () => {
    assert.ok(browseSource.includes('GuestCatalogue'));
    assert.ok(browseSource.includes('VerifiedStudentBrowsePage'));
    assert.ok(browseSource.includes('ListingCard'));

    assert.ok(appSource.includes('path="browse"'));
    assert.ok(appSource.includes('path="listings/:id"'));
    assert.ok(appSource.includes('ListingDetailsRoute'));
    assert.ok(appSource.includes('<ProtectedRoute requireVerifiedStudent>'));
    assert.ok(appSource.includes('<ProtectedRoute requireAdmin>'));
    assert.ok((appSource.match(/requireVerifiedStudent/g) || []).length >= 6);

    // Guest catalogue uses the public preview client helper (US-01.5).
    assert.ok(catalogueSource.includes('api.getGuestListings'));
    assert.equal(catalogueSource.includes('getAdminActivity'), false);
  });
});
