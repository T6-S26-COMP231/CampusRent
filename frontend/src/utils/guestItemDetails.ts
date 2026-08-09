/**
 * US-02.1 — guest basic item-details layout / data-contract design.
 *
 * Team6 TAC US-02:
 *   As a Guest User, I can view basic item information so that I can determine
 *   whether an item is relevant to my needs.
 *
 * Acceptance (later tasks wire these):
 *   1. Open item details page → basic item information displayed
 *   2. View listing as guest → owner contact information hidden
 *   3. Attempt rental request → registration prompt displayed
 *   4. View unavailable item → availability status displayed
 *
 * Story boundary:
 *   US-01 = limited guest catalogue / search / registration prompts
 *   US-02 = basic guest item details (this design; UI #197, API #198)
 *   US-10 = verified-student full listing details (unchanged)
 *
 * Existing repository facts (do not invent fields):
 *   Listing model: _id, owner_id, title, category, description, rental_terms,
 *     availability, images[{id,filename}], created_at, updated_at
 *   Registered details (US-10, ListingDetailPage + GET /api/listings/:id):
 *     full Listing via formatListing — includes description, rental_terms,
 *     owner {id, first_name, last_name, email, phone}, images, contact_hidden
 *   US-01 guest catalogue cards already navigate toward /listings/:id
 *   GET /api/listings/:id remains authenticate + requireVerifiedStudent
 *
 * Current access:
 *   /listings/:id is behind ProtectedRoute requireVerifiedStudent.
 *   Later US-02 tasks open guest basic details on that path without making
 *   the registered full-details API public. #198 owns GET /api/guest/listings/:id.
 *
 * This file is DESIGN / CONTRACT only:
 *   - no guest details page component (#197)
 *   - no guest details API (#198)
 *   - no App routing change / API wiring (#197/#200)
 */

import {
  GUEST_CATALOGUE_PATH,
  GUEST_LISTING_DETAIL_PATH_PREFIX,
  GUEST_REGISTER_ACTION_LABEL,
  GUEST_REGISTER_PATH,
  GUEST_REGISTRATION_PROMPT_DISMISS_LABEL,
  GUEST_REGISTRATION_PROMPT_HEADING,
  GUEST_REQUEST_RENTAL_CTA_LABEL,
  GUEST_RESTRICTED_ACTION_LABELS,
  GUEST_SIGN_IN_ACTION_LABEL,
  GUEST_SIGN_IN_PATH,
  attemptGuestRestrictedActionUi,
  guestListingDetailPath,
  guestRegistrationPromptForAction,
  type GuestListingCategory,
  type GuestRestrictedAction,
} from './guestCatalogue';

/**
 * Fields safe on the dedicated guest item-details contract.
 * Story-required: title, category, description, availability.
 * `id` is included for routing / keying only.
 */
export const GUEST_ITEM_DETAILS_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'availability',
] as const;

export type GuestItemDetailsField = (typeof GUEST_ITEM_DETAILS_FIELDS)[number];

/**
 * Fields that must never appear on guest item-details payloads/UI.
 * Description is approved here (unlike US-01 catalogue previews).
 * rental_terms and all owner/contact fields stay hidden.
 */
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

export type GuestItemDetailsHiddenField =
  (typeof GUEST_ITEM_DETAILS_HIDDEN_FIELDS)[number];

/** Dedicated guest details shape — never a full authenticated Listing. */
export interface GuestItemDetails {
  id: number;
  title: string;
  category: GuestListingCategory | string;
  description: string;
  availability: 'available' | 'unavailable';
}

/** Intended future public guest details response (#198). */
export interface GuestItemDetailsResponse {
  listing: GuestItemDetails;
}

/** Reuse US-01 catalogue path + shared /listings/:id prefix. */
export const GUEST_ITEM_DETAILS_PATH_PREFIX = GUEST_LISTING_DETAIL_PATH_PREFIX;
export const GUEST_ITEM_DETAILS_BACK_PATH = GUEST_CATALOGUE_PATH;

export const GUEST_ITEM_DETAILS_SECTION_LABEL = 'Item details';
export const GUEST_ITEM_DETAILS_HEADING_FALLBACK = 'Listing details';
export const GUEST_ITEM_DETAILS_BACK_LABEL = 'Back to listings';
export const GUEST_ITEM_DETAILS_DESCRIPTION_LABEL = 'Description';
export const GUEST_ITEM_DETAILS_AVAILABILITY_LABEL = 'Availability';
export const GUEST_ITEM_DETAILS_CATEGORY_LABEL = 'Category';
export const GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL =
  GUEST_REQUEST_RENTAL_CTA_LABEL;

