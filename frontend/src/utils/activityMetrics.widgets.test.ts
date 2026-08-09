/**
 * US-24.3 — activity metric / report widget presentation helpers.
 * Pure logic only; no React DOM, aggregation API, or backend integration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  ACTIVITY_DASHBOARD_PATH,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_METRIC_KEYS,
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  ACTIVITY_SCOPES,
  activityMetricWidgetView,
  activityReportBlindMetricRowSum,
  activityReportResultView,
  activityReportSummaryTotalForDisplay,
  activityWidgetDisplayContainsSensitiveField,
  buildActivityReport,
  defaultActivityFilters,
  emptyActivityMetricCounts,
  getVisibleMetricRows,
  type ActivityMetricRow,
} from './activityMetrics';

const here = dirname(fileURLToPath(import.meta.url));

const sampleRows: ActivityMetricRow[] = ACTIVITY_METRIC_KEYS.map((key) => ({
  key,
  label: ACTIVITY_METRIC_LABELS[key],
  count: key === 'total_listings' ? 0 : 1,
}));

describe('US-24.3 activity metric widget presentation', () => {
  test('supplied label and count render; zero renders correctly; no fabricated count', () => {
    const view = activityMetricWidgetView({
      key: 'verified_students',
      label: ACTIVITY_METRIC_LABELS.verified_students,
      count: 8,
    });
    assert.equal(view.key, 'verified_students');
    assert.equal(view.label, 'Verified students');
    assert.equal(view.count, 8);
    assert.equal(view.countText, '8');

    const zero = activityMetricWidgetView({
      key: 'total_listings',
      label: ACTIVITY_METRIC_LABELS.total_listings,
      count: 0,
    });
    assert.equal(zero.count, 0);
    assert.equal(zero.countText, '0');

    for (const key of ACTIVITY_METRIC_KEYS) {
      const widget = activityMetricWidgetView({
        key,
        label: ACTIVITY_METRIC_LABELS[key],
        count: 0,
      });
      assert.equal(widget.key, key);
      assert.equal(widget.label, ACTIVITY_METRIC_LABELS[key]);
      assert.equal(widget.countText, '0');
    }

    const widgetSource = readFileSync(
      join(here, '../components/ActivityMetricWidget.tsx'),
      'utf8'
    );
    assert.ok(widgetSource.includes('activityMetricWidgetView'));
    assert.equal(widgetSource.includes('Users: 125'), false);
    assert.equal(widgetSource.includes('Listings: 42'), false);
    assert.equal(widgetSource.includes('fetch('), false);
    assert.equal(widgetSource.includes('api.'), false);
  });
});

describe('US-24.3 activity scope grouping for display', () => {
  test('getVisibleMetricRows filters supplied rows by approved scopes', () => {
    assert.deepEqual(
      getVisibleMetricRows('users', sampleRows).map((row) => row.key),
      [
        'total_registered_students',
        'verified_students',
        'pending_students',
        'rejected_students',
        'suspended_users',
      ]
    );
    assert.deepEqual(
      getVisibleMetricRows('listings', sampleRows).map((row) => row.key),
      ['total_listings', 'available_listings', 'unavailable_listings']
    );
    assert.deepEqual(
      getVisibleMetricRows('rental_requests', sampleRows).map((row) => row.key),
      [
        'total_rental_requests',
        'pending_rental_requests',
        'accepted_rental_requests',
        'declined_rental_requests',
        'cancelled_rental_requests',
        'completed_rental_requests',
      ]
    );
    assert.deepEqual(
      getVisibleMetricRows('reports', sampleRows).map((row) => row.key),
      ['total_reports', 'open_reports', 'resolved_reports', 'dismissed_reports']
    );
    assert.deepEqual(
      getVisibleMetricRows('reviews', sampleRows).map((row) => row.key),
      ['total_reviews']
    );
    assert.deepEqual(
      getVisibleMetricRows('messaging', sampleRows).map((row) => row.key),
      ['total_conversations', 'total_messages']
    );
    assert.equal(getVisibleMetricRows('all', sampleRows).length, sampleRows.length);

    for (const scope of ACTIVITY_SCOPES) {
      const visible = getVisibleMetricRows(scope, sampleRows);
      assert.ok(visible.length > 0, scope);
      assert.ok(visible.every((row) => typeof row.count === 'number'), scope);
    }

    // Unknown / invalid rows are dropped — never invented.
    assert.deepEqual(
      getVisibleMetricRows('listings', [
        {
          key: 'total_listings',
          label: 'Total listings',
          count: 3,
        },
        {
          key: 'verified_students',
          label: 'Verified students',
          count: 9,
        },
      ]).map((row) => row.key),
      ['total_listings']
    );
  });
});

describe('US-24.3 activity report result widget presentation', () => {
  test('renders generated_at, filters, metrics, and supplied summary_total without recomputing', () => {
    const counts = emptyActivityMetricCounts();
    counts.total_listings = 10;
    counts.available_listings = 7;
    counts.unavailable_listings = 3;

    const report = buildActivityReport(
      counts,
      {
        ...defaultActivityFilters(),
        activity_scope: 'listings',
        start_date: '2026-08-01',
        end_date: '2026-08-09',
        listing_category: 'Electronics',
      },
      '2026-08-09T18:00:00.000Z'
    );

    assert.equal(report.summary_total, 10);
    assert.equal(activityReportSummaryTotalForDisplay(report), 10);
    assert.equal(activityReportBlindMetricRowSum(report), 20);
    assert.notEqual(
      activityReportSummaryTotalForDisplay(report),
      activityReportBlindMetricRowSum(report)
    );

    const view = activityReportResultView(report);
    assert.equal(view.generated_at, '2026-08-09T18:00:00.000Z');
    assert.match(view.filter_summary, /2026-08-01/);
    assert.match(view.filter_summary, /2026-08-09/);
    assert.match(view.filter_summary, /Listings/);
    assert.match(view.filter_summary, /Electronics/);
    assert.equal(view.summary_total, 10);
    assert.equal(view.has_data, true);
    assert.equal(view.show_no_data, false);
    assert.equal(view.metrics.length, 3);
    assert.equal(
      view.metrics.find((row) => row.key === 'available_listings')?.count,
      7
    );

    const resultSource = readFileSync(
      join(here, '../components/ActivityReportResult.tsx'),
      'utf8'
    );
    assert.ok(resultSource.includes('activityReportResultView'));
    assert.ok(resultSource.includes('activityReportSummaryTotalForDisplay'));
    assert.equal(resultSource.includes('reduce('), false);
    assert.equal(resultSource.includes('fetch('), false);
    assert.equal(resultSource.includes('api.'), false);
  });

  test('has_data false shows approved no-data message; zero does not crash', () => {
    const empty = buildActivityReport(
      emptyActivityMetricCounts(),
      defaultActivityFilters(),
      '2026-08-09T18:00:00.000Z'
    );
    assert.equal(empty.has_data, false);
    assert.equal(empty.summary_total, 0);

    const view = activityReportResultView(empty);
    assert.equal(view.show_no_data, true);
    assert.equal(view.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.equal(
      view.no_data_message,
      'No platform activity matches the selected filters.'
    );
    assert.equal(view.summary_total, 0);

    const zeroWidget = activityMetricWidgetView({
      key: 'total_reviews',
      label: 'Total reviews',
      count: 0,
    });
    assert.equal(zeroWidget.countText, '0');
  });

  test('widget display contracts exclude sensitive information', () => {
    const report = buildActivityReport(
      { total_reports: 2, open_reports: 2 },
      { ...defaultActivityFilters(), activity_scope: 'reports' }
    );
    const view = activityReportResultView(report);
    assert.equal(activityWidgetDisplayContainsSensitiveField(view), false);

    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in view, false, field);
      assert.equal(
        JSON.stringify(view).includes(`"${field}"`),
        false,
        field
      );
    }

    assert.equal(
      activityWidgetDisplayContainsSensitiveField({
        ...view,
        email: 'hidden@mycentennialcollege.ca',
      }),
      true
    );
  });
});

describe('US-24.3 activity dashboard widget regression', () => {
  test('Activity Monitoring remains on /admin with widgets and connected activity API', () => {
    assert.equal(ACTIVITY_DASHBOARD_PATH, '/admin');

    const adminSource = readFileSync(join(here, '../pages/AdminPage.tsx'), 'utf8');
    const dashboardSource = readFileSync(
      join(here, '../components/ActivityDashboard.tsx'),
      'utf8'
    );

    assert.ok(adminSource.includes('ActivityDashboard'));
    assert.ok(adminSource.includes('Pending accounts'));
    assert.ok(adminSource.includes('ModerationQueue'));
    assert.ok(dashboardSource.includes('ActivityMetricWidget'));
    assert.ok(dashboardSource.includes('ActivityReportResult'));
    assert.ok(dashboardSource.includes('getVisibleMetricRows'));
    assert.ok(
      dashboardSource.includes(ACTIVITY_GENERATE_REPORT_LABEL) ||
        dashboardSource.includes('ACTIVITY_GENERATE_REPORT_LABEL')
    );
    assert.ok(dashboardSource.includes('api.getAdminActivity') || dashboardSource.includes('getAdminActivity'));
    assert.equal(dashboardSource.includes('attemptActivityReportGenerationUi'), false);
    assert.equal(dashboardSource.includes('fetch('), false);
  });
});
