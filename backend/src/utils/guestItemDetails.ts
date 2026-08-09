/**
 * US-02.3 — public guest basic item-details serialization.
 *
 * GET /api/guest/listings/:id returns an allow-listed payload only.
 * Never reuses formatListing (owner/contact/rental_terms/images).
 * Description is included (unlike US-01 catalogue previews).
 * Unavailable listings are returned with their real availability status.
 *
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
  availability: 'available' | 'unavailable';
}

/** Construct guest details from the allow-list only. Never spreads formatListing. */
export function toGuestItemDetails(
  listing: Pick<
    ListingDoc,
    '_id' | 'title' | 'category' | 'description' | 'availability'
  >
): GuestItemDetails {
  return pickGuestItemDetailsAllowList({
    id: listing._id,
    title: listing.title,
    category: listing.category,
    description: listing.description,
    availability: listing.availability,
  });
}

/** Re-project through the allow-list so extra keys cannot leak. */
export function pickGuestItemDetailsAllowList(
  value: GuestItemDetails
): GuestItemDetails {
  return {
    id: value.id,
    title: value.title,
    category: value.category,
    description: value.description,
    availability: value.availability,
  };
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
