/**
 * US-24.1 — activity metrics / filter / report-field design helpers.
 * Pure logic only; no React DOM, aggregation API, or dashboard widgets.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ACTIVITY_DASHBOARD_PATH,
  ACTIVITY_LISTING_CATEGORIES,
  ACTIVITY_METRIC_KEYS,
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  ACTIVITY_SECTION_LABEL,
  ACTIVITY_SCOPES,
  ACTIVITY_SUMMARY_BASE_METRICS,
  ACTIVITY_WORKFLOW_STEPS,
  activityDateRangeBounds,
  activityMetricsHaveData,
  activityReportContainsSensitiveField,
  buildActivityReport,
  computeActivitySummaryTotal,
  defaultActivityFilters,
  emptyActivityMetricCounts,
  isActivityMetricKey,
  isActivityScope,
  metricsForScope,
  normalizeActivityDateInput,
  normalizeActivityFilters,
} from './activityMetrics';

describe('US-24.1 activity metric and filter design', () => {
  test('metric keys, scopes, and admin entry surface are defined for later dashboard work', () => {
    assert.equal(ACTIVITY_DASHBOARD_PATH, '/admin');
    assert.equal(ACTIVITY_SECTION_LABEL, 'Platform activity');
    assert.ok(ACTIVITY_WORKFLOW_STEPS.includes('open_activity_dashboard'));
    assert.ok(ACTIVITY_WORKFLOW_STEPS.includes('apply_filters'));
    assert.ok(ACTIVITY_WORKFLOW_STEPS.includes('generate_activity_report'));
    assert.ok(ACTIVITY_WORKFLOW_STEPS.includes('display_no_data_when_empty'));

    assert.equal(ACTIVITY_METRIC_KEYS.length, 21);
    assert.equal(isActivityMetricKey('total_registered_students'), true);
    assert.equal(isActivityMetricKey('declined_rental_requests'), true);
    assert.equal(isActivityMetricKey('rejected_rental_requests'), false);
    assert.equal(ACTIVITY_METRIC_LABELS.declined_rental_requests, 'Declined rental requests');
    assert.deepEqual(ACTIVITY_SCOPES[0], 'all');
    assert.equal(isActivityScope('messaging'), true);
    assert.equal(isActivityScope('revenue'), false);
    assert.ok(ACTIVITY_LISTING_CATEGORIES.includes('Electronics'));
    assert.deepEqual(
      [...metricsForScope('users')],
      [
        'total_registered_students',
        'verified_students',
        'pending_students',
        'rejected_students',
        'suspended_users',
      ]
    );
  });

  test('date and category filter normalization rejects invalid inputs', () => {
    assert.equal(normalizeActivityDateInput('2026-08-09').value, '2026-08-09');
    assert.match(normalizeActivityDateInput('not-a-date').error, /YYYY-MM-DD/);

    const bounds = activityDateRangeBounds('2026-01-01', '2026-01-01');
    assert.equal(bounds.range_start!.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(bounds.range_end!.toISOString(), '2026-01-01T23:59:59.999Z');

    const inverted = normalizeActivityFilters({
      start_date: '2026-08-10',
      end_date: '2026-08-01',
    });
    assert.match(inverted.error, /Start date cannot be after end date/);

    const ok = normalizeActivityFilters({
      start_date: '2026-08-01',
      end_date: '2026-08-09',
      activity_scope: 'reports',
      listing_category: 'Textbooks',
    });
    assert.equal(ok.error, '');
    assert.equal(ok.filters.activity_scope, 'reports');
    assert.equal(ok.filters.listing_category, 'Textbooks');
  });

  test('activity report shape excludes sensitive fields; empty filter yields no-data message', () => {
    const counts = emptyActivityMetricCounts();
    counts.open_reports = 4;
    counts.resolved_reports = 1;
    counts.total_reports = 5;

    const report = buildActivityReport(
      counts,
      {
        ...defaultActivityFilters(),
        activity_scope: 'reports',
        start_date: '2026-08-01',
        end_date: '2026-08-09',
      },
      '2026-08-09T18:00:00.000Z'
    );

    assert.equal(report.generated_at, '2026-08-09T18:00:00.000Z');
    assert.equal(report.has_data, true);
    assert.equal(report.no_data_message, null);
    assert.equal(report.metrics.length, 4);
    // Non-overlapping base total for reports scope — not 5+4+1.
    assert.equal(report.summary_total, 5);
    assert.equal(activityReportContainsSensitiveField(report), false);

    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(JSON.stringify(report).includes(`"${field}"`), false, field);
    }

    assert.equal(activityMetricsHaveData(emptyActivityMetricCounts()), false);
    const empty = buildActivityReport(emptyActivityMetricCounts(), defaultActivityFilters());
    assert.equal(empty.has_data, false);
    assert.equal(empty.summary_total, 0);
    assert.equal(empty.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.equal(
      empty.no_data_message,
      'No platform activity matches the selected filters.'
    );

    assert.equal(
      activityReportContainsSensitiveField({
        ...empty,
        metrics: [{ key: 'total_reviews', label: 'Total reviews', count: 0, email: 'x@y.z' }],
      }),
      true
    );
  });

  test('summary_total does not double-count breakdown metrics; has_data follows base totals', () => {
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.listings, ['total_listings']);
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.rental_requests, [
      'total_rental_requests',
    ]);

    const listings = emptyActivityMetricCounts();
    listings.total_listings = 10;
    listings.available_listings = 7;
    listings.unavailable_listings = 3;
    assert.equal(computeActivitySummaryTotal(listings, 'listings'), 10);
    assert.equal(
      buildActivityReport(listings, {
        ...defaultActivityFilters(),
        activity_scope: 'listings',
      }).summary_total,
      10
    );

    const requests = emptyActivityMetricCounts();
    requests.total_rental_requests = 6;
    requests.pending_rental_requests = 2;
    requests.accepted_rental_requests = 2;
    requests.completed_rental_requests = 2;
    assert.equal(computeActivitySummaryTotal(requests, 'rental_requests'), 6);

    const all = emptyActivityMetricCounts();
    all.total_registered_students = 12;
    all.verified_students = 8;
    all.total_listings = 20;
    all.available_listings = 20;
    all.total_rental_requests = 6;
    all.pending_rental_requests = 6;
    all.total_reports = 5;
    all.open_reports = 5;
    all.total_reviews = 3;
    all.total_conversations = 4;
    all.total_messages = 9;
    const allReport = buildActivityReport(all, defaultActivityFilters());
    assert.equal(allReport.summary_total, 12 + 20 + 6 + 5 + 3 + 4 + 9);
    assert.notEqual(
      allReport.summary_total,
      Object.values(all).reduce((sum, value) => sum + value, 0)
    );
    assert.equal(allReport.has_data, true);

    assert.equal(
      activityMetricsHaveData(
        { available_listings: 3, open_reports: 2, pending_rental_requests: 1 },
        'all'
      ),
      false
    );
  });
});
