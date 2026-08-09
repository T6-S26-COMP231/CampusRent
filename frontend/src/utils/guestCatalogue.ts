/**
 * US-01.1 — limited guest catalogue and registration-prompt design.
 *
 * Team6 TAC US-01:
 *   As a Guest User, I can browse and search limited listing previews so that
 *   I can explore CampusRent before registering.
 *
 * Acceptance (later tasks wire these):
 *   1. Browse limited listing previews — no owner contact information
 *   2. Search using a keyword — matching limited previews
 *   3. Apply category filters — filtered limited previews
 *   4. Attempt restricted action — registration / sign-in prompt
 *
 * Notes:
 *   - Guests browse limited listing previews only
 *   - Rental requests require registration
 *   - Search supports keywords and categories
 *
 * Story boundary:
 *   US-01 = limited guest catalogue / search / registration prompts
 *   US-02 = basic guest item details (design in guestItemDetails.ts;
 *           do not implement the guest details page/API in this US-01 module)
 *
 * Existing repository facts (do not invent fields):
 *   Listing model (backend/src/models/Listing.ts):
 *     _id, owner_id, title, category, description, rental_terms,
 *     availability, images[{id,filename}], created_at, updated_at
 *   Registered browse (US-08/US-09, BrowsePage + GET /api/listings):
 *     keyword `q` matches title + description (case-insensitive)
 *     optional `category` from LISTING_CATEGORIES
 *     default availability = available
 *   Registered card (ListingCard) currently also shows description + owner name;
 *   guest previews must stay LIMITED and must never show owner contact.
 *
 * Current access (Iteration 1):
 *   /browse and GET /api/listings require verified student.
 *   US-01 later tasks open a guest catalogue path + public preview API.
 *
 * US-01.2 UI + US-01.4 restricted-action / privacy hardening:
 *   Guest cards accept GuestListingPreview only (never a full Listing).
 *   Restricted actions open the registration prompt before any API call.
 * US-01.5 (#192): GuestCatalogue ↔ GET /api/guest/listings.
 */

/** Same listing categories enforced by backend/src/utils/validation.ts. */
export const GUEST_LISTING_CATEGORIES = [
  'Textbooks',
  'Electronics',
  'Lab Equipment',
  'Sports & Recreation',
  'Tools',
  'Furniture',
  'Clothing',
  'Other',
] as const;

export type GuestListingCategory = (typeof GUEST_LISTING_CATEGORIES)[number];

/**
 * Fields safe to include on a limited guest listing preview.
 * Drawn only from existing Listing / public image URL shapes.
 *
 * Intentionally excludes description (fuller copy belongs with US-02 details)
 * and every owner / contact field.
 */
export const GUEST_PREVIEW_FIELDS = [
  'id',
  'title',
  'category',
  'availability',
  'thumbnail_url',
] as const;

export type GuestPreviewField = (typeof GUEST_PREVIEW_FIELDS)[number];

/**
 * Fields that must never appear on guest catalogue preview payloads/UI.
 * Includes owner contact, identity, private listing content, and secrets.
 */
export const GUEST_HIDDEN_FIELDS = [
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
  'password',
  'password_hash',
  'token',
  'jwt',
  'secret',
] as const;

export type GuestHiddenField = (typeof GUEST_HIDDEN_FIELDS)[number];

/** Limited guest preview row — no fabricated counts or fake listings. */
export interface GuestListingPreview {
  id: number;
  title: string;
  category: GuestListingCategory | string;
  availability: 'available' | 'unavailable';
  /** First listing image URL when present; null when the listing has no images. */
  thumbnail_url: string | null;
}

/**
 * Guest catalogue entry path (later tasks open this for unauthenticated users).
 * Reuses the existing Browse route rather than inventing a second catalogue app.
 */
export const GUEST_CATALOGUE_PATH = '/browse';

/** Existing auth routes reused by the registration prompt — no second auth system. */
export const GUEST_REGISTER_PATH = '/register';
export const GUEST_SIGN_IN_PATH = '/login';

/**
 * US-02 boundary: selecting a preview intends navigation to basic guest details.
 * US-01 must not implement the guest details page/API.
 */
