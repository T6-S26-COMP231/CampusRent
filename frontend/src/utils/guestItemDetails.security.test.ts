/**
 * US-02.4 — guest item-details owner-contact hiding and unavailable-status rules.
 * Pure helper + source inspection; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  GUEST_ITEM_DETAILS_FIELDS,
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  attemptGuestItemDetailsRentalRequestUi,
  guestItemDetailsAvailabilityDisplayLabel,
  guestItemDetailsContainsHiddenField,
  guestItemDetailsKeysMatchAllowList,
  guestItemDetailsRemainsViewableWhenUnavailable,
  guestItemDetailsUiStatus,
  guestItemDetailsView,
  mapGuestItemDetailsFromApi,
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

describe('US-02.4 guest item-details privacy', () => {
  test('GuestItemDetails uses allow-listed details shape only', () => {
    const details = toGuestItemDetails({
      id: 9,
      title: 'Lab Kit',
      category: 'Lab Equipment',
      description: 'Basic guest-visible description.',
      availability: 'available',
    });

    assert.equal(guestItemDetailsKeysMatchAllowList(details), true);
    assert.deepEqual(Object.keys(details).sort(), [...GUEST_ITEM_DETAILS_FIELDS].sort());
    assert.equal(guestItemDetailsContainsHiddenField(details), false);

    const view = guestItemDetailsView(details);
    assert.equal(view.title, 'Lab Kit');
    assert.equal(view.category, 'Lab Equipment');
    assert.equal(view.description, 'Basic guest-visible description.');
    assert.equal(view.availability, 'available');
    assert.equal(view.availability_display_label, 'Available');
    assert.equal(view.shows_owner_contact, false);
    assert.equal(view.shows_rental_terms, false);
    assert.equal(view.can_submit_rental_request, false);

    const poisoned = {
      ...details,
      description: details.description,
      rental_terms: 'leak terms',
      email: 'leak@mycentennialcollege.ca',
      phone: '416-555-0100',
      owner: { first_name: 'Pat', last_name: 'Owner' },
      owner_id: 4,
      contact_hidden: false,
    } as GuestItemDetails & {
      rental_terms: string;
      email: string;
      phone: string;
      owner: { first_name: string; last_name: string };
      owner_id: number;
      contact_hidden: boolean;
    };
    const cleaned = pickGuestItemDetailsAllowList(poisoned);
    assert.equal(guestItemDetailsKeysMatchAllowList(cleaned), true);
    assert.equal('rental_terms' in cleaned, false);
    assert.equal('email' in cleaned, false);
    assert.equal('owner' in cleaned, false);

    const mapped = mapGuestItemDetailsFromApi({
      listing: {
        id: 11,
        title: 'Mapped Kit',
        category: 'Tools',
        description: 'Mapped description',
        availability: 'unavailable',
        owner: { email: 'owner@mycentennialcollege.ca' },
        rental_terms: 'hidden',
      },
    });
    assert.ok(mapped);
    assert.equal(guestItemDetailsKeysMatchAllowList(mapped), true);
    assert.equal(mapped!.availability, 'unavailable');
    assert.equal('owner' in mapped!, false);

    assert.ok(detailsSource.includes('details?: GuestItemDetailsData'));
    assert.ok(detailsSource.includes('pickGuestItemDetailsAllowList'));
    assert.equal(detailsSource.includes('listing: Listing'), false);
    assert.equal(detailsSource.includes('details.owner'), false);
    assert.equal(detailsSource.includes('rental_terms'), false);
    assert.equal(detailsSource.includes('api.get'), false);
    assert.equal(detailsSource.includes('fetch('), false);
    assert.equal(detailsSource.includes('/api/guest/listings'), false);
  });
});

describe('US-02.4 available / unavailable status display', () => {
  test('available and unavailable remain viewable with truthful status labels', () => {
    const available = guestItemDetailsView(
      toGuestItemDetails({
        id: 1,
        title: 'Available Camera',
        category: 'Electronics',
        description: 'Ready to browse.',
        availability: 'available',
      })
    );
    assert.equal(available.availability, 'available');
    assert.equal(available.availability_display_label, 'Available');
    assert.equal(available.is_unavailable, false);
    assert.equal(available.remains_viewable, true);
    assert.equal(guestItemDetailsAvailabilityDisplayLabel('available'), 'Available');

    const unavailable = guestItemDetailsView(
      toGuestItemDetails({
        id: 2,
        title: 'Unavailable Microscope',
        category: 'Lab Equipment',
        description: 'Still shown while unavailable.',
        availability: 'unavailable',
      })
    );
    assert.equal(unavailable.availability, 'unavailable');
    assert.equal(unavailable.availability_display_label, 'Unavailable');
    assert.equal(unavailable.is_unavailable, true);
    assert.equal(unavailable.description, 'Still shown while unavailable.');
    assert.equal(unavailable.title, 'Unavailable Microscope');
    assert.equal(
      guestItemDetailsRemainsViewableWhenUnavailable('unavailable'),
      true
    );
    assert.notEqual(unavailable.availability_display_label, 'Available');
    assert.equal(
      guestItemDetailsUiStatus({ hasDetails: true, notFound: false }),
      'ready'
    );

    assert.ok(detailsSource.includes('StatusBadge'));
    assert.ok(detailsSource.includes('data-availability={view.availability}'));
    assert.ok(detailsSource.includes('guest-item-details-unavailable-note'));
    assert.ok(detailsSource.includes('availability_display_label'));
    assert.equal(
      detailsSource.includes("availability === 'unavailable' && return null"),
      false
    );
  });
});

describe('US-02.4 rental CTA and registered regression', () => {
  test('Request rental opens registration prompt for available and unavailable items', () => {
    for (const availability of ['available', 'unavailable'] as const) {
      const attempt = attemptGuestItemDetailsRentalRequestUi(availability);
      assert.equal(attempt.success, false);
      assert.equal(attempt.apiCalled, false);
      assert.equal(attempt.blocked_before_api, true);
      assert.equal(attempt.rental_enabled, false);
      assert.equal(attempt.show_registration_prompt, true);
      assert.equal(attempt.listing_availability, availability);
      assert.equal(attempt.prompt.register_path, GUEST_REGISTER_PATH);
      assert.equal(attempt.prompt.sign_in_path, GUEST_SIGN_IN_PATH);
      assert.equal(attempt.prompt.register_path, '/register');
      assert.equal(attempt.prompt.sign_in_path, '/login');
      assert.equal(attempt.prompt.pretends_success, false);
    }

    assert.ok(detailsSource.includes('attemptGuestItemDetailsRentalRequestUi'));
    assert.ok(detailsSource.includes('GuestRegistrationPrompt'));
    assert.ok(detailsSource.includes('action="request_rental"'));
    assert.ok(promptSource.includes('to={prompt.register_path}'));
    assert.ok(promptSource.includes('to={prompt.sign_in_path}'));
    assert.equal(detailsSource.includes('/api/requests'), false);
    assert.equal(detailsSource.includes('api.post'), false);
    assert.equal(detailsSource.includes('Rental request submitted'), false);
  });

  test('US-10 registered details remain unchanged; guest route not opened yet', () => {
    assert.match(
      appSource,
      /path="listings\/:id"[\s\S]*?requireVerifiedStudent/
    );
    assert.equal(appSource.includes('GuestItemDetails'), false);
    assert.ok(listingDetailSource.includes('listing.owner'));
    assert.ok(listingDetailSource.includes('listing.rental_terms'));
    assert.ok(listingDetailSource.includes("api.post<RentalRequest>('/requests'"));
  });
});
