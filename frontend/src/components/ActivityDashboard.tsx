import { FormEvent, useMemo, useState } from 'react';
import { BarChart3, FileText, Filter, LoaderCircle } from 'lucide-react';
import {
  ACTIVITY_DASHBOARD_DESCRIPTION,
  ACTIVITY_DASHBOARD_HEADING,
  ACTIVITY_END_DATE_LABEL,
  ACTIVITY_FILTERS_HEADING,
  ACTIVITY_FILTERS_HINT,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_LISTING_CATEGORY_FILTER_LABEL,
  ACTIVITY_LOADING_LABEL,
  ACTIVITY_METRICS_HEADING,
  ACTIVITY_METRICS_PLACEHOLDER_HINT,
  ACTIVITY_METRICS_PLACEHOLDER_LABEL,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_HEADING,
  ACTIVITY_REPORT_RESULT_PLACEHOLDER,
  ACTIVITY_SCOPE_FILTER_LABEL,
  ACTIVITY_SECTION_LABEL,
  ACTIVITY_START_DATE_LABEL,
  ACTIVITY_STATISTICS_HEADING,
  activityDashboardUiStatus,
  activityListingCategorySelectOptions,
  activityMetricLayoutSlots,
  activityNoDataPresentation,
  activityScopeSelectOptions,
  attemptActivityReportGenerationUi,
  defaultActivityFilters,
  formatActivityFilterSummary,
  getVisibleMetricRows,
  type ActivityListingCategory,
  type ActivityMetricRow,
  type ActivityReport,
  type ActivityReportFilters,
  type ActivityScope,
} from '../utils/activityMetrics';
import ActivityMetricWidget from './ActivityMetricWidget';
import ActivityReportResult from './ActivityReportResult';

export interface ActivityDashboardProps {
  /** Supplied metric rows from later integration — never fabricated here. */
  metricRows?: ActivityMetricRow[] | null;
  loading?: boolean;
  error?: string;
  /** Show the approved no-data presentation (has_data === false). */
  showNoData?: boolean;
  /** Connected report from later tasks — never fabricated here. */
  report?: ActivityReport | null;
  initialFilters?: ActivityReportFilters;
}

/**
 * US-24.2 / US-24.3 — administrator activity-monitoring dashboard.
 * Layout + metric/report widgets. No aggregation API or report generation.
 */
export default function ActivityDashboard({
  metricRows = null,
  loading = false,
  error = '',
  showNoData = false,
  report = null,
  initialFilters = defaultActivityFilters(),
}: ActivityDashboardProps) {
  const [filters, setFilters] = useState<ActivityReportFilters>(initialFilters);
  const [reportNotice, setReportNotice] = useState('');

  const visibleRows = useMemo(
    () =>
      metricRows
        ? getVisibleMetricRows(filters.activity_scope, metricRows)
        : [],
    [filters.activity_scope, metricRows]
  );

  const status = activityDashboardUiStatus({
    loading,
    error,
    showNoData,
    hasConnectedMetrics: Boolean(metricRows && metricRows.length > 0),
  });
  const noData = activityNoDataPresentation(showNoData);
  const scopeOptions = activityScopeSelectOptions();
  const categoryOptions = activityListingCategorySelectOptions();
  const layoutSlots = activityMetricLayoutSlots(filters.activity_scope);
  const listingCategoryVisible =
    filters.activity_scope === 'all' || filters.activity_scope === 'listings';

  const updateFilter = <K extends keyof ActivityReportFilters>(
    key: K,
    value: ActivityReportFilters[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setReportNotice('');
  };

  const handleGenerateReport = (event: FormEvent) => {
    event.preventDefault();
    // Still unconnected — do not fabricate a report.
    const result = attemptActivityReportGenerationUi();
    setReportNotice(result.notice);
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

      <div className="card mt-6" aria-label={ACTIVITY_FILTERS_HEADING}>
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
              value={filters.start_date ?? ''}
              onChange={(event) =>
                updateFilter('start_date', event.target.value || null)
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
              value={filters.end_date ?? ''}
              onChange={(event) =>
                updateFilter('end_date', event.target.value || null)
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
              value={filters.activity_scope}
              onChange={(event) =>
                updateFilter('activity_scope', event.target.value as ActivityScope)
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
              value={filters.listing_category ?? ''}
              disabled={!listingCategoryVisible}
              onChange={(event) =>
                updateFilter(
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
      </div>

      {status === 'loading' && (
        <div
          className="mt-6 space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={ACTIVITY_LOADING_LABEL}
        >
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" /> {ACTIVITY_LOADING_LABEL}
          </p>
        </div>
      )}

      {status === 'error' && error && (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {noData.visible && (
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

      {status !== 'loading' && !noData.visible && (
        <div className="mt-8" aria-label={ACTIVITY_STATISTICS_HEADING}>
          <h3 className="font-display text-lg font-bold text-slate-900">
            {ACTIVITY_STATISTICS_HEADING}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{ACTIVITY_METRICS_HEADING}</p>
          {status !== 'ready' && (
            <p className="mt-1 text-xs text-slate-400">{ACTIVITY_METRICS_PLACEHOLDER_HINT}</p>
          )}

          <div
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label={ACTIVITY_METRICS_HEADING}
            data-testid="activity-metric-grid"
          >
            {status === 'ready'
              ? visibleRows.map((row) => (
                  <ActivityMetricWidget
                    key={row.key}
                    metricKey={row.key}
                    label={row.label}
                    count={row.count}
                  />
                ))
              : layoutSlots.map((slot) => (
                  <article
                    key={slot.key}
                    className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4"
                    data-testid={`activity-metric-slot-${slot.key}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {slot.label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {ACTIVITY_METRICS_PLACEHOLDER_LABEL}
                    </p>
                  </article>
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
            {formatActivityFilterSummary(filters)}
          </span>
        </p>

        <form onSubmit={handleGenerateReport} className="mt-5">
          <button type="submit" className="btn-primary">
            {ACTIVITY_GENERATE_REPORT_LABEL}
          </button>
        </form>

        {reportNotice && (
          <div
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            role="status"
          >
            {reportNotice}
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
