/**
 * US-24.7 — frontend helper coverage mapped to Team6 TAC activity-monitoring UX.
 *
 * TAC Test 1 — Open activity dashboard → Platform statistics displayed
 * TAC Test 2 — Apply filters → Results update correctly
 * TAC Test 3 — Generate report → Activity summary produced
 * TAC Test 4 — Filter with no data → No-data message displayed
 *
 * Broader detail remains in activityMetrics.test.ts, activityMetrics.ui.test.ts,
 * activityMetrics.widgets.test.ts, and activityMetrics.integration.test.ts.
 * This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; ActivityDashboard /
 * AdminPage rendering is not exercised here. Display/load/filter/report
 * behavior is proven through the helper contracts ActivityDashboard uses
 * (runActivityDashboardFetchFlow / runActivityGenerateReportFlow) plus
 * source-level wiring checks.
 *
 * Do NOT claim production Overall Result: PASSED — US-24.8 (#186) owns
 * merge/deploy/manual acceptance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  ACTIVITY_APPLY_FILTERS_LABEL,
  ACTIVITY_DASHBOARD_HEADING,
  ACTIVITY_DASHBOARD_PATH,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_GENERATING_REPORT_LABEL,
  ACTIVITY_LOADING_LABEL,
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  ACTIVITY_SECTION_LABEL,
  ACTIVITY_STATISTICS_HEADING,
  activityDashboardUiStatus,
  activityListingCategoryEnabled,
  activityNoDataPresentation,
  activityReportContainsSensitiveField,
  activityReportResultView,
  activityReportSummaryTotalForDisplay,
  activitySummaryUsesServerTotalOnly,
  buildGetAdminActivityCall,
  canStartActivityRequest,
  defaultActivityFilters,
  draftFiltersAfterScopeChange,
  getVisibleMetricRows,
  runActivityDashboardFetchFlow,
  runActivityGenerateReportFlow,
  type ActivityMetricRow,
  type ActivityReport,
  type ActivityReportFilters,
} from './activityMetrics';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_24_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-24.8' as const;
export const US_24_PRODUCTION_ACCEPTANCE_REASON =
  'US-24.8 (#186) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

const here = dirname(fileURLToPath(import.meta.url));

function sampleReport(overrides: Partial<ActivityReport> = {}): ActivityReport {
  const filters = overrides.filters ?? defaultActivityFilters();
  const metrics: ActivityMetricRow[] =
    overrides.metrics ??
    ([
      {
        key: 'total_registered_students',
        label: ACTIVITY_METRIC_LABELS.total_registered_students,
        count: 4,
      },
      {
        key: 'verified_students',
        label: ACTIVITY_METRIC_LABELS.verified_students,
        count: 2,
      },
      {
        key: 'pending_students',
        label: ACTIVITY_METRIC_LABELS.pending_students,
        count: 1,
      },
      {
        key: 'rejected_students',
        label: ACTIVITY_METRIC_LABELS.rejected_students,
        count: 1,
      },
      {
        key: 'suspended_users',
        label: ACTIVITY_METRIC_LABELS.suspended_users,
        count: 0,
      },
      {
        key: 'total_listings',
        label: ACTIVITY_METRIC_LABELS.total_listings,
        count: 3,
      },
      {
        key: 'available_listings',
        label: ACTIVITY_METRIC_LABELS.available_listings,
        count: 2,
      },
      {
        key: 'unavailable_listings',
        label: ACTIVITY_METRIC_LABELS.unavailable_listings,
        count: 1,
      },
      {
        key: 'total_rental_requests',
        label: ACTIVITY_METRIC_LABELS.total_rental_requests,
        count: 4,
      },
      {
        key: 'pending_rental_requests',
        label: ACTIVITY_METRIC_LABELS.pending_rental_requests,
        count: 1,
      },
      {
        key: 'accepted_rental_requests',
        label: ACTIVITY_METRIC_LABELS.accepted_rental_requests,
        count: 1,
      },
      {
        key: 'declined_rental_requests',
        label: ACTIVITY_METRIC_LABELS.declined_rental_requests,
        count: 1,
      },
      {
        key: 'cancelled_rental_requests',
        label: ACTIVITY_METRIC_LABELS.cancelled_rental_requests,
        count: 0,
      },
      {
        key: 'completed_rental_requests',
        label: ACTIVITY_METRIC_LABELS.completed_rental_requests,
        count: 1,
      },
      {
        key: 'total_reports',
        label: ACTIVITY_METRIC_LABELS.total_reports,
        count: 2,
      },
      {
        key: 'open_reports',
        label: ACTIVITY_METRIC_LABELS.open_reports,
        count: 1,
      },
      {
        key: 'resolved_reports',
        label: ACTIVITY_METRIC_LABELS.resolved_reports,
        count: 1,
      },
      {
        key: 'dismissed_reports',
        label: ACTIVITY_METRIC_LABELS.dismissed_reports,
        count: 0,
      },
      {
        key: 'total_reviews',
        label: ACTIVITY_METRIC_LABELS.total_reviews,
        count: 1,
      },
      {
        key: 'total_conversations',
        label: ACTIVITY_METRIC_LABELS.total_conversations,
        count: 1,
      },
      {
        key: 'total_messages',
        label: ACTIVITY_METRIC_LABELS.total_messages,
        count: 1,
      },
    ] as ActivityMetricRow[]);

  return {
    generated_at: '2026-08-09T18:00:00.000Z',
    filters,
    metrics,
    summary_total: 16,
    has_data: true,
    no_data_message: null,
    ...overrides,
  };
}

describe('US-24 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Open activity dashboard: platform statistics displayed', async () => {
    assert.equal(ACTIVITY_DASHBOARD_PATH, '/admin');
    assert.equal(ACTIVITY_SECTION_LABEL, 'Platform activity');
    assert.equal(ACTIVITY_DASHBOARD_HEADING, 'Platform activity');
    assert.equal(ACTIVITY_STATISTICS_HEADING, 'Platform statistics');
    assert.equal(ACTIVITY_LOADING_LABEL, 'Loading platform activity...');
    assert.equal(activityDashboardUiStatus({ loading: true }), 'loading');

    const initialCall = buildGetAdminActivityCall(defaultActivityFilters());
    assert.equal(initialCall.method, 'GET');
    assert.equal(initialCall.path, '/admin/activity?activity_scope=all');

    const loaded = await runActivityDashboardFetchFlow(async (filters) => {
      assert.equal(filters.activity_scope, 'all');
      assert.equal(filters.start_date, null);
      assert.equal(filters.listing_category, null);
      return sampleReport();
    });

    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.error, '');
    assert.ok(loaded.metrics);
    assert.equal(
      loaded.metrics!.find((row) => row.key === 'total_registered_students')
        ?.count,
      4
    );
    assert.equal(
      loaded.metrics!.find((row) => row.key === 'suspended_users')?.count,
      0
    );
    assert.equal(loaded.summary_total, 16);
    assert.equal(
      activityDashboardUiStatus({
        hasConnectedMetrics: true,
        showNoData: false,
      }),
      'ready'
    );

    const adminSource = readFileSync(join(here, '../pages/AdminPage.tsx'), 'utf8');
    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );
    assert.ok(adminSource.includes('ActivityDashboard'));
    assert.ok(adminSource.includes('Pending accounts'));
    assert.ok(adminSource.includes('ModerationQueue'));
    assert.ok(dashboardSource.includes('api.getAdminActivity'));
    assert.equal(dashboardSource.includes('Awaiting statistics'), false);
    assert.equal(
      dashboardSource.includes('Activity report generation is not connected yet'),
      false
    );

    assert.equal(US_24_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-24.8');
  });

  test('TAC Test 2 — Apply filters: results update correctly', async () => {
    assert.equal(ACTIVITY_APPLY_FILTERS_LABEL, 'Apply filters');
    assert.equal(activityListingCategoryEnabled('listings'), true);
    assert.equal(activityListingCategoryEnabled('users'), false);

    const cleared = draftFiltersAfterScopeChange(
      {
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        activity_scope: 'listings',
        listing_category: 'Electronics',
      },
      'reports'
    );
    assert.equal(cleared.listing_category, null);

    const previous = sampleReport();
    let seen: ActivityReportFilters | null = null;
    const applied = await runActivityDashboardFetchFlow(
      async (filters) => {
        seen = filters;
        return sampleReport({
          filters,
          summary_total: 1,
          metrics: [
            {
              key: 'total_listings',
              label: ACTIVITY_METRIC_LABELS.total_listings,
              count: 1,
            },
            {
              key: 'available_listings',
              label: ACTIVITY_METRIC_LABELS.available_listings,
              count: 1,
            },
            {
              key: 'unavailable_listings',
              label: ACTIVITY_METRIC_LABELS.unavailable_listings,
              count: 0,
            },
          ],
        });
      },
      {
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        activity_scope: 'listings',
        listing_category: 'Electronics',
      },
      {
        metrics: previous.metrics,
        appliedFilters: previous.filters,
        showNoData: false,
      }
    );

    assert.ok(seen);
    assert.equal(seen!.start_date, '2026-08-01');
    assert.equal(seen!.end_date, '2026-08-03');
    assert.equal(seen!.activity_scope, 'listings');
    assert.equal(seen!.listing_category, 'Electronics');
    assert.equal(applied.appliedFilters.activity_scope, 'listings');
    assert.deepEqual(
      getVisibleMetricRows('listings', applied.metrics!).map((row) => row.count),
      [1, 1, 0]
    );
    // Dashboard consumes server rows — does not invent student metrics for listings scope.
    assert.equal(
      applied.metrics!.some((row) => row.key === 'total_registered_students'),
      false
    );

    const failed = await runActivityDashboardFetchFlow(
      async () => {
        throw new Error('Start date cannot be after end date.');
      },
      {
        start_date: '2026-08-10',
        end_date: '2026-08-01',
        activity_scope: 'all',
        listing_category: null,
      },
      {
        metrics: previous.metrics,
        appliedFilters: previous.filters,
        showNoData: false,
      }
    );
    assert.match(failed.error, /Start date cannot be after end date/);
    assert.equal(
      failed.metrics!.find((row) => row.key === 'total_registered_students')
        ?.count,
      4
    );
    assert.equal(
      activityDashboardUiStatus({
        error: failed.error,
        hasConnectedMetrics: true,
      }),
      'ready'
    );

    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );
    assert.ok(dashboardSource.includes('ACTIVITY_APPLY_FILTERS_LABEL'));
    assert.ok(dashboardSource.includes('draftFilters'));
    assert.ok(dashboardSource.includes('appliedFilters'));
  });

  test('TAC Test 3 — Generate report: activity summary produced', async () => {
    assert.equal(ACTIVITY_GENERATE_REPORT_LABEL, 'Generate report');
    assert.equal(ACTIVITY_GENERATING_REPORT_LABEL, 'Generating...');
    assert.equal(canStartActivityRequest({ reportGenerating: true }), false);
    assert.equal(canStartActivityRequest({ dashboardLoading: true }), false);
    assert.equal(canStartActivityRequest({}), true);

    let calls = 0;
    const generated = await runActivityGenerateReportFlow(
      async (filters) => {
        calls += 1;
        return sampleReport({
          filters,
          generated_at: '2026-08-09T19:45:00.000Z',
          summary_total: 16,
        });
      },
      {
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        activity_scope: 'all',
        listing_category: null,
      }
    );

    assert.equal(calls, 1);
    assert.equal(generated.success, true);
    assert.ok(generated.report);
    assert.equal(generated.report!.generated_at, '2026-08-09T19:45:00.000Z');
    assert.equal(activityReportSummaryTotalForDisplay(generated.report!), 16);
    assert.equal(activitySummaryUsesServerTotalOnly(generated.report!), true);

    const view = activityReportResultView(generated.report!);
    assert.equal(view.generated_at, '2026-08-09T19:45:00.000Z');
    assert.equal(view.summary_total, 16);
    assert.equal(view.show_no_data, false);
    assert.ok(view.metrics.length > 0);

    const prior = sampleReport({ generated_at: '2026-08-09T12:00:00.000Z' });
    const failed = await runActivityGenerateReportFlow(
      async () => {
        throw new Error('Forbidden');
      },
      defaultActivityFilters(),
      prior
    );
    assert.equal(failed.success, false);
    assert.equal(failed.report, prior);
    assert.equal(failed.report!.generated_at, '2026-08-09T12:00:00.000Z');
    assert.equal(failed.error, 'Forbidden');

    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );
    assert.ok(dashboardSource.includes('ActivityReportResult'));
    assert.ok(dashboardSource.includes('ACTIVITY_GENERATING_REPORT_LABEL'));
  });

  test('TAC Test 4 — Filter with no data: approved no-data message displayed', async () => {
    const empty = await runActivityDashboardFetchFlow(async (filters) =>
      sampleReport({
        filters,
        has_data: false,
        summary_total: 0,
        no_data_message: ACTIVITY_NO_DATA_MESSAGE,
        metrics: [
          {
            key: 'total_listings',
            label: ACTIVITY_METRIC_LABELS.total_listings,
            count: 0,
          },
          {
            key: 'available_listings',
            label: ACTIVITY_METRIC_LABELS.available_listings,
            count: 0,
          },
          {
            key: 'unavailable_listings',
            label: ACTIVITY_METRIC_LABELS.unavailable_listings,
            count: 0,
          },
        ],
      })
    );

    assert.equal(empty.status, 'no_data');
    assert.equal(empty.showNoData, true);
    assert.equal(empty.error, '');
    assert.equal(empty.summary_total, 0);
    assert.equal(
      empty.report?.no_data_message,
      'No platform activity matches the selected filters.'
    );

    const presentation = activityNoDataPresentation(true);
    assert.equal(presentation.visible, true);
    assert.equal(
      presentation.message,
      'No platform activity matches the selected filters.'
    );
    assert.equal(
      activityDashboardUiStatus({ showNoData: true, hasConnectedMetrics: true }),
      'no_data'
    );

    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );
    assert.ok(dashboardSource.includes('ACTIVITY_NO_DATA_MESSAGE'));
    assert.ok(dashboardSource.includes('activity-no-data'));
  });

  test('privacy/trust: activity surfaces exclude sensitive fields; production acceptance PENDING', () => {
    const report = sampleReport();
    assert.equal(activityReportContainsSensitiveField(report), false);
    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in report, false, field);
    }
    assert.equal(
      activityReportContainsSensitiveField({
        ...report,
        password_hash: 'secret',
      }),
      true
    );
    assert.equal(
      activityReportContainsSensitiveField({
        ...report,
        email: 'hidden@mycentennialcollege.ca',
      }),
      true
    );

    assert.equal(US_24_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-24.8');
    assert.match(US_24_PRODUCTION_ACCEPTANCE_REASON, /US-24\.8/);
    assert.match(US_24_PRODUCTION_ACCEPTANCE_REASON, /#186/);
  });
});
