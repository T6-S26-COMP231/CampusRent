/**
 * US-24.2 — administrator activity-dashboard layout / presentation helpers.
 * Pure logic only; no React DOM framework.
 *
 * ActivityDashboard on AdminPage (/admin) is layout-only in this task:
 * filters do not update statistics, Generate report is not connected, and
 * no fabricated metric counts are shown.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  ACTIVITY_DASHBOARD_HEADING,
  ACTIVITY_DASHBOARD_LAYOUT_SECTIONS,
  ACTIVITY_DASHBOARD_PATH,
  ACTIVITY_END_DATE_LABEL,
  ACTIVITY_FILTERS_HEADING,
  ACTIVITY_GENERATE_REPORT_LABEL,
  ACTIVITY_LISTING_CATEGORIES,
  ACTIVITY_LISTING_CATEGORY_FILTER_LABEL,
  ACTIVITY_METRICS_HEADING,
  ACTIVITY_METRICS_PLACEHOLDER_LABEL,
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_HEADING,
  ACTIVITY_REPORT_NOT_CONNECTED_MESSAGE,
  ACTIVITY_SCOPE_FILTER_LABEL,
  ACTIVITY_SCOPE_LABELS,
  ACTIVITY_SCOPES,
  ACTIVITY_SECTION_LABEL,
  ACTIVITY_START_DATE_LABEL,
  ACTIVITY_STATISTICS_HEADING,
  activityDashboardUiStatus,
  activityLayoutDisplaysFabricatedCounts,
  activityListingCategorySelectOptions,
  activityMetricLayoutSlots,
  activityNoDataPresentation,
  activityScopeSelectOptions,
  attemptActivityReportGenerationUi,
  defaultActivityFilters,
  formatActivityFilterSummary,
} from './activityMetrics';

const here = dirname(fileURLToPath(import.meta.url));
const adminPageSource = readFileSync(
  join(here, '../pages/AdminPage.tsx'),
  'utf8'
);
const activityDashboardSource = readFileSync(
  join(here, '../components/ActivityDashboard.tsx'),
  'utf8'
);

describe('US-24.2 activity dashboard layout', () => {
  test('Activity Monitoring section and dashboard heading exist on AdminPage', () => {
    assert.equal(ACTIVITY_DASHBOARD_PATH, '/admin');
    assert.equal(ACTIVITY_SECTION_LABEL, 'Platform activity');
    assert.equal(ACTIVITY_DASHBOARD_HEADING, 'Platform activity');
    assert.ok(adminPageSource.includes('ActivityDashboard'));
    assert.ok(adminPageSource.includes('Pending accounts'));
    assert.ok(adminPageSource.includes('MODERATION_SECTION_LABEL'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_SECTION_LABEL'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_DASHBOARD_HEADING'));
    assert.ok(
      ACTIVITY_DASHBOARD_LAYOUT_SECTIONS.includes('heading') &&
        ACTIVITY_DASHBOARD_LAYOUT_SECTIONS.includes('filters') &&
        ACTIVITY_DASHBOARD_LAYOUT_SECTIONS.includes('metric_grid') &&
        ACTIVITY_DASHBOARD_LAYOUT_SECTIONS.includes('report') &&
        ACTIVITY_DASHBOARD_LAYOUT_SECTIONS.includes('no_data')
    );
  });

  test('filter layout exposes start date, end date, activity scope, and listing category', () => {
    assert.equal(ACTIVITY_START_DATE_LABEL, 'Start date');
    assert.equal(ACTIVITY_END_DATE_LABEL, 'End date');
    assert.equal(ACTIVITY_SCOPE_FILTER_LABEL, 'Activity scope');
    assert.equal(ACTIVITY_LISTING_CATEGORY_FILTER_LABEL, 'Listing category');
    assert.equal(ACTIVITY_FILTERS_HEADING, 'Activity filters');

    assert.ok(activityDashboardSource.includes('activity-start-date'));
    assert.ok(activityDashboardSource.includes('activity-end-date'));
    assert.ok(activityDashboardSource.includes('activity-scope'));
    assert.ok(activityDashboardSource.includes('activity-listing-category'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_FILTERS_HEADING'));

    const scopes = activityScopeSelectOptions();
    assert.deepEqual(
      scopes.map((option) => option.value),
      [...ACTIVITY_SCOPES]
    );
    assert.deepEqual(
      scopes.map((option) => option.label),
      ACTIVITY_SCOPES.map((scope) => ACTIVITY_SCOPE_LABELS[scope])
    );

    const categories = activityListingCategorySelectOptions();
    assert.equal(categories[0].value, '');
    assert.ok(
      ACTIVITY_LISTING_CATEGORIES.every((category) =>
        categories.some((option) => option.value === category)
      )
    );
  });

  test('metric grid/container and report section exist without fabricated statistics', () => {
    assert.equal(ACTIVITY_STATISTICS_HEADING, 'Platform statistics');
    assert.equal(ACTIVITY_METRICS_HEADING, 'Activity metrics');
    assert.equal(ACTIVITY_REPORT_HEADING, 'Activity summary');
    assert.equal(ACTIVITY_GENERATE_REPORT_LABEL, 'Generate report');
    assert.equal(ACTIVITY_METRICS_PLACEHOLDER_LABEL, 'Awaiting statistics');

    assert.ok(activityDashboardSource.includes('activity-metric-grid'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_STATISTICS_HEADING'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_REPORT_HEADING'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_GENERATE_REPORT_LABEL'));
    assert.ok(activityDashboardSource.includes('ACTIVITY_METRICS_PLACEHOLDER_LABEL'));

    const slots = activityMetricLayoutSlots('listings');
    assert.deepEqual(
      slots.map((slot) => slot.key),
      ['total_listings', 'available_listings', 'unavailable_listings']
    );
    assert.equal(
      activityLayoutDisplaysFabricatedCounts(
        slots.map(() => ACTIVITY_METRICS_PLACEHOLDER_LABEL)
      ),
      false
    );
    assert.equal(activityLayoutDisplaysFabricatedCounts([125, 42]), true);
    assert.equal(activityLayoutDisplaysFabricatedCounts(['125', '42']), true);
    assert.equal(activityLayoutDisplaysFabricatedCounts(['—', 'Awaiting statistics']), false);

    // Layout source must not hard-code fake platform counts.
    assert.equal(/\bUsers:\s*125\b/.test(activityDashboardSource), false);
    assert.equal(/\bListings:\s*42\b/.test(activityDashboardSource), false);
    assert.equal(activityDashboardSource.includes('Users: 125'), false);
    assert.equal(activityDashboardSource.includes('Listings: 42'), false);
  });

  test('no-data presentation uses approved wording and is not forced on by default', () => {
    const hidden = activityNoDataPresentation(false);
    assert.equal(hidden.visible, false);
    assert.equal(hidden.message, ACTIVITY_NO_DATA_MESSAGE);

    const shown = activityNoDataPresentation(true);
    assert.equal(shown.visible, true);
    assert.equal(
      shown.message,
      'No platform activity matches the selected filters.'
    );
    assert.ok(activityDashboardSource.includes('ACTIVITY_NO_DATA_MESSAGE'));
    assert.equal(activityDashboardUiStatus({}), 'layout');
    assert.equal(activityDashboardUiStatus({ showNoData: true }), 'no_data');
    assert.equal(activityDashboardUiStatus({ loading: true }), 'loading');
    assert.equal(activityDashboardUiStatus({ error: 'fail' }), 'error');
  });

  test('Generate report action is represented but not integrated', () => {
    const result = attemptActivityReportGenerationUi();
    assert.equal(result.report, null);
    assert.equal(result.success, '');
    assert.equal(result.notice, ACTIVITY_REPORT_NOT_CONNECTED_MESSAGE);
    assert.ok(activityDashboardSource.includes('attemptActivityReportGenerationUi'));
    assert.ok(
      activityDashboardSource.includes('Activity report generation is not connected yet') ||
        activityDashboardSource.includes('ACTIVITY_REPORT_NOT_CONNECTED_MESSAGE') ||
        activityDashboardSource.includes('reportNotice')
    );

    const summary = formatActivityFilterSummary(defaultActivityFilters());
    assert.match(summary, /All activity/);
    assert.match(summary, /All categories/);
  });

  test('existing admin verification/moderation UI remains; student pages unaffected by this layout helper', () => {
    assert.ok(adminPageSource.includes('Pending accounts'));
    assert.ok(adminPageSource.includes('verifyUser'));
    assert.ok(adminPageSource.includes('ModerationQueue'));
    assert.ok(adminPageSource.includes('ModerationReportDetail'));
    assert.ok(adminPageSource.includes('<ActivityDashboard'));

    const browseSource = readFileSync(join(here, '../pages/BrowsePage.tsx'), 'utf8');
    assert.equal(browseSource.includes('ActivityDashboard'), false);
    const homeSource = readFileSync(join(here, '../pages/HomePage.tsx'), 'utf8');
    assert.equal(homeSource.includes('ActivityDashboard'), false);
  });
});
