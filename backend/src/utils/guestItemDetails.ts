/**
 * US-02.3 / US-02.4 — public guest basic item-details serialization.
 *
 * GET /api/guest/listings/:id returns an allow-listed payload only.
 * Never reuses formatListing (owner/contact/rental_terms/images).
 * Description is included (unlike US-01 catalogue previews).
 * Unavailable listings are returned with their real availability status
 * (never 404 / never coerced to available).
 *
 * US-02.4 hardens allow-list + availability enforcement.
 * Frontend wiring belongs to US-02.5 (#200). Registered
 * GET /api/listings/:id remains authenticate + requireVerifiedStudent.
 */

import type { ListingDoc } from '../models/Listing';

/** Approved public guest item-details fields — keep aligned with frontend guestItemDetails. */
export const GUEST_ITEM_DETAILS_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'availability',
] as const;

export type GuestItemDetailsField = (typeof GUEST_ITEM_DETAILS_FIELDS)[number];

export const GUEST_ITEM_DETAILS_AVAILABILITY_VALUES = [
  'available',
  'unavailable',
] as const;

export type GuestItemDetailsAvailability =
  (typeof GUEST_ITEM_DETAILS_AVAILABILITY_VALUES)[number];

/** Fields that must never appear on guest item-details payloads. */
export const GUEST_ITEM_DETAILS_HIDDEN_FIELDS = [
  'owner',
  'owner_id',
  'owner_email',
  'owner_phone',
  'owner_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'rental_terms',
  'contact_hidden',
  'images',
  'thumbnail_url',
  'created_at',
  'updated_at',
  'password',
  'password_hash',
  'token',
  'jwt',
  'secret',
] as const;

export interface GuestItemDetails {
  id: number;
  title: string;
  category: string;
  description: string;
  availability: GuestItemDetailsAvailability;
}

/** Only the existing listing availability enum — never invent other states. */
export function normalizeGuestItemDetailsAvailability(
  value: unknown
): GuestItemDetailsAvailability | null {
  if (value === 'available' || value === 'unavailable') {
    return value;
  }
  return null;
}

/**
 * Construct guest details from the allow-list only. Never spreads formatListing.
 * Availability is normalized to available|unavailable; invalid values are rejected.
 */
export function toGuestItemDetails(
  listing: Pick<
    ListingDoc,
    '_id' | 'title' | 'category' | 'description' | 'availability'
  >
): GuestItemDetails {
  const availability = normalizeGuestItemDetailsAvailability(
    listing.availability
  );
  if (!availability) {
    // Defensive: schema enum should prevent this; never invent "available".
    throw new Error('Invalid listing availability');
  }
  return pickGuestItemDetailsAllowList({
    id: listing._id,
    title: listing.title,
    category: listing.category,
    description: listing.description,
    availability,
  });
}

/** Re-project through the allow-list so extra keys cannot leak. */
export function pickGuestItemDetailsAllowList(
  value: GuestItemDetails
): GuestItemDetails {
  const availability = normalizeGuestItemDetailsAvailability(value.availability);
  return {
    id: value.id,
    title: value.title,
    category: value.category,
    description: value.description,
    // Preserve unavailable; never silently promote unknown values to available.
    availability: availability ?? 'unavailable',
  };
}

/** Unavailable listings remain viewable as guest basic details (US-02 Test 4). */
export function guestItemDetailsRemainsViewableWhenUnavailable(
  availability: GuestItemDetailsAvailability
): boolean {
  return availability === 'available' || availability === 'unavailable';
}

/** True when an object’s own keys are exactly the approved guest details fields. */
export function guestItemDetailsKeysMatchAllowList(value: unknown): boolean {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const allowed = [...GUEST_ITEM_DETAILS_FIELDS].sort();
  return (
    keys.length === allowed.length &&
    keys.every((key, index) => key === allowed[index])
  );
}

export function guestItemDetailsContainsHiddenField(
  value: unknown,
  seen = new Set<unknown>()
): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => guestItemDetailsContainsHiddenField(item, seen));
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      (GUEST_ITEM_DETAILS_HIDDEN_FIELDS as readonly string[]).includes(key) ||
      /password|token|secret|email|phone|owner/i.test(key)
    ) {
      return true;
    }
    if (guestItemDetailsContainsHiddenField(child, seen)) {
      return true;
    }
  }
  return false;
}
