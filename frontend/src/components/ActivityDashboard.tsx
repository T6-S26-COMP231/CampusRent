import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BarChart3, FileText, Filter, LoaderCircle } from 'lucide-react';
import { api } from '../api/client';
import {
  ACTIVITY_APPLY_FILTERS_LABEL,
  ACTIVITY_DASHBOARD_DESCRIPTION,
  ACTIVITY_DASHBOARD_HEADING,
  ACTIVITY_END_DATE_LABEL,
  ACTIVITY_FILTERS_HEADING,
  ACTIVITY_FILTERS_HINT,
  ACTIVITY_GENERATE_ERROR_FALLBACK,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_GENERATING_REPORT_LABEL,
  ACTIVITY_LISTING_CATEGORY_FILTER_LABEL,
  ACTIVITY_LOAD_ERROR_FALLBACK,
  ACTIVITY_LOADING_LABEL,
  ACTIVITY_METRICS_HEADING,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_HEADING,
  ACTIVITY_REPORT_RESULT_PLACEHOLDER,
  ACTIVITY_RESET_FILTERS_LABEL,
  ACTIVITY_SCOPE_FILTER_LABEL,
  ACTIVITY_SECTION_LABEL,
  ACTIVITY_START_DATE_LABEL,
  ACTIVITY_STATISTICS_HEADING,
  activityDashboardUiStatus,
  activityListingCategoryEnabled,
  activityListingCategorySelectOptions,
  activityNoDataPresentation,
  activityScopeSelectOptions,
  canStartActivityRequest,
  defaultActivityFilters,
  draftFiltersAfterScopeChange,
  formatActivityFilterSummary,
  getVisibleMetricRows,
  normalizeActivityFilters,
  type ActivityListingCategory,
  type ActivityMetricRow,
  type ActivityReport,
  type ActivityReportFilters,
  type ActivityScope,
} from '../utils/activityMetrics';
import ActivityMetricWidget from './ActivityMetricWidget';
import ActivityReportResult from './ActivityReportResult';

export interface ActivityDashboardProps {
  /** Optional inject for tests — defaults to api.getAdminActivity. */
  fetchActivity?: (filters: ActivityReportFilters) => Promise<ActivityReport>;
  /** Skip initial auto-load (tests). */
  autoLoad?: boolean;
}

/**
 * US-24.6 — administrator activity dashboard wired to GET /api/admin/activity.
 */
