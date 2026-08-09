/**
 * US-24.1 — activity metrics / filter / report-field design helpers.
 * Pure logic only; no MongoDB aggregation or admin API.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ACTIVITY_LISTING_CATEGORIES,
  ACTIVITY_METRIC_KEYS,
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_METRIC_SOURCES,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_EXCLUDED_FIELDS,
  ACTIVITY_SCOPES,
  ACTIVITY_SCOPE_METRICS,
  ACTIVITY_SUMMARY_BASE_METRICS,
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
} from '../src/utils/activityMetrics';
import { LISTING_CATEGORIES } from '../src/utils/validation';

describe('US-24.1 activity metric definitions', () => {
  test('allowed metric keys are stable and sourced from real CampusRent statuses', () => {
    assert.deepEqual(ACTIVITY_METRIC_KEYS, [
      'total_registered_students',
      'verified_students',
      'pending_students',
      'rejected_students',
      'suspended_users',
      'total_listings',
      'available_listings',
      'unavailable_listings',
      'total_rental_requests',
      'pending_rental_requests',
      'accepted_rental_requests',
      'declined_rental_requests',
      'cancelled_rental_requests',
      'completed_rental_requests',
      'total_reports',
      'open_reports',
      'resolved_reports',
      'dismissed_reports',
      'total_reviews',
      'total_conversations',
      'total_messages',
    ]);

    for (const key of ACTIVITY_METRIC_KEYS) {
      assert.equal(isActivityMetricKey(key), true, key);
      assert.ok(ACTIVITY_METRIC_LABELS[key], key);
      assert.ok(ACTIVITY_METRIC_SOURCES[key], key);
    }

    assert.equal(isActivityMetricKey('revenue'), false);
    assert.equal(isActivityMetricKey('rejected_rental_requests'), false);
    assert.match(ACTIVITY_METRIC_SOURCES.declined_rental_requests.criteria, /declined/);
    assert.match(ACTIVITY_METRIC_SOURCES.available_listings.criteria, /available/);
    assert.match(ACTIVITY_METRIC_SOURCES.open_reports.criteria, /open/);
  });

  test('scopes and listing categories match supported filter fields', () => {
    assert.deepEqual(ACTIVITY_SCOPES, [
      'all',
      'users',
      'listings',
      'rental_requests',
      'reports',
      'reviews',
      'messaging',
    ]);
    assert.equal(isActivityScope('all'), true);
    assert.equal(isActivityScope('payments'), false);
    assert.deepEqual(ACTIVITY_LISTING_CATEGORIES, LISTING_CATEGORIES);
    assert.deepEqual(
      [...ACTIVITY_SCOPE_METRICS.all],
      [...ACTIVITY_METRIC_KEYS]
    );
    assert.ok(metricsForScope('reports').includes('open_reports'));
    assert.equal(metricsForScope('reviews').includes('total_messages'), false);
  });
});

describe('US-24.1 activity filter normalization', () => {
  test('date-range helpers accept YYYY-MM-DD and reject invalid / inverted ranges', () => {
    assert.deepEqual(normalizeActivityDateInput('2026-08-01'), {
      value: '2026-08-01',
      error: '',
    });
    assert.deepEqual(normalizeActivityDateInput(''), {
      value: null,
      error: '',
    });
    assert.match(normalizeActivityDateInput('08/01/2026').error, /YYYY-MM-DD/);
    assert.match(normalizeActivityDateInput('2026-02-31').error, /YYYY-MM-DD/);

    const bounds = activityDateRangeBounds('2026-08-01', '2026-08-09');
    assert.equal(bounds.range_start!.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(bounds.range_end!.toISOString(), '2026-08-09T23:59:59.999Z');

    const ok = normalizeActivityFilters({
      start_date: '2026-08-01',
      end_date: '2026-08-09',
      activity_scope: 'listings',
      listing_category: 'Electronics',
    });
    assert.equal(ok.error, '');
    assert.deepEqual(ok.filters, {
      start_date: '2026-08-01',
      end_date: '2026-08-09',
      activity_scope: 'listings',
      listing_category: 'Electronics',
    });

    const allWithCategory = normalizeActivityFilters({
      activity_scope: 'all',
      listing_category: 'Electronics',
    });
    assert.equal(allWithCategory.error, '');
    assert.equal(allWithCategory.filters.listing_category, 'Electronics');

    const inverted = normalizeActivityFilters({
      start_date: '2026-08-10',
      end_date: '2026-08-01',
    });
    assert.match(inverted.error, /Start date cannot be after end date/);

    const badCategory = normalizeActivityFilters({
      listing_category: 'Spaceships',
    });
    assert.match(badCategory.error, /category/i);

    const badScope = normalizeActivityFilters({ activity_scope: 'payments' });
    assert.match(badScope.error, /Activity scope must be one of/i);

    const incompatible = normalizeActivityFilters({
      activity_scope: 'users',
      listing_category: 'Electronics',
    });
    assert.match(incompatible.error, /listing_category can only be used/i);
  });
});

describe('US-24.1 activity report shape and no-data behavior', () => {
  test('report includes generated timestamp, filters, metric rows; excludes sensitive fields', () => {
    const counts = emptyActivityMetricCounts();
    counts.total_registered_students = 12;
    counts.verified_students = 8;
    counts.pending_students = 3;
    counts.total_listings = 20;
    counts.available_listings = 15;
    counts.total_reports = 2;
    counts.open_reports = 2;

    const report = buildActivityReport(
      counts,
      {
        ...defaultActivityFilters(),
        start_date: '2026-08-01',
        end_date: '2026-08-09',
        activity_scope: 'all',
      },
      '2026-08-09T17:00:00.000Z'
    );

    assert.equal(report.generated_at, '2026-08-09T17:00:00.000Z');
    assert.equal(report.filters.start_date, '2026-08-01');
    assert.equal(report.filters.end_date, '2026-08-09');
    assert.equal(report.has_data, true);
    assert.equal(report.no_data_message, null);
    // Base totals only: 12 + 20 + 2 (not verified/pending/available/open breakdowns).
    assert.equal(report.summary_total, 34);
    assert.equal(report.metrics.length, ACTIVITY_METRIC_KEYS.length);
    assert.equal(
      report.metrics.find((row) => row.key === 'verified_students')?.count,
      8
    );
    assert.equal(activityReportContainsSensitiveField(report), false);

    for (const field of ACTIVITY_REPORT_EXCLUDED_FIELDS) {
      assert.equal(field in report, false, field);
      assert.equal(field in report.filters, false, field);
    }

    const poisoned = {
      ...report,
      password_hash: 'secret',
    };
    assert.equal(activityReportContainsSensitiveField(poisoned), true);
  });

  test('summary_total does not double-count status breakdown rows', () => {
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.all, [
      'total_registered_students',
      'total_listings',
      'total_rental_requests',
      'total_reports',
      'total_reviews',
      'total_conversations',
      'total_messages',
    ]);
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.listings, ['total_listings']);
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.rental_requests, [
      'total_rental_requests',
    ]);
    assert.deepEqual(ACTIVITY_SUMMARY_BASE_METRICS.reports, ['total_reports']);

    const listings = emptyActivityMetricCounts();
    listings.total_listings = 10;
    listings.available_listings = 7;
    listings.unavailable_listings = 3;
    const listingsReport = buildActivityReport(listings, {
      ...defaultActivityFilters(),
      activity_scope: 'listings',
    });
    assert.equal(listingsReport.summary_total, 10);
    assert.notEqual(
      listingsReport.summary_total,
      10 + 7 + 3,
      'must not sum total + available + unavailable'
    );
    assert.equal(listingsReport.has_data, true);

    const requests = emptyActivityMetricCounts();
    requests.total_rental_requests = 6;
    requests.pending_rental_requests = 2;
    requests.accepted_rental_requests = 1;
    requests.declined_rental_requests = 1;
    requests.cancelled_rental_requests = 1;
    requests.completed_rental_requests = 1;
    assert.equal(computeActivitySummaryTotal(requests, 'rental_requests'), 6);
    assert.equal(
      buildActivityReport(requests, {
        ...defaultActivityFilters(),
        activity_scope: 'rental_requests',
      }).summary_total,
      6
    );

    const reportsOnly = emptyActivityMetricCounts();
    reportsOnly.total_reports = 5;
    reportsOnly.open_reports = 4;
    reportsOnly.resolved_reports = 1;
    const reportsReport = buildActivityReport(reportsOnly, {
      ...defaultActivityFilters(),
      activity_scope: 'reports',
    });
    assert.equal(reportsReport.summary_total, 5);
    assert.notEqual(reportsReport.summary_total, 5 + 4 + 1);

    // Breakdown-only rows without the base total do not invent has_data.
    const breakdownOnly = {
      available_listings: 9,
      unavailable_listings: 1,
      open_reports: 3,
      pending_rental_requests: 4,
    };
    assert.equal(computeActivitySummaryTotal(breakdownOnly, 'all'), 0);
    assert.equal(activityMetricsHaveData(breakdownOnly, 'listings'), false);
    assert.equal(
      buildActivityReport(breakdownOnly, {
        ...defaultActivityFilters(),
        activity_scope: 'listings',
      }).has_data,
      false
    );
  });

  test('zero matching activity yields no-data message, not an error shape', () => {
    assert.equal(activityMetricsHaveData(emptyActivityMetricCounts()), false);

    const empty = buildActivityReport(
      emptyActivityMetricCounts(),
      defaultActivityFilters(),
      '2026-08-09T17:00:00.000Z'
    );

    assert.equal(empty.has_data, false);
    assert.equal(empty.summary_total, 0);
    assert.equal(empty.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
    assert.equal(
      empty.no_data_message,
      'No platform activity matches the selected filters.'
    );
    assert.equal(activityReportContainsSensitiveField(empty), false);

    const scopedZero = buildActivityReport(
      { total_listings: 5, available_listings: 5 },
      { ...defaultActivityFilters(), activity_scope: 'reviews' }
    );
    assert.equal(scopedZero.has_data, false);
    assert.equal(scopedZero.summary_total, 0);
    assert.equal(scopedZero.metrics.length, 1);
    assert.equal(scopedZero.metrics[0].key, 'total_reviews');
    assert.equal(scopedZero.no_data_message, ACTIVITY_NO_DATA_MESSAGE);
  });
});
