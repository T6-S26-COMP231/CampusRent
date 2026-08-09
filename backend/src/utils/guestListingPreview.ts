/**
 * US-01.3 / US-01.4 — limited guest listing preview serialization and query helpers.
 *
 * Public guests may browse/search previews without auth. Responses are built
 * with an allow-list of approved preview fields — never by stripping fields
 * from formatListing (which includes owner/contact/description).
 *
 * Keyword matching reuses US-09 semantics (title + description) for filtering
 * only; description must never appear in the serialized guest payload and
 * search must not reveal matching description snippets.
 *
 * US-01.4 hardens allow-list enforcement and documents that registered
 * listing/rental/messaging/profile APIs remain behind auth middleware.
 * Frontend wiring belongs to US-01.5 (#192). US-02 owns guest item details.
 */

import type { ListingDoc } from '../models/Listing';
import { isValidCategory } from './validation';

/** Approved public guest preview fields — keep aligned with frontend guestCatalogue. */
export const GUEST_LISTING_PREVIEW_FIELDS = [
  'id',
  'title',
  'category',
  'availability',
  'thumbnail_url',
] as const;

export type GuestListingPreviewField =
  (typeof GUEST_LISTING_PREVIEW_FIELDS)[number];

/** Fields that must never appear on guest preview payloads. */
export const GUEST_LISTING_HIDDEN_FIELDS = [
  'owner',
  'owner_id',
  'owner_email',
  'owner_phone',
  'owner_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'description',
  'rental_terms',
  'contact_hidden',
  'images',
  'created_at',
  'updated_at',
  'password',
  'password_hash',
  'token',
  'jwt',
  'secret',
] as const;

export interface GuestListingPreview {
  id: number;
  title: string;
  category: string;
  availability: 'available' | 'unavailable';
  thumbnail_url: string | null;
}

/** First listing image URL using the same /uploads/<filename> convention as formatListing. */
export function guestListingThumbnailUrl(
  listing: Pick<ListingDoc, 'images'>
): string | null {
  const first = listing.images?.[0];
  if (!first?.filename) return null;
  return `/uploads/${first.filename}`;
}

/**
 * Construct a guest preview from the allow-list only.
 * Never spreads a ListingDoc / formatListing result.
 */
export function toGuestListingPreview(listing: ListingDoc): GuestListingPreview {
  return pickGuestListingPreviewAllowList({
    id: listing._id,
    title: listing.title,
    category: listing.category,
    availability: listing.availability,
    thumbnail_url: guestListingThumbnailUrl(listing),
  });
}

/** Re-project through the allow-list so extra keys cannot leak. */
export function pickGuestListingPreviewAllowList(
  value: GuestListingPreview
): GuestListingPreview {
  return {
    id: value.id,
    title: value.title,
    category: value.category,
    availability: value.availability,
    thumbnail_url: value.thumbnail_url,
  };
}

/** True when an object’s own keys are exactly the approved guest preview fields. */
export function guestPreviewKeysMatchAllowList(value: unknown): boolean {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const allowed = [...GUEST_LISTING_PREVIEW_FIELDS].sort();
  return (
    keys.length === allowed.length &&
    keys.every((key, index) => key === allowed[index])
  );
}

export function buildGuestListingFilter(query: {
  q?: unknown;
  category?: unknown;
}): { filter: Record<string, unknown>; error: string } {
  const filter: Record<string, unknown> = {};

  if (query.q != null && query.q !== '') {
    if (typeof query.q !== 'string') {
      return { filter: {}, error: 'Search keyword must be text.' };
    }
    const term = query.q.trim();
    if (term) {
      // Same title + description match as GET /api/listings (US-09).
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
      ];
    }
  }

  if (query.category != null && query.category !== '' && query.category !== 'all') {
    if (typeof query.category !== 'string') {
      return { filter: {}, error: 'Invalid category filter' };
    }
    if (!isValidCategory(query.category)) {
      return { filter: {}, error: 'Invalid category filter' };
    }
    filter.category = query.category;
  }

  return { filter, error: '' };
}

export function guestPreviewContainsHiddenField(
  value: unknown,
  seen = new Set<unknown>()
): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => guestPreviewContainsHiddenField(item, seen));
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      (GUEST_LISTING_HIDDEN_FIELDS as readonly string[]).includes(key) ||
      /password|token|secret|email|phone|owner/i.test(key)
    ) {
      return true;
    }
    if (guestPreviewContainsHiddenField(child, seen)) {
      return true;
    }
  }
  return false;
}