export const GUEST_ITEM_DETAILS_LOADING_LABEL = 'Loading item details...';
export const GUEST_ITEM_DETAILS_LOAD_ERROR_FALLBACK =
  'Unable to load item details.';
export const GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE = 'Item not found.';

/**
 * Future public guest details path design (#198).
 * Must stay separate from registered GET /api/listings/:id.
 */
export const GUEST_ITEM_DETAILS_API_PATH_PREFIX = '/guest/listings';

export const GUEST_ITEM_DETAILS_WORKFLOW_STEPS = [
  'open_guest_item_details',
  'view_basic_item_information',
  'confirm_owner_contact_hidden',
  'view_availability_status',
  'attempt_rental_request',
  'display_registration_prompt',
] as const;

export type GuestItemDetailsWorkflowStep =
  (typeof GUEST_ITEM_DETAILS_WORKFLOW_STEPS)[number];

/**
 * Shared route /listings/:id audience experiences.
 * Design only — App.tsx branching belongs to later UI/routing tasks.
 */
export type ListingDetailsAudience = 'guest' | 'verified_student' | 'admin';

export type ListingDetailsExperience =
  | 'guest_basic_details_us02'
  | 'registered_full_details_us10'
  | 'admin_redirect';

export function isGuestItemDetailsField(
  value: string
): value is GuestItemDetailsField {
  return (GUEST_ITEM_DETAILS_FIELDS as readonly string[]).includes(value);
}

export function isGuestItemDetailsHiddenField(
  value: string
): value is GuestItemDetailsHiddenField {
  return (GUEST_ITEM_DETAILS_HIDDEN_FIELDS as readonly string[]).includes(value);
}

/** Same path US-01 preview cards already target. */
export function guestItemDetailsPath(listingId: number): string {
  return guestListingDetailPath(listingId);
}

/**
 * Intended GET path for the future public guest details endpoint (#198).
 * Does not implement the endpoint and must not point at /listings/:id.
 */
export function buildGuestItemDetailsApiPath(listingId: number): string {
  return `${GUEST_ITEM_DETAILS_API_PATH_PREFIX}/${listingId}`;
}

export function buildGetGuestItemDetailsCall(listingId: number): {
  method: 'GET';
  path: string;
  requiresAuth: false;
} {
  return {
    method: 'GET',
    path: buildGuestItemDetailsApiPath(listingId),
    requiresAuth: false,
  };
}

export function listingDetailsExperienceForAudience(
  audience: ListingDetailsAudience
): ListingDetailsExperience {
  if (audience === 'guest') return 'guest_basic_details_us02';
  if (audience === 'verified_student') return 'registered_full_details_us10';
  return 'admin_redirect';
}

export function listingDetailsAudienceCapabilities(
  audience: ListingDetailsAudience
): {
  can_open_guest_basic_details: boolean;
  sees_basic_guest_fields_only: boolean;
  sees_description: boolean;
  sees_owner_contact: boolean;
  sees_rental_terms: boolean;
  can_submit_rental_request: boolean;
  uses_existing_us10_details: boolean;
  uses_public_guest_details_api: boolean;
} {
  if (audience === 'guest') {
    return {
      can_open_guest_basic_details: true,
      sees_basic_guest_fields_only: true,
      sees_description: true,
      sees_owner_contact: false,
      sees_rental_terms: false,
      can_submit_rental_request: false,
      uses_existing_us10_details: false,
      uses_public_guest_details_api: true,
    };
  }
  if (audience === 'verified_student') {
    return {
      can_open_guest_basic_details: false,
      sees_basic_guest_fields_only: false,
      sees_description: true,
      sees_owner_contact: true,
      sees_rental_terms: true,
      can_submit_rental_request: true,
      uses_existing_us10_details: true,
      uses_public_guest_details_api: false,
    };
  }
  return {
    can_open_guest_basic_details: false,
    sees_basic_guest_fields_only: false,
    sees_description: false,
    sees_owner_contact: false,
    sees_rental_terms: false,
    can_submit_rental_request: false,
    uses_existing_us10_details: false,
    uses_public_guest_details_api: false,
  };
}

/**
 * Parse a route id param for later guest details loading.
 * Invalid ids are not found — never invent a listing.
 */
export function parseGuestItemDetailsIdParam(raw: unknown): {
  id: number | null;
  error: string;
} {
  if (raw == null || raw === '') {
    return { id: null, error: GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE };
  }
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value) || value <= 0) {
    return { id: null, error: GUEST_ITEM_DETAILS_NOT_FOUND_MESSAGE };
  }
  return { id: value, error: '' };
}

/**
 * Construct guest details from the allow-list only.
 * Extra owner/contact/rental_terms/image fields on the input are ignored.
 */
