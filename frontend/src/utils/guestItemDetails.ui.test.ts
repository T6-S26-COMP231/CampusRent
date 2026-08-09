/**
 * US-02.2 — guest basic item-details UI presentation / registration prompt.
 * Pure helper + source inspection; no React DOM framework.
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
  GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestItemDetailsRentalRequestUi,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsUiStatus,
  guestItemDetailsView,
  pickGuestItemDetailsAllowList,
  toGuestItemDetails,
  type GuestItemDetails,
} from './guestItemDetails';

const here = dirname(fileURLToPath(import.meta.url));
const detailsSource = readFileSync(
  join(here, '../components/GuestItemDetails.tsx'),
  'utf8'
);
const promptSource = readFileSync(
  join(here, '../components/GuestRegistrationPrompt.tsx'),
  'utf8'
);
const appSource = readFileSync(join(here, '../App.tsx'), 'utf8');
const listingDetailSource = readFileSync(
  join(here, '../pages/ListingDetailPage.tsx'),
  'utf8'
);

function sampleDetails(
  overrides: Partial<GuestItemDetails> = {}
): GuestItemDetails {
  return toGuestItemDetails({
    id: 12,
    title: 'Campus Camera',
    category: 'Electronics',
    description: 'DSL kit for student media projects.',
    availability: 'available',
    ...overrides,
  });
}

describe('US-02.2 guest item-details basic presentation', () => {
  test('title, category, description, and availability are displayed from narrow contract', () => {
    const details = sampleDetails();
    const view = guestItemDetailsView(details);

    assert.equal(view.title, 'Campus Camera');
    assert.equal(view.category, 'Electronics');
    assert.equal(view.description, 'DSL kit for student media projects.');
    assert.equal(view.availability, 'available');
    assert.equal(view.availability_label, 'available');
    assert.deepEqual(Object.keys(details).sort(), [...GUEST_ITEM_DETAILS_FIELDS].sort());
    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);

    assert.ok(detailsSource.includes('preview: GuestListingPreview') === false);
    assert.ok(detailsSource.includes('details?: GuestItemDetailsData'));
    assert.ok(detailsSource.includes('pickGuestItemDetailsAllowList'));
    assert.ok(detailsSource.includes('guest-item-details-title'));
    assert.ok(detailsSource.includes('guest-item-details-category'));
    assert.ok(detailsSource.includes('guest-item-details-description'));
    assert.ok(detailsSource.includes('guest-item-details-availability'));
    assert.ok(detailsSource.includes('{view.title}'));
    assert.ok(detailsSource.includes('{view.category}'));
    assert.ok(detailsSource.includes('{view.description}'));
    assert.ok(detailsSource.includes('StatusBadge'));
    assert.ok(detailsSource.includes('status={view.availability}'));
  });

  test('available and unavailable statuses are shown without hiding basic details', () => {
    const available = guestItemDetailsView(sampleDetails({ availability: 'available' }));
    assert.equal(available.availability, 'available');
    assert.equal(available.availability_label, 'available');
    assert.ok(available.description.length > 0);
    assert.ok(available.title.length > 0);

    const unavailable = guestItemDetailsView(
      sampleDetails({
        title: 'Lab Microscope',
        description: 'Currently checked out for the term.',
        availability: 'unavailable',
      })
    );
    assert.equal(unavailable.availability, 'unavailable');
    assert.equal(unavailable.availability_label, 'unavailable');
    assert.notEqual(unavailable.availability_label, 'available');
    assert.equal(unavailable.title, 'Lab Microscope');
    assert.equal(unavailable.description, 'Currently checked out for the term.');

    // Unavailable items are still rendered in the ready branch — not redirected away.
    assert.ok(detailsSource.includes("status === 'ready'") === false);
    assert.ok(detailsSource.includes('pickGuestItemDetailsAllowList(details)'));
    assert.equal(detailsSource.includes("availability === 'unavailable' && return null"), false);
    assert.equal(detailsSource.includes('pretend'), false);
  });
});

describe('US-02.2 guest item-details privacy and rental prompt', () => {
  test('owner/contact and rental_terms cannot render through the guest details UI', () => {
    const poisoned = {
      ...sampleDetails(),
      owner: {
        first_name: 'Pat',
        last_name: 'Owner',
        email: 'owner@mycentennialcollege.ca',
        phone: '416-555-0100',
      },
      owner_id: 4,
      rental_terms: 'Cash only',
      contact_hidden: false,
      email: 'leak@mycentennialcollege.ca',
      phone: '416-555-9999',
    } as GuestItemDetails & {
      owner: {
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
      };
      owner_id: number;
      rental_terms: string;
      contact_hidden: boolean;
      email: string;
      phone: string;
    };

    const cleaned = pickGuestItemDetailsAllowList(poisoned);
    assert.equal(guestItemDetailsKeysMatchAllowList(cleaned), true);
    assert.equal(guestItemDetailsContainsHiddenField(cleaned), false);
    assert.equal('owner' in cleaned, false);
    assert.equal('owner_id' in cleaned, false);
    assert.equal('email' in cleaned, false);
    assert.equal('phone' in cleaned, false);
    assert.equal('rental_terms' in cleaned, false);
    assert.equal('contact_hidden' in cleaned, false);

    const view = guestItemDetailsView(cleaned);
    assert.equal('owner' in view, false);
    assert.equal('email' in view, false);
    assert.equal('phone' in view, false);
    assert.equal('rental_terms' in view, false);
    assert.equal(view.shows_owner_contact, false);
    assert.equal(view.shows_rental_terms, false);

    assert.equal(detailsSource.includes('listing: Listing'), false);
    assert.equal(detailsSource.includes('details.owner'), false);
    assert.equal(detailsSource.includes('details.email'), false);
    assert.equal(detailsSource.includes('details.phone'), false);
    assert.equal(detailsSource.includes('rental_terms'), false);
    assert.equal(detailsSource.includes('contact_hidden'), false);
    assert.equal(detailsSource.includes('first_name'), false);
    assert.equal(detailsSource.includes('thumbnail'), false);
    assert.equal(detailsSource.includes('images'), false);
  });

  test('Request rental opens GuestRegistrationPrompt before any rental API call', () => {
    assert.equal(GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL, 'Request rental');

    const attempt = attemptGuestItemDetailsRentalRequestUi();
    assert.equal(attempt.success, false);
    assert.equal(attempt.apiCalled, false);
    assert.equal(attempt.blocked_before_api, true);
    assert.equal(attempt.show_registration_prompt, true);
    assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
    assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
    assert.equal(attempt.prompt.register_path, '/register');
    assert.equal(attempt.prompt.sign_in_path, '/login');
    assert.equal(attempt.prompt.pretends_success, false);

    assert.ok(detailsSource.includes('guest-item-details-request-rental'));
    assert.ok(detailsSource.includes('attemptGuestItemDetailsRentalRequestUi'));
    assert.ok(detailsSource.includes('GuestRegistrationPrompt'));
    assert.ok(detailsSource.includes('action="request_rental"'));
    assert.ok(promptSource.includes('to={prompt.register_path}'));
    assert.ok(promptSource.includes('to={prompt.sign_in_path}'));
    assert.equal(detailsSource.includes('/api/requests'), false);
    assert.equal(detailsSource.includes('api.post'), false);
    assert.equal(detailsSource.includes('api.get'), false);
    assert.equal(detailsSource.includes('fetch('), false);
    assert.equal(detailsSource.includes('Rental request submitted'), false);
    assert.equal(detailsSource.includes('pretends_success: true'), false);
  });
});

describe('US-02.2 guest item-details states and boundaries', () => {
  test('loading, error, and not-found presentation copy are wired', () => {
    assert.equal(GUEST_ITEM_DETAILS_LOADING_LABEL, 'Loading item details...');
    assert.equal(
      GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK,
      'Unable to load item details.'
    );
    assert.equal(GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE, 'Item not found.');
    assert.equal(guestItemDetailsUiStatus({ loading: true }), 'loading');
    assert.equal(
      guestItemDetailsUiStatus({ error: 'Unable to load item details.' }),
      'error'
    );
    assert.equal(guestItemDetailsUiStatus({ notFound: true }), 'not_found');
    assert.equal(guestItemDetailsUiStatus({ hasDetails: true }), 'ready');

    assert.ok(detailsSource.includes('GUEST_ITEM_DETAILS_LOADING_LABEL'));
    assert.ok(detailsSource.includes('guest-item-details-loading'));
    assert.ok(detailsSource.includes('guest-item-details-error'));
    assert.ok(detailsSource.includes('guest-item-details-not-found'));
    assert.ok(detailsSource.includes('GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE'));
    assert.ok(detailsSource.includes('guest-item-details-back'));
    assert.ok(detailsSource.includes("to={view.back_path}"));
  });

  test('no API integration, route remains protected, US-10 details unchanged', () => {
    assert.equal(detailsSource.includes('/api/guest/listings'), false);
    assert.equal(detailsSource.includes('getGuestItemDetails'), false);
    assert.equal(detailsSource.includes('buildGuestItemDetailsApiPath'), false);
    assert.equal(detailsSource.includes('Math.random'), false);
    assert.equal(detailsSource.includes('FAKE_'), false);

    assert.match(
      appSource,
      /path="listings\/:id"[\s\S]*?requireVerifiedStudent/
    );
    assert.equal(appSource.includes('GuestItemDetails'), false);

    assert.ok(listingDetailSource.includes('listing.owner'));
    assert.ok(listingDetailSource.includes('listing.rental_terms'));
    assert.ok(listingDetailSource.includes("api.post<RentalRequest>('/requests'"));
    assert.ok(listingDetailSource.includes('StartConversationButton'));
    assert.ok(listingDetailSource.includes('ListingReviews'));
  });
});
