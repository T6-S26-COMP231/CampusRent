/**
 * US-01.3 — limited guest listing preview serialization and query helpers.
 *
 * Public guests may browse/search previews without auth. Responses contain
 * only approved preview fields — never owner/contact/description/rental_terms.
 *
 * Keyword matching reuses US-09 semantics (title + description) for filtering
 * only; description must never appear in the serialized guest payload.
 *
 * Frontend wiring belongs to US-01.5 (#192). Protected-field/restricted-action
 * polish beyond this serializer belongs to US-01.4 (#191).
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
 * Dedicated guest serializer — do not reuse formatListing (leaks owner/contact).
 */
export function toGuestListingPreview(listing: ListingDoc): GuestListingPreview {
  return {
    id: listing._id,
    title: listing.title,
    category: listing.category,
    availability: listing.availability,
    thumbnail_url: guestListingThumbnailUrl(listing),
  };
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