export default function ActivityDashboard({
  fetchActivity = (filters) => api.getAdminActivity(filters),
  autoLoad = true,
}: ActivityDashboardProps) {
  const [draftFilters, setDraftFilters] = useState<ActivityReportFilters>(
    defaultActivityFilters()
  );
  const [appliedFilters, setAppliedFilters] = useState<ActivityReportFilters>(
    defaultActivityFilters()
  );
  const [metricRows, setMetricRows] = useState<ActivityMetricRow[] | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(autoLoad);
  const [dashboardError, setDashboardError] = useState('');
  const [showNoData, setShowNoData] = useState(false);
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState('');
  const fetchActivityRef = useRef(fetchActivity);
  fetchActivityRef.current = fetchActivity;

  const visibleRows = useMemo(
    () =>
      metricRows
        ? getVisibleMetricRows(appliedFilters.activity_scope, metricRows)
        : [],
    [appliedFilters.activity_scope, metricRows]
  );

  const status = activityDashboardUiStatus({
    loading: dashboardLoading,
    error: dashboardError,
    showNoData,
    hasConnectedMetrics: Boolean(metricRows && !showNoData),
  });
  const noData = activityNoDataPresentation(showNoData);
  const scopeOptions = activityScopeSelectOptions();
  const categoryOptions = activityListingCategorySelectOptions();
  const listingCategoryVisible = activityListingCategoryEnabled(
    draftFilters.activity_scope
  );
  const busy = !canStartActivityRequest({
    dashboardLoading,
    reportGenerating,
  });

  const applyServerReport = useCallback((next: ActivityReport) => {
    setMetricRows(next.metrics);
    setAppliedFilters(next.filters);
    setDraftFilters(next.filters);
    setShowNoData(!next.has_data);
    setDashboardError('');
  }, []);

  const loadActivity = useCallback(
    async (filters: ActivityReportFilters) => {
      const normalized = normalizeActivityFilters(filters);
      if (normalized.error) {
        setDashboardError(normalized.error);
        return;
      }

      setDashboardLoading(true);
      setDashboardError('');
      try {
        const next = await fetchActivityRef.current(normalized.filters);
        applyServerReport(next);
      } catch (err) {
        setDashboardError(
          err instanceof Error && err.message.trim()
            ? err.message
            : ACTIVITY_LOAD_ERROR_FALLBACK
        );
      } finally {
        setDashboardLoading(false);
      }
    },
    [applyServerReport]
  );

  useEffect(() => {
    if (!autoLoad) return;
    void loadActivity(defaultActivityFilters());
    // Initial default aggregate only — filter Apply / Reset call loadActivity explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const updateDraft = <K extends keyof ActivityReportFilters>(
    key: K,
    value: ActivityReportFilters[K]
  ) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
    setDashboardError('');
    setReportError('');
  };

  const handleScopeChange = (scope: ActivityScope) => {
    setDraftFilters((current) => draftFiltersAfterScopeChange(current, scope));
    setDashboardError('');
    setReportError('');
  };

  const handleApplyFilters = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void loadActivity(draftFilters);
  };

  const handleResetFilters = () => {
    if (busy) return;
    const defaults = defaultActivityFilters();
    setDraftFilters(defaults);
    setReportError('');
    void loadActivity(defaults);
  };

  const handleGenerateReport = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const normalized = normalizeActivityFilters(draftFilters);
    if (normalized.error) {
      setReportError(normalized.error);
      return;
    }

    setReportGenerating(true);
    setReportError('');
    try {
      const next = await fetchActivityRef.current(normalized.filters);
      setReport(next);
      applyServerReport(next);
    } catch (err) {
      setReportError(
        err instanceof Error && err.message.trim()
          ? err.message
          : ACTIVITY_GENERATE_ERROR_FALLBACK
      );
    } finally {
      setReportGenerating(false);
    }
  };

  return (
    <section aria-label={ACTIVITY_SECTION_LABEL} className="mt-12 border-t border-slate-200 pt-10">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-campus-700">
        {ACTIVITY_SECTION_LABEL}
      </p>
      <div className="mt-2 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-campus-50 text-campus-700">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            {ACTIVITY_DASHBOARD_HEADING}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {ACTIVITY_DASHBOARD_DESCRIPTION}
          </p>
        </div>
      </div>

      <form
        className="card mt-6"
        aria-label={ACTIVITY_FILTERS_HEADING}
        onSubmit={handleApplyFilters}
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-campus-700" />
          <h3 className="font-display text-lg font-bold text-slate-900">
            {ACTIVITY_FILTERS_HEADING}
          </h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">{ACTIVITY_FILTERS_HINT}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-slate-700"
              htmlFor="activity-start-date"
            >
              {ACTIVITY_START_DATE_LABEL}
            </label>
            <input
              id="activity-start-date"
              name="start_date"
              type="date"
              className="input-field"
              value={draftFilters.start_date ?? ''}
              disabled={busy}
              onChange={(event) =>
                updateDraft('start_date', event.target.value || null)
              }
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-slate-700"
              htmlFor="activity-end-date"
            >
              {ACTIVITY_END_DATE_LABEL}
            </label>
            <input
              id="activity-end-date"
              name="end_date"
              type="date"
              className="input-field"
              value={draftFilters.end_date ?? ''}
              disabled={busy}
              onChange={(event) =>
                updateDraft('end_date', event.target.value || null)
              }
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-slate-700"
              htmlFor="activity-scope"
            >
              {ACTIVITY_SCOPE_FILTER_LABEL}
            </label>
            <select
              id="activity-scope"
              name="activity_scope"
              className="input-field"
              value={draftFilters.activity_scope}
              disabled={busy}
              onChange={(event) =>
                handleScopeChange(event.target.value as ActivityScope)
              }
            >
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-slate-700"
              htmlFor="activity-listing-category"
            >
              {ACTIVITY_LISTING_CATEGORY_FILTER_LABEL}
            </label>
            <select
              id="activity-listing-category"
              name="listing_category"
              className="input-field"
              value={draftFilters.listing_category ?? ''}
              disabled={busy || !listingCategoryVisible}
              onChange={(event) =>
                updateDraft(
                  'listing_category',
                  (event.target.value || null) as ActivityListingCategory | null
                )
              }
            >
              {categoryOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            data-testid="activity-apply-filters"
          >
            {dashboardLoading ? ACTIVITY_LOADING_LABEL : ACTIVITY_APPLY_FILTERS_LABEL}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={handleResetFilters}
            data-testid="activity-reset-filters"
          >
            {ACTIVITY_RESET_FILTERS_LABEL}
          </button>
        </div>
      </form>

      {dashboardError && (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
          data-testid="activity-dashboard-error"
        >
          {dashboardError}
        </div>
      )}

      {status === 'loading' && (
        <div
          className="mt-6 space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={ACTIVITY_LOADING_LABEL}
          data-testid="activity-dashboard-loading"
        >
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" /> {ACTIVITY_LOADING_LABEL}
          </p>
        </div>
      )}

      {noData.visible && status !== 'loading' && (
        <div
          className="card mt-6 py-10 text-center"
          role="status"
          aria-live="polite"
          data-testid="activity-no-data"
        >
          <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 font-display text-lg font-bold text-slate-900">
            No matching activity
          </h3>
          <p className="mt-2 text-sm text-slate-500">{ACTIVITY_NO_DATA_MESSAGE}</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="mt-8" aria-label={ACTIVITY_STATISTICS_HEADING}>
          <h3 className="font-display text-lg font-bold text-slate-900">
            {ACTIVITY_STATISTICS_HEADING}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{ACTIVITY_METRICS_HEADING}</p>
          <p className="mt-1 text-xs text-slate-400">
            Showing results for {formatActivityFilterSummary(appliedFilters)}
          </p>

          <div
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label={ACTIVITY_METRICS_HEADING}
            data-testid="activity-metric-grid"
          >
            {visibleRows.map((row) => (
              <ActivityMetricWidget
                key={row.key}
                metricKey={row.key}
                label={row.label}
                count={row.count}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card mt-8" aria-label={ACTIVITY_REPORT_HEADING}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-campus-700" />
          <h3 className="font-display text-lg font-bold text-slate-900">
            {ACTIVITY_REPORT_HEADING}
          </h3>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Selected filters:{' '}
          <span className="font-medium text-slate-700">
            {formatActivityFilterSummary(draftFilters)}
          </span>
        </p>

        <form onSubmit={handleGenerateReport} className="mt-5">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            data-testid="activity-generate-report"
          >
            {reportGenerating
              ? ACTIVITY_GENERATING_REPORT_LABEL
              : ACTIVITY_GENERATE_REPORT_LABEL}
          </button>
        </form>

        {reportError && (
          <div
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
            data-testid="activity-report-error"
          >
            {reportError}
          </div>
        )}

        <div className="mt-5">
          {report ? (
            <ActivityReportResult report={report} />
          ) : (
            <div
              className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-5"
              data-testid="activity-report-result"
            >
              <p className="text-sm text-slate-500">{ACTIVITY_REPORT_RESULT_PLACEHOLDER}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
