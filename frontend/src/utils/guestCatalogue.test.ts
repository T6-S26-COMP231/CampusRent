/**
 * US-01.1 — limited guest catalogue / registration-prompt design helpers.
 * Pure logic only; no React DOM, guest API, or listing-card UI.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_CATALOGUE_PATH,
  GUEST_HIDDEN_FIELDS,
  GUEST_KEYWORD_SEARCH_FIELDS,
  GUEST_LISTING_CATEGORIES,
  GUEST_LISTING_DETAIL_PATH_PREFIX,
  GUEST_PREVIEW_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_REGISTRATION_PROMPT_MESSAGE,
  GUEST_RESTRICTED_ACTIONS,
  GUEST_SIGN_IN_PATH,
  GUEST_WORKFLOW_STEPS,
  catalogueAudienceCapabilities,
  defaultGuestCatalogueFilters,
  guestCategorySelectOptions,
  guestListingDetailPath,
  guestPreviewContainsHiddenField,
  guestPreviewKeys,
  guestPreviewSelectionIntent,
  guestRegistrationPromptForAction,
  isGuestHiddenField,
  isGuestListingCategory,
  isGuestPreviewField,
  isGuestRestrictedAction,
  normalizeGuestCatalogueFilters,
  normalizeGuestCategoryInput,
  normalizeGuestKeywordInput,
  toGuestListingPreview,
} from './guestCatalogue';

const here = dirname(fileURLToPath(import.meta.url));

describe('US-01.1 guest catalogue preview field design', () => {
  test('guest preview includes only approved limited fields', () => {
    assert.deepEqual(GUEST_PREVIEW_FIELDS, [
      'id',
      'title',
      'category',
      'availability',
      'thumbnail_url',
    ]);
    for (const field of GUEST_PREVIEW_FIELDS) {
      assert.equal(isGuestPreviewField(field), true, field);
    }
    assert.equal(isGuestPreviewField('description'), false);
    assert.equal(isGuestPreviewField('owner'), false);
    assert.equal(isGuestPreviewField('email'), false);

    const preview = toGuestListingPreview({
      id: 12,
      title: 'Campus Camera',
      category: 'Electronics',
      availability: 'available',
      images: [{ url: '/uploads/camera.jpg' }],
    });

    assert.deepEqual(guestPreviewKeys(preview).sort(), [
      'availability',
      'category',
      'id',
      'thumbnail_url',
      'title',
    ]);
    assert.equal(preview.id, 12);
    assert.equal(preview.title, 'Campus Camera');
    assert.equal(preview.category, 'Electronics');
    assert.equal(preview.availability, 'available');
    assert.equal(preview.thumbnail_url, '/uploads/camera.jpg');
    assert.equal('description' in preview, false);
    assert.equal('owner' in preview, false);
    assert.equal('email' in preview, false);
    assert.equal('phone' in preview, false);
    assert.equal(guestPreviewContainsHiddenField(preview), false);

    // Mapper only projects approved preview keys even when richer listing JSON exists.
    const rich = {
      id: 12,
      title: 'Campus Camera',
      category: 'Electronics',
      availability: 'available' as const,
      description: 'Should not appear on guest preview',
      rental_terms: 'Cash only',
      owner_id: 4,
      owner: {
        email: 'owner@mycentennialcollege.ca',
        phone: '416-555-0100',
      },
      images: [{ url: '/uploads/camera.jpg' }],
    };
    const limited = toGuestListingPreview(rich);
    assert.equal('description' in limited, false);
    assert.equal('owner' in limited, false);
    assert.equal(guestPreviewContainsHiddenField(limited), false);
  });

  test('owner contact and private listing fields are excluded as hidden', () => {
    assert.ok(GUEST_HIDDEN_FIELDS.includes('owner'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('owner_id'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('email'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('phone'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('first_name'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('last_name'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('description'));
    assert.ok(GUEST_HIDDEN_FIELDS.includes('rental_terms'));
    assert.equal(isGuestHiddenField('email'), true);
    assert.equal(isGuestHiddenField('title'), false);

    assert.equal(
      guestPreviewContainsHiddenField({
        id: 1,
        title: 'Tripod',
        category: 'Electronics',
        availability: 'available',
        thumbnail_url: null,
        owner: { email: 'hidden@mycentennialcollege.ca' },
      }),
      true
    );
    assert.equal(
      guestPreviewContainsHiddenField({
        id: 1,
        title: 'Tripod',
        category: 'Electronics',
        availability: 'available',
        thumbnail_url: null,
        phone: '416-555-0199',
      }),
      true
    );

    const emptyThumb = toGuestListingPreview({
      id: 3,
      title: 'Textbook',
      category: 'Textbooks',
      availability: 'unavailable',
      images: [],
    });
    assert.equal(emptyThumb.thumbnail_url, null);
  });
});

describe('US-01.1 guest keyword and category search design', () => {
  test('keyword/category design reuses existing supported fields and categories', () => {
    assert.deepEqual(GUEST_KEYWORD_SEARCH_FIELDS, ['title', 'description']);
    assert.deepEqual(GUEST_LISTING_CATEGORIES, [
      'Textbooks',
      'Electronics',
      'Lab Equipment',
      'Sports & Recreation',
      'Tools',
      'Furniture',
      'Clothing',
      'Other',
    ]);
    assert.equal(isGuestListingCategory('Electronics'), true);
    assert.equal(isGuestListingCategory('Spaceships'), false);

    assert.deepEqual(normalizeGuestKeywordInput('  camera  '), {
      value: 'camera',
      error: '',
    });
    assert.deepEqual(normalizeGuestKeywordInput(''), {
      value: null,
      error: '',
    });

    assert.deepEqual(normalizeGuestCategoryInput(''), {
      value: null,
      error: '',
    });
    assert.deepEqual(normalizeGuestCategoryInput('all'), {
      value: null,
      error: '',
    });
    assert.deepEqual(normalizeGuestCategoryInput('Textbooks'), {
      value: 'Textbooks',
      error: '',
    });
    assert.match(normalizeGuestCategoryInput('Spaceships').error, /Invalid category/);

    const ok = normalizeGuestCatalogueFilters({
      q: ' camera ',
      category: 'Electronics',
    });
    assert.equal(ok.error, '');
    assert.deepEqual(ok.filters, {
      q: 'camera',
      category: 'Electronics',
    });

    const options = guestCategorySelectOptions();
    assert.equal(options[0].value, '');
    assert.equal(options[0].label, 'All categories');
    assert.ok(options.some((option) => option.value === 'Furniture'));

    assert.deepEqual(defaultGuestCatalogueFilters(), {
      q: null,
      category: null,
    });

    // Guest filter design is keyword + category only — no invented price/location.
    const source = readFileSync(join(here, 'guestCatalogue.ts'), 'utf8');
    assert.equal(source.includes('price'), false);
    assert.equal(source.includes('location search'), false);
    assert.equal(/\bowner search\b/i.test(source), false);
  });
});

describe('US-01.1 registration prompt and audience boundary', () => {
  test('restricted rental-related actions map to register/sign-in prompt', () => {
    assert.ok(GUEST_RESTRICTED_ACTIONS.includes('request_rental'));
    assert.ok(GUEST_RESTRICTED_ACTIONS.includes('create_listing'));
    assert.ok(GUEST_RESTRICTED_ACTIONS.includes('start_conversation'));
    assert.equal(isGuestRestrictedAction('request_rental'), true);
    assert.equal(isGuestRestrictedAction('browse_previews'), false);

    const prompt = guestRegistrationPromptForAction('request_rental');
    assert.equal(prompt.heading, 'Registration required');
    assert.equal(
      prompt.message,
      'Create a CampusRent account with your school email to continue. Guests can browse limited listing previews only.'
    );
    assert.equal(prompt.message, GUEST_REGISTRATION_PROMPT_MESSAGE);
    assert.equal(prompt.register_path, GUEST_REGISTER_PATH);
    assert.equal(prompt.sign_in_path, GUEST_SIGN_IN_PATH);
    assert.equal(prompt.register_path, '/register');
    assert.equal(prompt.sign_in_path, '/login');
    assert.equal(prompt.pretends_success, false);
    assert.equal(prompt.restricted_action, 'request_rental');
  });

  test('guest vs verified-student capabilities; registered browse not redefined', () => {
    const guest = catalogueAudienceCapabilities('guest');
    assert.equal(guest.can_open_guest_catalogue, true);
    assert.equal(guest.can_search_keyword, true);
    assert.equal(guest.can_filter_category, true);
    assert.equal(guest.sees_limited_preview_only, true);
    assert.equal(guest.can_request_rental, false);
    assert.equal(guest.sees_owner_contact, false);
    assert.equal(guest.uses_existing_registered_browse, false);

    const student = catalogueAudienceCapabilities('verified_student');
    assert.equal(student.uses_existing_registered_browse, true);
    assert.equal(student.sees_limited_preview_only, false);
    assert.equal(student.can_request_rental, true);
    assert.equal(student.sees_owner_contact, true);
    assert.equal(student.can_open_guest_catalogue, false);

    const admin = catalogueAudienceCapabilities('admin');
    assert.equal(admin.can_open_guest_catalogue, false);
    assert.equal(admin.uses_existing_registered_browse, false);

    // Design reuses /browse; does not invent a second catalogue product path.
    assert.equal(GUEST_CATALOGUE_PATH, '/browse');
    assert.ok(GUEST_WORKFLOW_STEPS.includes('browse_limited_previews'));
    assert.ok(GUEST_WORKFLOW_STEPS.includes('display_registration_prompt'));

    const browseSource = readFileSync(
      join(here, '../pages/BrowsePage.tsx'),
      'utf8'
    );
    // Registered BrowsePage remains the verified-student workflow surface.
    assert.ok(browseSource.includes('ListingCard'));
    assert.ok(browseSource.includes('/listings?'));
    assert.equal(browseSource.includes('GUEST_PREVIEW_FIELDS'), false);
    assert.equal(browseSource.includes('toGuestListingPreview'), false);
  });

  test('US-02 preview-selection boundary is defined without building details', () => {
    assert.equal(guestPreviewSelectionIntent(), 'navigate_guest_details_us02');
    assert.equal(GUEST_LISTING_DETAIL_PATH_PREFIX, '/listings');
    assert.equal(guestListingDetailPath(12), '/listings/12');

    const source = readFileSync(join(here, 'guestCatalogue.ts'), 'utf8');
    assert.match(source, /US-02/);
    assert.match(source, /do not implement/i);

    // No seeded/hard-coded preview catalogue data in the design module.
    assert.equal(source.includes('Users: 125'), false);
    assert.equal(/const FAKE_/.test(source), false);
    assert.equal(/GUEST_PREVIEW_FIELDS\s*=\s*\[\s*\{/.test(source), false);
  });
});