export const GUEST_LISTING_DETAIL_PATH_PREFIX = '/listings';

export const GUEST_CATALOGUE_SECTION_LABEL = 'Browse listings';
export const GUEST_CATALOGUE_HEADING = 'Explore campus listings';
export const GUEST_CATALOGUE_DESCRIPTION =
  'Browse limited listing previews. Register with your school email to request rentals and contact owners.';
export const GUEST_KEYWORD_FILTER_LABEL = 'Search';
export const GUEST_KEYWORD_PLACEHOLDER = 'Search by keyword';
export const GUEST_CATEGORY_FILTER_LABEL = 'Category';
export const GUEST_CATEGORY_ALL_LABEL = 'All categories';
export const GUEST_EMPTY_RESULTS_MESSAGE = 'No listings match your search.';
export const GUEST_LOADING_LABEL = 'Loading guest listings...';
export const GUEST_LOAD_ERROR_FALLBACK = 'Unable to load guest listings.';
export const GUEST_SEARCH_SUBMIT_LABEL = 'Search';
export const GUEST_CREATE_LISTING_CTA_LABEL = 'Create a listing';
export const GUEST_REQUEST_RENTAL_CTA_LABEL = 'Request rental';
export const GUEST_MESSAGE_OWNER_CTA_LABEL = 'Message owner';

/** Registration / sign-in prompt copy for restricted guest actions. */
export const GUEST_REGISTRATION_PROMPT_HEADING = 'Registration required';
export const GUEST_REGISTRATION_PROMPT_MESSAGE =
  'Create a CampusRent account with your school email to continue. Guests can browse limited listing previews only.';
export const GUEST_REGISTER_ACTION_LABEL = 'Register';
export const GUEST_SIGN_IN_ACTION_LABEL = 'Sign In';
export const GUEST_REGISTRATION_PROMPT_DISMISS_LABEL = 'Not now';

/**
 * Actions guests must not perform. Attempting them shows the registration prompt
 * and must never pretend the action succeeded.
 */
export const GUEST_RESTRICTED_ACTIONS = [
  'request_rental',
  'create_listing',
  'start_conversation',
  'send_message',
  'manage_requests',
  'edit_listing',
] as const;

export type GuestRestrictedAction = (typeof GUEST_RESTRICTED_ACTIONS)[number];

export const GUEST_RESTRICTED_ACTION_LABELS: Record<GuestRestrictedAction, string> = {
  request_rental: 'Request rental',
  create_listing: 'Create a listing',
  start_conversation: 'Message owner',
  send_message: 'Send message',
  manage_requests: 'Manage rental requests',
  edit_listing: 'Edit listing',
};

/** Keyword fields used by existing US-09 browse search (title + description). */
export const GUEST_KEYWORD_SEARCH_FIELDS = ['title', 'description'] as const;

export type GuestKeywordSearchField = (typeof GUEST_KEYWORD_SEARCH_FIELDS)[number];

/**
 * Guest catalogue filters — keyword + category only (US-01).
 * Availability defaults to available listings (existing browse default);
 * do not invent a guest availability control beyond that default.
 */
export interface GuestCatalogueFilters {
  q: string | null;
  category: GuestListingCategory | null;
}

/** Public guest preview list response from GET /api/guest/listings. */
export interface GuestListingsResponse {
  listings: GuestListingPreview[];
}

export const GUEST_WORKFLOW_STEPS = [
  'open_guest_catalogue',
  'browse_limited_previews',
  'search_by_keyword',
  'filter_by_category',
  'attempt_restricted_action',
  'display_registration_prompt',
] as const;

export type GuestWorkflowStep = (typeof GUEST_WORKFLOW_STEPS)[number];

export type GuestPreviewSelectionIntent = 'navigate_guest_details_us02';

export function isGuestPreviewField(value: string): value is GuestPreviewField {
  return (GUEST_PREVIEW_FIELDS as readonly string[]).includes(value);
}

export function isGuestHiddenField(value: string): value is GuestHiddenField {
  return (GUEST_HIDDEN_FIELDS as readonly string[]).includes(value);
}

