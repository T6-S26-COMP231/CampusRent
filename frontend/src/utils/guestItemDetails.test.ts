/**
 * US-02.1 — guest basic item-details design / contract helpers.
 * Pure logic only; no React DOM, guest details page, or details API.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_ITEM_DETAILS_EXCLUDED_CONTROLS,
  GUEST_ITEM_DETAILS_FIELDS,
  GUEST_ITEM_DETAILS_HIDDEN_FIELDS,
  GUEST_ITEM_DETAILS_LAYOUT_SECTIONS,
  GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
  GUEST_ITEM_DETAILS_LOADING_LABEL,
  GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE,
  GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL,
  GUEST_ITEM_DETAILS_WORKFLOW_STEPS,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestItemDetailsRentalRequestUi,
  buildGetGuestItemDetailsCall,
  buildGuestItemDetailsApiPath,
  guestItemDetailsAvailabilityLabel,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeys,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsPath,
  guestItemDetailsRegistrationPrompt,
  guestItemDetailsRestrictedAction,
  guestItemDetailsUiStatus,
  guestItemDetailsView,
  isGuestItemDetailsField,
  isGuestItemDetailsHiddenField,
  listingDetailsAudienceCapabilities,
  listingDetailsExperienceForAudience,
  parseGuestItemDetailsIdParam,
  pickGuestItemDetailsAllowList,
  toGuestItemDetails,
} from './guestItemDetails';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'guestItemDetails.ts'), 'utf8');
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const listingDetailSource = readFileSync(
  join(here, '../pages/ListingDetailPage.tsx'),
  'utf8'
);

describe('US-02.1 guest item-details field design', () => {
  test('guest details include only approved basic information', () => {
    assert.deepEqual(GUEST_ITEM_DETAILS_FIELDS, [
      'id',
      'title',
      'category',
      'description',
      'availability',
    ]);
    for (const field of GUEST_ITEM_DETAILS_FIELDS) {
      assert.equal(isGuestItemDetailsField(field), true, field);
    }
    assert.equal(isGuestItemDetailsField('owner'), false);
    assert.equal(isGuestItemDetailsField('email'), false);
    assert.equal(isGuestItemDetailsField('rental_terms'), false);
    assert.equal(isGuestItemDetailsField('thumbnail_url'), false);

    const details = toGuestItemDetails({
      id: 12,
      title: 'Campus Camera',
      category: 'Electronics',
      description: 'DSL kit for student projects.',
      availability: 'available',
    });

    assert.deepEqual(guestItemDetailsKeys(details).sort(), [
      'availability',
      'category',
      'description',
      'id',
      'title',
    ]);
    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
    assert.equal(details.title, 'Campus Camera');
    assert.equal(details.category, 'Electronics');
    assert.equal(details.description, 'DSL kit for student projects.');
    assert.equal(details.availability, 'available');
    assert.equal('owner' in details, false);
    assert.equal('email' in details, false);
    assert.equal('phone' in details, false);
    assert.equal('rental_terms' in details, false);
    assert.equal(guestItemDetailsContainsHiddenField(details), false);

    const rich = {
      id: 12,
      title: 'Campus Camera',
      category: 'Electronics',
      description: 'DSL kit for student projects.',
      availability: 'unavailable' as const,
      rental_terms: 'Cash only — must stay hidden',
      owner_id: 4,
      owner: {
        first_name: 'Pat',
        last_name: 'Owner',
        email: 'owner@mycentennialcollege.ca',
        phone: '416-555-0100',
      },
      contact_hidden: false,
      images: [{ url: '/uploads/camera.jpg' }],
      thumbnail_url: '/uploads/camera.jpg',
      password_hash: 'secret',
    };
    const limited = toGuestItemDetails(rich);
    assert.equal(guestItemDetailsKeysMatchAllowList(limited), true);
    assert.equal('rental_terms' in limited, false);
    assert.equal('owner' in limited, false);
    assert.equal('images' in limited, false);
    assert.equal(guestItemDetailsContainsHiddenField(limited), false);

    const poisoned = {
      ...limited,
      email: 'leak@mycentennialcollege.ca',
      rental_terms: 'leak',
    };
    const cleaned = pickGuestItemDetailsAllowList(
      poisoned as typeof limited & { email: string; rental_terms: string }
    );
    assert.equal(guestItemDetailsKeysMatchAllowList(cleaned), true);
    assert.equal('email' in cleaned, false);
    assert.equal('rental_terms' in cleaned, false);
  });

  test('owner/contact and rental_terms are excluded as hidden', () => {
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('owner'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('owner_id'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('email'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('phone'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('first_name'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('last_name'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('rental_terms'));
    assert.ok(GUEST_ITEM_DETAILS_HIDDEN_FIELDS.includes('contact_hidden'));
    assert.equal(isGuestItemDetailsHiddenField('email'), true);
    assert.equal(isGuestItemDetailsHiddenField('description'), false);
    assert.equal(isGuestItemDetailsHiddenField('title'), false);

    assert.equal(
      guestItemDetailsContainsHiddenField({
        id: 1,
        title: 'Tripod',
        category: 'Tools',
        description: 'Stable stand',
        availability: 'available',
        owner: { email: 'x@mycentennialcollege.ca' },
      }),
      true
    );
    assert.equal(
      guestItemDetailsContainsHiddenField({
        id: 1,
        title: 'Tripod',
        category: 'Tools',
        description: 'Stable stand',
        availability: 'available',
        rental_terms: 'hidden',
      }),
      true
    );
  });
});

describe('US-02.1 unavailable status, rental prompt, and audience boundary', () => {
  test('unavailable status is represented explicitly without pretending available', () => {
    const unavailable = toGuestItemDetails({
      id: 3,
      title: 'Lab Microscope',
      category: 'Lab Equipment',
      description: 'Currently checked out.',
      availability: 'unavailable',
    });
    assert.equal(unavailable.availability, 'unavailable');
    assert.equal(guestItemDetailsAvailabilityLabel('unavailable'), 'unavailable');
    assert.equal(guestItemDetailsAvailabilityLabel('available'), 'available');

    const view = guestItemDetailsView(unavailable);
    assert.equal(view.availability, 'unavailable');
    assert.equal(view.availability_label, 'unavailable');
    assert.notEqual(view.availability_label, 'available');
    assert.equal(view.description, 'Currently checked out.');
    assert.equal(view.shows_owner_contact, false);
    assert.equal(view.shows_rental_terms, false);
    assert.equal(view.back_path, '/browse');
    assert.equal(view.request_rental_label, GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL);
    assert.equal(view.request_rental_label, 'Request rental');
  });

  test('Request rental maps to existing registration/sign-in prompt without API success', () => {
    assert.equal(guestItemDetailsRestrictedAction(), 'request_rental');

    const attempt = attemptGuestItemDetailsRentalRequestUi();
    assert.equal(attempt.success, false);
    assert.equal(attempt.apiCalled, false);
    assert.equal(attempt.blocked_before_api, true);
    assert.equal(attempt.show_registration_prompt, true);
    assert.equal(attempt.restricted_action, 'request_rental');
    assert.equal(attempt.register_path, GUEST_REGISTER_PATH);
    assert.equal(attempt.sign_in_path, GUEST_SIGN_IN_PATH);
    assert.equal(attempt.register_path, '/register');
    assert.equal(attempt.sign_in_path, '/login');
    assert.equal(attempt.prompt.pretends_success, false);
    assert.equal(attempt.prompt.register_path, '/register');
    assert.equal(attempt.prompt.sign_in_path, '/login');

    const prompt = guestItemDetailsRegistrationPrompt();
    assert.equal(prompt.restricted_action, 'request_rental');
    assert.equal(prompt.pretends_success, false);
    assert.match(prompt.message, /school email/i);

    assert.ok(source.includes("attemptGuestRestrictedActionUi('request_rental')"));
    assert.ok(source.includes('guestRegistrationPromptForAction'));
    assert.equal(source.includes("api.post"), false);
    assert.equal(source.includes('/api/requests'), false);
    assert.equal(source.includes('Rental request submitted'), false);
  });

  test('guest contract is separate from registered US-10 full listing details', () => {
    assert.equal(
      listingDetailsExperienceForAudience('guest'),
      'guest_basic_details_us02'
    );
    assert.equal(
      listingDetailsExperienceForAudience('verified_student'),
      'registered_full_details_us10'
    );
    assert.equal(listingDetailsExperienceForAudience('admin'), 'admin_redirect');

    const guest = listingDetailsAudienceCapabilities('guest');
    assert.equal(guest.sees_basic_guest_fields_only, true);
    assert.equal(guest.sees_description, true);
    assert.equal(guest.sees_owner_contact, false);
    assert.equal(guest.sees_rental_terms, false);
    assert.equal(guest.can_submit_rental_request, false);
    assert.equal(guest.uses_existing_us10_details, false);
    assert.equal(guest.uses_public_guest_details_api, true);

    const verified = listingDetailsAudienceCapabilities('verified_student');
    assert.equal(verified.uses_existing_us10_details, true);
    assert.equal(verified.sees_owner_contact, true);
    assert.equal(verified.sees_rental_terms, true);
    assert.equal(verified.can_submit_rental_request, true);
    assert.equal(verified.uses_public_guest_details_api, false);

    assert.equal(guestItemDetailsPath(12), '/listings/12');
    assert.equal(buildGuestItemDetailsApiPath(12), '/guest/listings/12');
    assert.deepEqual(buildGetGuestItemDetailsCall(12), {
      method: 'GET',
      path: '/guest/listings/12',
      requiresAuth: false,
    });
    assert.notEqual(buildGuestItemDetailsApiPath(12), '/listings/12');

    // Shared /listings/:id path; audience selection belongs to ListingDetailsRoute.
    assert.ok(appSource.includes('path="listings/:id"'));
    assert.ok(appSource.includes('ListingDetailsRoute'));
    assert.ok(listingDetailSource.includes('listing.owner'));
    assert.ok(listingDetailSource.includes('listing.rental_terms'));
    assert.ok(listingDetailSource.includes("api.post<RentalRequest>('/requests'"));
    assert.equal(source.includes('export default function'), false);
    assert.equal(source.includes('createRoot'), false);
    assert.equal(/const FAKE_/.test(source), false);
    assert.equal(source.includes('Math.random'), false);

    assert.deepEqual(
      [...GUEST_ITEM_DETAILS_LAYOUT_SECTIONS],
      [
        'back_navigation',
        'title',
        'category',
        'availability_status',
        'description',
        'request_rental_cta',
        'registration_prompt',
      ]
    );
    assert.ok(GUEST_ITEM_DETAILS_EXCLUDED_CONTROLS.includes('owner_messaging'));
    assert.ok(GUEST_ITEM_DETAILS_EXCLUDED_CONTROLS.includes('rental_date_picker'));
    assert.ok(
      GUEST_ITEM_DETAILS_WORKFLOW_STEPS.includes('attempt_rental_request')
    );

    assert.equal(GUEST_ITEM_DETAILS_LOADING_LABEL, 'Loading item details...');
    assert.equal(
      GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
      'Unable to load item details.'
    );
    assert.equal(GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE, 'Item not found.');
    assert.equal(guestItemDetailsUiStatus({ loading: true }), 'loading');
    assert.equal(guestItemDetailsUiStatus({ notFound: true }), 'not_found');
    assert.equal(
      guestItemDetailsUiStatus({ error: 'Unable to load item details.' }),
      'error'
    );
    assert.equal(guestItemDetailsUiStatus({ hasDetails: true }), 'ready');
    assert.equal(parseGuestItemDetailsIdParam('12').id, 12);
    assert.equal(parseGuestItemDetailsIdParam('abc').id, null);
    assert.equal(
      parseGuestItemDetailsIdParam('abc').error,
      GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE
    );
  });
});
