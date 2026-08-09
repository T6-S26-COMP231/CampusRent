import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Filter, LoaderCircle, Package, Search } from 'lucide-react';
import { api } from '../api/client';
import {
  GUEST_CATALOGUE_DESCRIPTION,
  GUEST_CATALOGUE_HEADING,
  GUEST_CATALOGUE_SECTION_LABEL,
  GUEST_CATEGORY_FILTER_LABEL,
  GUEST_CREATE_LISTING_CTA_LABEL,
  GUEST_EMPTY_RESULTS_MESSAGE,
  GUEST_KEYWORD_FILTER_LABEL,
  GUEST_KEYWORD_PLACEHOLDER,
  GUEST_LOAD_ERROR_FALLBACK,
  GUEST_LOADING_LABEL,
  GUEST_SEARCH_SUBMIT_LABEL,
  attemptGuestRestrictedActionUi,
  canStartGuestCatalogueRequest,
  defaultGuestCatalogueFilters,
  guestCatalogueUiStatus,
  guestCategorySelectOptions,
  mapGuestListingsFromApi,
  normalizeGuestCatalogueFilters,
  type GuestCatalogueFilters,
  type GuestListingPreview,
  type GuestListingsResponse,
  type GuestRestrictedAction,
} from '../utils/guestCatalogue';
import GuestListingCard from './GuestListingCard';
import GuestRegistrationPrompt from './GuestRegistrationPrompt';

export interface GuestCatalogueProps {
  /** Optional inject for tests — defaults to api.getGuestListings. */
  fetchGuestListings?: (
    filters: GuestCatalogueFilters
  ) => Promise<GuestListingsResponse>;
  /** Skip initial auto-load (tests). */
  autoLoad?: boolean;
}

/**
 * US-01.5 — guest catalogue wired to GET /api/guest/listings.
 * Restricted CTAs still open the registration prompt before any registered API.
 */
export default function GuestCatalogue({
  fetchGuestListings = (filters) => api.getGuestListings(filters),
  autoLoad = true,
}: GuestCatalogueProps) {
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<GuestCatalogueFilters>(
    defaultGuestCatalogueFilters()
  );
  const [previews, setPreviews] = useState<GuestListingPreview[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [promptAction, setPromptAction] = useState<GuestRestrictedAction | null>(
    null
  );

  const fetchGuestListingsRef = useRef(fetchGuestListings);
  fetchGuestListingsRef.current = fetchGuestListings;

  const status = guestCatalogueUiStatus({
    loading,
    error: error || filterError,
    previewCount: previews.length,
  });
  const categoryOptions = useMemo(() => guestCategorySelectOptions(), []);
  const busy = !canStartGuestCatalogueRequest({ loading });

  const loadPreviews = useCallback(async (filters: GuestCatalogueFilters) => {
    const normalized = normalizeGuestCatalogueFilters(filters);
    if (normalized.error) {
      setFilterError(normalized.error);
      return;
    }

    setLoading(true);
    setError('');
    setFilterError('');
    try {
      const response = await fetchGuestListingsRef.current(normalized.filters);
      // Allow-list only — never expand into owner/description/rental_terms.
      setPreviews(mapGuestListingsFromApi(response));
      setAppliedFilters(normalized.filters);
    } catch (err) {
      setPreviews([]);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : GUEST_LOAD_ERROR_FALLBACK
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) return;
    void loadPreviews(defaultGuestCatalogueFilters());
    // Initial unfiltered guest catalogue only — Search calls loadPreviews explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const { filters, error: normalizeError } = normalizeGuestCatalogueFilters({
      q: draftKeyword,
      category: draftCategory,
    });
    if (normalizeError) {
      setFilterError(normalizeError);
      return;
    }

    // Do not claim applied filters / results until the server responds.
    setFilterError('');
    void loadPreviews(filters);
  };

  const handleRestrictedAction = (action: GuestRestrictedAction) => {
    // Block before any registered API call — prompt only.
    const result = attemptGuestRestrictedActionUi(action);
    if (
      result.blocked_before_api &&
      !result.apiCalled &&
      !result.success &&
      result.show_registration_prompt
    ) {
      setPromptAction(action);
    }
  };

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6"
      aria-label={GUEST_CATALOGUE_SECTION_LABEL}
      data-testid="guest-catalogue"
    >
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
            {GUEST_CATALOGUE_SECTION_LABEL}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">
            {GUEST_CATALOGUE_HEADING}
          </h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            {GUEST_CATALOGUE_DESCRIPTION}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleRestrictedAction('create_listing')}
          data-testid="guest-catalogue-create-listing"
        >
          {GUEST_CREATE_LISTING_CTA_LABEL}
        </button>
      </div>

      <form
        onSubmit={handleSearch}
        className="card mb-8"
        aria-label="Guest listing filters"
        data-testid="guest-catalogue-filters"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700"
              htmlFor="guest-catalogue-keyword"
            >
              {GUEST_KEYWORD_FILTER_LABEL}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="guest-catalogue-keyword"
                name="q"
                className="input-field pl-10"
                placeholder={GUEST_KEYWORD_PLACEHOLDER}
                value={draftKeyword}
                onChange={(event) => setDraftKeyword(event.target.value)}
                data-testid="guest-catalogue-keyword"
              />
            </div>
          </div>

          <div className="w-full lg:w-56">
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700"
              htmlFor="guest-catalogue-category"
            >
              {GUEST_CATEGORY_FILTER_LABEL}
            </label>
            <select
              id="guest-catalogue-category"
              name="category"
              className="input-field"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value)}
              data-testid="guest-catalogue-category"
            >
              {categoryOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            data-testid="guest-catalogue-search-submit"
          >
            <Filter className="h-4 w-4" /> {GUEST_SEARCH_SUBMIT_LABEL}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Applied filters:{' '}
          <span className="font-medium text-slate-600">
            {appliedFilters.q ?? 'Any keyword'}
            {' · '}
            {appliedFilters.category ?? 'All categories'}
          </span>
        </p>
      </form>

      {(error || filterError) && (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
          data-testid="guest-catalogue-error"
        >
          {error || filterError}
        </div>
      )}

      {status === 'loading' && (
        <div
          className="space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={GUEST_LOADING_LABEL}
          data-testid="guest-catalogue-loading"
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" /> {GUEST_LOADING_LABEL}
          </p>
        </div>
      )}

      {status === 'empty' && (
        <div
          className="card py-16 text-center"
          role="status"
          data-testid="guest-catalogue-empty"
        >
          <Package className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-lg font-medium text-slate-600">
            {GUEST_EMPTY_RESULTS_MESSAGE}
          </p>
        </div>
      )}

      {status === 'ready' && (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="guest-catalogue-grid"
        >
          {previews.map((preview) => (
            <GuestListingCard
              key={preview.id}
              preview={preview}
              onRestrictedAction={handleRestrictedAction}
            />
          ))}
        </div>
      )}

      {promptAction && (
        <GuestRegistrationPrompt
          action={promptAction}
          onDismiss={() => setPromptAction(null)}
        />
      )}
    </section>
  );
}