export function toGuestItemDetails(listing: {
  id: number;
  title: string;
  category: string;
  description: string;
  availability: 'available' | 'unavailable';
}): GuestItemDetails {
  return pickGuestItemDetailsAllowList({
    id: listing.id,
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

export function guestItemDetailsKeys(details: GuestItemDetails): string[] {
  return Object.keys(details);
}

/** True when an object (or nested plain object) contains a guest-details-hidden key. */
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

export function guestItemDetailsAvailabilityLabel(
  availability: GuestItemDetails['availability']
): string {
  return availability === 'available' ? 'available' : 'unavailable';
}

/**
 * Safe display props for the future guest details page.
 * Shows real availability for both available and unavailable items.
 */
export function guestItemDetailsView(details: GuestItemDetails): {
  id: number;
  title: string;
  category: string;
  description: string;
  availability: 'available' | 'unavailable';
  availability_label: string;
  back_path: string;
  back_label: string;
  request_rental_label: string;
  shows_owner_contact: false;
  shows_rental_terms: false;
  shows_edit_controls: false;
  shows_messaging: false;
  shows_reviews: false;
  shows_rental_dates: false;
} {
  const safe = pickGuestItemDetailsAllowList(details);
  return {
    id: safe.id,
    title: safe.title,
    category: String(safe.category),
    description: safe.description,
    availability: safe.availability,
    availability_label: guestItemDetailsAvailabilityLabel(safe.availability),
    back_path: GUEST_ITEM_DETAILS_BACK_PATH,
    back_label: GUEST_ITEM_DETAILS_BACK_LABEL,
    request_rental_label: GUEST_ITEM_DETAILS_REQUEST_RENTAL_CTA_LABEL,
    shows_owner_contact: false,
    shows_rental_terms: false,
    shows_edit_controls: false,
    shows_messaging: false,
    shows_reviews: false,
    shows_rental_dates: false,
  };
}

export type GuestItemDetailsUiStatus =
  | 'loading'
  | 'error'
  | 'not_found'
  | 'ready';

export function guestItemDetailsUiStatus(options: {
  loading?: boolean;
  error?: string;
  notFound?: boolean;
  hasDetails?: boolean;
}): GuestItemDetailsUiStatus {
  if (options.loading) return 'loading';
  if (options.notFound) return 'not_found';
  if (options.error) return 'error';
  if (!options.hasDetails) return 'not_found';
  return 'ready';
}

/**
 * Guest Request Rental on item details — reuse US-01 prompt contracts.
 * Blocks before any rental API call and never claims success.
 */
export function attemptGuestItemDetailsRentalRequestUi(): {
  prompt: ReturnType<typeof guestRegistrationPromptForAction>;
  success: false;
  apiCalled: false;
  blocked_before_api: true;
  show_registration_prompt: true;
  restricted_action: 'request_rental';
  register_path: typeof GUEST_REGISTER_PATH;
  sign_in_path: typeof GUEST_SIGN_IN_PATH;
} {
  const attempt = attemptGuestRestrictedActionUi('request_rental');
  return {
    ...attempt,
    restricted_action: 'request_rental',
    register_path: GUEST_REGISTER_PATH,
    sign_in_path: GUEST_SIGN_IN_PATH,
  };
}

/** Prompt copy for the guest details rental CTA — same US-01 prompt system. */
export function guestItemDetailsRegistrationPrompt(): ReturnType<
  typeof guestRegistrationPromptForAction
> {
  return guestRegistrationPromptForAction('request_rental');
}

export function guestItemDetailsRestrictedAction(): GuestRestrictedAction {
  return 'request_rental';
}

/** Layout sections planned for #197 — no fabricated listing content. */
export const GUEST_ITEM_DETAILS_LAYOUT_SECTIONS = [
  'back_navigation',
  'title',
  'category',
  'availability_status',
  'description',
  'request_rental_cta',
  'registration_prompt',
] as const;

export type GuestItemDetailsLayoutSection =
  (typeof GUEST_ITEM_DETAILS_LAYOUT_SECTIONS)[number];

/** Controls intentionally omitted from the guest details layout. */
export const GUEST_ITEM_DETAILS_EXCLUDED_CONTROLS = [
  'edit_listing',
  'delete_listing',
  'owner_messaging',
  'owner_profile',
  'review_submission',
  'rental_date_picker',
  'admin_controls',
] as const;

export {
  GUEST_REGISTER_PATH,
  GUEST_SIGN_IN_PATH,
  GUEST_REGISTER_ACTION_LABEL,
  GUEST_SIGN_IN_ACTION_LABEL,
  GUEST_REGISTRATION_PROMPT_HEADING,
  GUEST_REGISTRATION_PROMPT_DISMISS_LABEL,
  GUEST_RESTRICTED_ACTION_LABELS,
};