export function isGuestListingCategory(
  value: unknown
): value is GuestListingCategory {
  return (
    typeof value === 'string' &&
    (GUEST_LISTING_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isGuestRestrictedAction(
  value: unknown
): value is GuestRestrictedAction {
  return (
    typeof value === 'string' &&
    (GUEST_RESTRICTED_ACTIONS as readonly string[]).includes(value)
  );
}

export function defaultGuestCatalogueFilters(): GuestCatalogueFilters {
  return {
    q: null,
    category: null,
  };
}

/**
 * Normalize guest keyword input.
 * Blank → null. Does not invent timestamps or local Date conversions.
 */
export function normalizeGuestKeywordInput(raw: unknown): {
  value: string | null;
  error: string;
} {
  if (raw == null || raw === '') {
    return { value: null, error: '' };
  }
  if (typeof raw !== 'string') {
    return { value: null, error: 'Search keyword must be text.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: '' };
  }
  return { value: trimmed, error: '' };
}

/**
 * Normalize category filter.
 * Blank / "all" → null (all categories). Invalid category → error.
 */
export function normalizeGuestCategoryInput(raw: unknown): {
  value: GuestListingCategory | null;
  error: string;
} {
  if (raw == null || raw === '' || raw === 'all') {
    return { value: null, error: '' };
  }
  if (!isGuestListingCategory(raw)) {
    return { value: null, error: 'Invalid category filter.' };
  }
  return { value: raw, error: '' };
}

export function normalizeGuestCatalogueFilters(input: {
  q?: unknown;
  category?: unknown;
}): { filters: GuestCatalogueFilters; error: string } {
  const keyword = normalizeGuestKeywordInput(input.q);
  if (keyword.error) {
    return { filters: defaultGuestCatalogueFilters(), error: keyword.error };
  }
  const category = normalizeGuestCategoryInput(input.category);
  if (category.error) {
    return { filters: defaultGuestCatalogueFilters(), error: category.error };
  }
  return {
    filters: {
      q: keyword.value,
      category: category.value,
    },
    error: '',
  };
}

export function guestCategorySelectOptions(): Array<{
  value: '' | GuestListingCategory;
  label: string;
}> {
  return [
    { value: '', label: GUEST_CATEGORY_ALL_LABEL },
    ...GUEST_LISTING_CATEGORIES.map((value) => ({
      value,
      label: value,
    })),
  ];
}

/** Intended detail path for a preview selection — US-02 owns the page. */
export function guestListingDetailPath(listingId: number): string {
  return `${GUEST_LISTING_DETAIL_PATH_PREFIX}/${listingId}`;
}

/**
 * Selecting a limited preview later navigates toward US-02 guest details.
 * US-01 does not build that page and does not treat preview selection as a
 * restricted rental action.
 */
export function guestPreviewSelectionIntent(): GuestPreviewSelectionIntent {
  return 'navigate_guest_details_us02';
}

export function guestRegistrationPromptForAction(action: GuestRestrictedAction): {
  heading: string;
  message: string;
  action_label: string;
  register_path: string;
  sign_in_path: string;
  register_label: string;
  sign_in_label: string;
  dismiss_label: string;
  restricted_action: GuestRestrictedAction;
  pretends_success: false;
} {
  return {
    heading: GUEST_REGISTRATION_PROMPT_HEADING,
    message: GUEST_REGISTRATION_PROMPT_MESSAGE,
    action_label: GUEST_RESTRICTED_ACTION_LABELS[action],
    register_path: GUEST_REGISTER_PATH,
    sign_in_path: GUEST_SIGN_IN_PATH,
    register_label: GUEST_REGISTER_ACTION_LABEL,
    sign_in_label: GUEST_SIGN_IN_ACTION_LABEL,
    dismiss_label: GUEST_REGISTRATION_PROMPT_DISMISS_LABEL,
    restricted_action: action,
    pretends_success: false,
  };
}

/**
 * Build a limited preview from listing-shaped input using the allow-list only.
 * Extra owner/contact/description fields on the input are ignored, not copied.
 */
export function toGuestListingPreview(listing: {
  id: number;
  title: string;
  category: string;
  availability: 'available' | 'unavailable';
  images?: Array<{ url?: string } | null> | null;
  thumbnail_url?: string | null;
}): GuestListingPreview {
  const fromImages = listing.images?.[0]?.url;
  const thumbnail =
    typeof listing.thumbnail_url === 'string' && listing.thumbnail_url.trim()
      ? listing.thumbnail_url.trim()
      : typeof fromImages === 'string' && fromImages.trim()
        ? fromImages.trim()
        : null;

  return pickGuestListingPreviewAllowList({
    id: listing.id,
    title: listing.title,
    category: listing.category,
    availability: listing.availability,
    thumbnail_url: thumbnail,
  });
}

/** Re-project through the allow-list so extra keys cannot leak into card props. */
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

export function guestPreviewKeysMatchAllowList(value: unknown): boolean {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const allowed = [...GUEST_PREVIEW_FIELDS].sort();
  return (
    keys.length === allowed.length &&
    keys.every((key, index) => key === allowed[index])
  );
}

/** True when an object (or nested plain object) contains a guest-hidden key. */
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
      (GUEST_HIDDEN_FIELDS as readonly string[]).includes(key) ||
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

export function guestPreviewKeys(preview: GuestListingPreview): string[] {
  return Object.keys(preview);
}

/**
 * Audience boundary for catalogue experiences.
 * Verified-student BrowsePage / US-08–10 flows remain unchanged by this design.
 */
export type CatalogueAudience = 'guest' | 'verified_student' | 'admin';

export function catalogueAudienceCapabilities(audience: CatalogueAudience): {
  can_open_guest_catalogue: boolean;
  can_search_keyword: boolean;
  can_filter_category: boolean;
  sees_limited_preview_only: boolean;
  can_request_rental: boolean;
  sees_owner_contact: boolean;
  uses_existing_registered_browse: boolean;
} {
  if (audience === 'guest') {
    return {
      can_open_guest_catalogue: true,
      can_search_keyword: true,
      can_filter_category: true,
      sees_limited_preview_only: true,
      can_request_rental: false,
      sees_owner_contact: false,
      uses_existing_registered_browse: false,
    };
  }
  if (audience === 'verified_student') {
    return {
      can_open_guest_catalogue: false,
      can_search_keyword: true,
      can_filter_category: true,
      sees_limited_preview_only: false,
      can_request_rental: true,
      sees_owner_contact: true,
      uses_existing_registered_browse: true,
    };
  }
  return {
    can_open_guest_catalogue: false,
    can_search_keyword: false,
    can_filter_category: false,
    sees_limited_preview_only: false,
    can_request_rental: false,
    sees_owner_contact: false,
    uses_existing_registered_browse: false,
  };
}

export type GuestCatalogueUiStatus =
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export function guestCatalogueUiStatus(options: {
  loading?: boolean;
  error?: string;
  previewCount?: number;
}): GuestCatalogueUiStatus {
  if (options.loading) return 'loading';
  if (options.error) return 'error';
  if ((options.previewCount ?? 0) <= 0) return 'empty';
  return 'ready';
}

/**
 * Build GET /guest/listings query path.
 * Omits blank q / blank category / "all". Never sends null/undefined params.
 */
export function buildGuestListingsPath(
  filters: GuestCatalogueFilters = defaultGuestCatalogueFilters()
): string {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.category) {
    params.set('category', filters.category);
  }
  const query = params.toString();
  return query ? `/guest/listings?${query}` : '/guest/listings';
}

export function buildGetGuestListingsCall(
  filters: GuestCatalogueFilters = defaultGuestCatalogueFilters()
): { method: 'GET'; path: string; requiresAuth: false } {
  return {
    method: 'GET',
    path: buildGuestListingsPath(filters),
    requiresAuth: false,
  };
}

export function canStartGuestCatalogueRequest(options: {
  loading?: boolean;
}): boolean {
  return !options.loading;
}

/**
 * Map a guest listings API payload through the preview allow-list only.
 * Extra owner/contact/description keys are dropped, never rendered.
 */
export function mapGuestListingsFromApi(value: unknown): GuestListingPreview[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const listings = (value as { listings?: unknown }).listings;
  if (!Array.isArray(listings)) {
    return [];
  }

  const mapped: GuestListingPreview[] = [];
  for (const item of listings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'number' || !Number.isFinite(row.id)) continue;
    if (typeof row.title !== 'string') continue;
    if (typeof row.category !== 'string') continue;
    if (row.availability !== 'available' && row.availability !== 'unavailable') {
      continue;
    }
    const thumbnail =
      row.thumbnail_url == null
        ? null
        : typeof row.thumbnail_url === 'string'
          ? row.thumbnail_url
          : null;
    mapped.push(
      pickGuestListingPreviewAllowList({
        id: row.id,
        title: row.title,
        category: row.category,
        availability: row.availability,
        thumbnail_url: thumbnail,
      })
    );
  }
  return mapped;
}

export type GuestCatalogueFetchResult = {
  called: boolean;
  status: Exclude<GuestCatalogueUiStatus, 'loading'>;
  previews: GuestListingPreview[];
  appliedFilters: GuestCatalogueFilters;
  error: string;
};

/**
 * Guest catalogue load / search flow against GET /api/guest/listings.
 * Backend is the search authority — callers must not filter locally.
 */
export async function runGuestCatalogueFetchFlow(
  fetchListings: (
    filters: GuestCatalogueFilters
  ) => Promise<GuestListingsResponse | unknown>,
  draftFilters: GuestCatalogueFilters = defaultGuestCatalogueFilters(),
  previous: {
    previews: GuestListingPreview[];
    appliedFilters: GuestCatalogueFilters;
  } = {
    previews: [],
    appliedFilters: defaultGuestCatalogueFilters(),
  }
): Promise<GuestCatalogueFetchResult> {
  const normalized = normalizeGuestCatalogueFilters(draftFilters);
  if (normalized.error) {
    return {
      called: false,
      status: 'error',
      previews: previous.previews,
      appliedFilters: previous.appliedFilters,
      error: normalized.error,
    };
  }

  try {
    const response = await fetchListings(normalized.filters);
    const previews = mapGuestListingsFromApi(response);
    return {
      called: true,
      status: previews.length === 0 ? 'empty' : 'ready',
      previews,
      appliedFilters: normalized.filters,
      error: '',
    };
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : GUEST_LOAD_ERROR_FALLBACK;
    return {
      called: true,
      status: 'error',
      // Do not keep or fabricate rows after a failed guest catalogue request.
      previews: [],
      appliedFilters: previous.appliedFilters,
      error: message,
    };
  }
}

/**
 * Restricted-action attempt for guests — block before any API call, then
 * open the registration prompt only. Never marks the action as succeeded.
 */
export function attemptGuestRestrictedActionUi(
  action: GuestRestrictedAction
): {
  prompt: ReturnType<typeof guestRegistrationPromptForAction>;
  success: false;
  apiCalled: false;
  blocked_before_api: true;
  show_registration_prompt: true;
} {
  return {
    prompt: guestRegistrationPromptForAction(action),
    success: false,
    apiCalled: false,
    blocked_before_api: true,
    show_registration_prompt: true,
  };
}

/** True when the action is guest-restricted and must not hit registered APIs. */
export function guestActionRequiresRegistration(
  action: string
): action is GuestRestrictedAction {
  return isGuestRestrictedAction(action);
}

/** Safe display props for a guest preview card (approved fields only). */
export function guestListingCardView(preview: GuestListingPreview): {
  id: number;
  title: string;
  category: string;
  availability: 'available' | 'unavailable';
  thumbnail_url: string | null;
  detail_path: string;
  has_thumbnail: boolean;
} {
  return {
    id: preview.id,
    title: preview.title,
    category: String(preview.category),
    availability: preview.availability,
    thumbnail_url: preview.thumbnail_url,
    detail_path: guestListingDetailPath(preview.id),
    has_thumbnail: Boolean(preview.thumbnail_url && preview.thumbnail_url.trim()),
  };
}
