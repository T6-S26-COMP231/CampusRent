/**
 * US-24.6 — ActivityDashboard ↔ GET /api/admin/activity integration helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  ACTIVITY_APPLY_FILTERS_LABEL,
  ACTIVITY_CATEGORY_SCOPE_MESSAGE,
  ACTIVITY_DASHBOARD_PATH,
  ACTIVITY_GENERATING_REPORT_LABEL,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_LOADING_LABEL,
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  activityDashboardUiStatus,
  activityListingCategoryEnabled,
  activityReportContainsSensitiveField,
  activityReportResultView,
  activityReportSummaryTotalForDisplay,
  activitySummaryUsesServerTotalOnly,
  buildGetAdminActivityCall,
  buildAdminActivityPath,
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

const here = dirname(fileURLToPath(import.meta.url));

function sampleReport(
  overrides: Partial<ActivityReport> = {}
): ActivityReport {
  const filters = overrides.filters ?? defaultActivityFilters();
  const metrics: ActivityMetricRow[] = overrides.metrics ?? [
    {
      key: 'total_registered_students',
      label: ACTIVITY_METRIC_LABELS.total_registered_students,
      count: 5,
    },
    {
      key: 'verified_students',
      label: ACTIVITY_METRIC_LABELS.verified_students,
      count: 3,
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
      count: 2,
    },
    {
      key: 'available_listings',
      label: ACTIVITY_METRIC_LABELS.available_listings,
      count: 2,
    },
    {
      key: 'unavailable_listings',
      label: ACTIVITY_METRIC_LABELS.unavailable_listings,
      count: 0,
    },
    {
      key: 'total_rental_requests',
      label: ACTIVITY_METRIC_LABELS.total_rental_requests,
      count: 0,
    },
    {
      key: 'pending_rental_requests',
      label: ACTIVITY_METRIC_LABELS.pending_rental_requests,
      count: 0,
    },
    {
      key: 'accepted_rental_requests',
      label: ACTIVITY_METRIC_LABELS.accepted_rental_requests,
      count: 0,
    },
    {
      key: 'declined_rental_requests',
      label: ACTIVITY_METRIC_LABELS.declined_rental_requests,
      count: 0,
    },
    {
      key: 'cancelled_rental_requests',
      label: ACTIVITY_METRIC_LABELS.cancelled_rental_requests,
      count: 0,
    },
    {
      key: 'completed_rental_requests',
      label: ACTIVITY_METRIC_LABELS.completed_rental_requests,
      count: 0,
    },
    {
      key: 'total_reports',
      label: ACTIVITY_METRIC_LABELS.total_reports,
      count: 0,
    },
    {
      key: 'open_reports',
      label: ACTIVITY_METRIC_LABELS.open_reports,
      count: 0,
    },
    {
      key: 'resolved_reports',
      label: ACTIVITY_METRIC_LABELS.resolved_reports,
      count: 0,
    },
    {
      key: 'dismissed_reports',
      label: ACTIVITY_METRIC_LABELS.dismissed_reports,
      count: 0,
    },
    {
      key: 'total_reviews',
      label: ACTIVITY_METRIC_LABELS.total_reviews,
      count: 0,
    },
    {
      key: 'total_conversations',
      label: ACTIVITY_METRIC_LABELS.total_conversations,
      count: 0,
    },
    {
      key: 'total_messages',
      label: ACTIVITY_METRIC_LABELS.total_messages,
      count: 0,
    },
  ];

  return {
    generated_at: '2026-08-09T18:00:00.000Z',
    filters,
    metrics,
    summary_total: 7,
    has_data: true,
    no_data_message: null,
    ...overrides,
  };
}

describe('US-24.6 activity API client descriptors', () => {
  test('getAdminActivity path includes only set filters; default scope all', () => {
    const defaults = buildGetAdminActivityCall();
    assert.equal(defaults.method, 'GET');
    assert.equal(defaults.path, '/admin/activity?activity_scope=all');
    assert.equal(defaults.path.includes('start_date'), false);
    assert.equal(defaults.path.includes('listing_category'), false);

    const filtered = buildAdminActivityPath({
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      activity_scope: 'listings',
      listing_category: 'Electronics',
    });
    assert.equal(
      filtered,
      '/admin/activity?start_date=2026-08-01&end_date=2026-08-03&activity_scope=listings&listing_category=Electronics'
    );
    assert.equal(filtered.includes('undefined'), false);
    assert.equal(filtered.includes('null'), false);

    const clientSource = readFileSync(
      join(here, '../api/client.ts'),
      'utf8'
    );
    assert.ok(clientSource.includes('getAdminActivity'));
    assert.ok(clientSource.includes('buildAdminActivityPath'));
  });
});

describe('US-24.6 initial load and filter application', () => {
  test('default load shows loading then real metric counts including zero', async () => {
    assert.equal(activityDashboardUiStatus({ loading: true }), 'loading');
    assert.equal(ACTIVITY_LOADING_LABEL, 'Loading platform activity...');

    const loaded = await runActivityDashboardFetchFlow(async (filters) => {
      assert.equal(filters.activity_scope, 'all');
      assert.equal(filters.start_date, null);
      assert.equal(filters.end_date, null);
      assert.equal(filters.listing_category, null);
      return sampleReport();
    });

    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.error, '');
    assert.equal(loaded.showNoData, false);
    assert.ok(loaded.metrics);
    assert.equal(
      loaded.metrics!.find((row) => row.key === 'total_registered_students')
        ?.count,
      5
    );
    assert.equal(
      loaded.metrics!.find((row) => row.key === 'suspended_users')?.count,
      0
    );
    assert.equal(loaded.summary_total, 7);
    assert.equal(loaded.appliedFilters.activity_scope, 'all');
  });

  test('Apply sends dates/scope/category and replaces prior metrics from server', async () => {
    const previousMetrics = sampleReport().metrics;
    let seen: ActivityReportFilters | null = null;

    const applied = await runActivityDashboardFetchFlow(
      async (filters) => {
        seen = filters;
        return sampleReport({
          filters,
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
          summary_total: 1,
        });
      },
      {
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        activity_scope: 'listings',
        listing_category: 'Electronics',
      },
      {
        metrics: previousMetrics,
        appliedFilters: defaultActivityFilters(),
        showNoData: false,
      }
    );

    assert.ok(seen);
    assert.equal(seen!.start_date, '2026-08-01');
    assert.equal(seen!.end_date, '2026-08-03');
    assert.equal(seen!.activity_scope, 'listings');
    assert.equal(seen!.listing_category, 'Electronics');
    assert.equal(applied.status, 'ready');
    assert.deepEqual(
      getVisibleMetricRows('listings', applied.metrics!).map((row) => row.count),
      [1, 1, 0]
    );
    assert.equal(
      applied.metrics!.some((row) => row.key === 'total_registered_students'),
      false
    );
    assert.equal(ACTIVITY_APPLY_FILTERS_LABEL, 'Apply filters');
  });

  test('incompatible listing category is cleared in draft UI helpers', () => {
    assert.equal(activityListingCategoryEnabled('listings'), true);
    assert.equal(activityListingCategoryEnabled('users'), false);
    const cleared = draftFiltersAfterScopeChange(
      {
        start_date: '2026-08-01',
        end_date: null,
        activity_scope: 'listings',
        listing_category: 'Electronics',
      },
      'users'
    );
    assert.equal(cleared.activity_scope, 'users');
    assert.equal(cleared.listing_category, null);
    assert.match(ACTIVITY_CATEGORY_SCOPE_MESSAGE, /listing_category can only be used/i);
  });

  test('backend 400 keeps prior metrics and draft-capable error text', async () => {
    const previous = sampleReport();
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

    assert.equal(failed.status, 'ready');
    assert.match(failed.error, /Start date cannot be after end date/);
    assert.equal(
      failed.metrics!.find((row) => row.key === 'total_registered_students')
        ?.count,
      5
    );
    assert.deepEqual(failed.appliedFilters, previous.filters);
    assert.equal(
      activityDashboardUiStatus({
        error: failed.error,
        hasConnectedMetrics: true,
      }),
      'ready'
    );
  });

  test('has_data false shows approved no-data message, not an error', async () => {
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
  });
});

describe('US-24.6 Generate Report', () => {
  test('Generate Report calls activity API and renders server report fields', async () => {
    assert.equal(canStartActivityRequest({ dashboardLoading: true }), false);
    assert.equal(canStartActivityRequest({ reportGenerating: true }), false);
    assert.equal(canStartActivityRequest({}), true);
    assert.equal(ACTIVITY_GENERATE_REPORT_LABEL, 'Generate report');
    assert.equal(ACTIVITY_GENERATING_REPORT_LABEL, 'Generating...');

    let calls = 0;
    const generated = await runActivityGenerateReportFlow(
      async (filters) => {
        calls += 1;
        return sampleReport({
          filters,
          generated_at: '2026-08-09T19:30:00.000Z',
          summary_total: 7,
        });
      },
      {
        start_date: '2026-08-01',
        end_date: null,
        activity_scope: 'all',
        listing_category: null,
      }
    );

    assert.equal(calls, 1);
    assert.equal(generated.success, true);
    assert.equal(generated.error, '');
    assert.ok(generated.report);
    assert.equal(generated.report!.generated_at, '2026-08-09T19:30:00.000Z');
    assert.equal(
      activityReportSummaryTotalForDisplay(generated.report!),
      7
    );
    assert.equal(activitySummaryUsesServerTotalOnly(generated.report!), true);

    const view = activityReportResultView(generated.report!);
    assert.equal(view.generated_at, '2026-08-09T19:30:00.000Z');
    assert.equal(view.summary_total, 7);
    assert.equal(view.show_no_data, false);
  });

  test('failed generation preserves prior report and does not fabricate one', async () => {
    const prior = sampleReport({
      generated_at: '2026-08-09T12:00:00.000Z',
      summary_total: 7,
    });
    const failed = await runActivityGenerateReportFlow(
      async () => {
        throw new Error('Listing category filter is not supported.');
      },
      {
        start_date: null,
        end_date: null,
        activity_scope: 'listings',
        listing_category: 'Spaceships' as never,
      },
      prior
    );

    // Invalid category fails client normalize before fetch.
    assert.equal(failed.called, false);
    assert.equal(failed.success, false);
    assert.match(failed.error, /category/i);
    assert.equal(failed.report, prior);
    assert.equal(failed.report!.generated_at, '2026-08-09T12:00:00.000Z');

    const apiFailed = await runActivityGenerateReportFlow(
      async () => {
        throw new Error('Forbidden');
      },
      defaultActivityFilters(),
      prior
    );
    assert.equal(apiFailed.called, true);
    assert.equal(apiFailed.success, false);
    assert.equal(apiFailed.report, prior);
    assert.equal(apiFailed.error, 'Forbidden');
  });
});

describe('US-24.6 privacy and admin regression', () => {
  test('activity report presentation never exposes sensitive fields', () => {
    const report = sampleReport();
    assert.equal(activityReportContainsSensitiveField(report), false);
    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in report, false, field);
    }
    assert.equal(
      activityReportContainsSensitiveField({
        ...report,
        email: 'admin@campusrent.test',
      }),
      true
    );
  });

  test('ActivityDashboard on /admin uses getAdminActivity; verification/moderation remain', () => {
    assert.equal(ACTIVITY_DASHBOARD_PATH, '/admin');
    const adminSource = readFileSync(join(here, '../pages/AdminPage.tsx'), 'utf8');
    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );
    const clientSource = readFileSync(join(here, '../api/client.ts'), 'utf8');

    assert.ok(adminSource.includes('ActivityDashboard'));
    assert.ok(adminSource.includes('Pending accounts'));
    assert.ok(adminSource.includes('ModerationQueue'));
    assert.ok(dashboardSource.includes('api.getAdminActivity'));
    assert.ok(dashboardSource.includes('ACTIVITY_APPLY_FILTERS_LABEL'));
    assert.ok(dashboardSource.includes('ACTIVITY_GENERATING_REPORT_LABEL'));
    assert.ok(clientSource.includes('getAdminActivity'));
    assert.equal(
      dashboardSource.includes('Activity report generation is not connected yet'),
      false
    );
    assert.equal(dashboardSource.includes('Awaiting statistics'), false);

    const browseSource = readFileSync(join(here, '../pages/BrowsePage.tsx'), 'utf8');
    assert.equal(browseSource.includes('ActivityDashboard'), false);
  });
});
