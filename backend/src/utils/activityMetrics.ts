/**
 * US-24.1 — administrator platform activity metrics and report field design.
 *
 * Team6 TAC US-24:
 *   As a System Administration Team member, I can monitor platform activity
 *   and generate reports so that I can manage and improve platform operations.
 *
 * Notes:
 *   - Activity reports summarize platform usage.
 *   - Dashboard supports filtering and reporting functions.
 *   - Reports assist administrative decision-making and monitoring.
 *
 * Authorization (later tasks — do not weaken):
 *   authenticate + requireAdmin on /api/admin/* activity routes.
 *   UI: ProtectedRoute requireAdmin. Students must never access monitoring.
 *
 * UI placement (US-24.2):
 *   Extend the existing Admin Dashboard (/admin, AdminPage) — do not invent a
 *   separate admin product. Prefer an Activity / Reports section beside
 *   verification and moderation.
 *
 * Supported data sources (existing models only):
 *   User            — role, verification_status, status, created_at
 *   Listing         — availability, category, created_at, updated_at
 *   RentalRequest   — status pending|accepted|declined|cancelled|completed,
 *                     created_at, updated_at
 *   Report          — status open|resolved|dismissed, created_at
 *   Review          — created_at (no lifecycle status)
 *   Conversation    — created_at, updated_at
 *   Message         — created_at (body never included in reports)
 *
 * Date-range filtering uses each collection's created_at (universally present).
 * Do not invent resolved_at / completed_at columns that do not exist.
 * RentalRequest.start_date / end_date are rental period fields — not the
 * activity-event timestamp for this report.
 *
 * Aggregation implementation: backend/src/utils/activityAggregation.ts (US-24.4/5).
 * Admin endpoint: GET /api/admin/activity (authenticate + requireAdmin).
 * Query filters: start_date, end_date, activity_scope, listing_category (US-24.5).
 * Frontend integration: US-24.6 (#184).
 */

import { LISTING_CATEGORIES, type ListingCategory } from './validation';

/** Stable metric keys derived from real CampusRent model statuses/counts. */
export const ACTIVITY_METRIC_KEYS = [
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
] as const;

export type ActivityMetricKey = (typeof ACTIVITY_METRIC_KEYS)[number];

export const ACTIVITY_METRIC_LABELS: Record<ActivityMetricKey, string> = {
  total_registered_students: 'Registered students',
  verified_students: 'Verified students',
  pending_students: 'Pending students',
  rejected_students: 'Rejected students',
  suspended_users: 'Suspended users',
  total_listings: 'Total listings',
  available_listings: 'Available listings',
  unavailable_listings: 'Unavailable listings',
  total_rental_requests: 'Total rental requests',
  pending_rental_requests: 'Pending rental requests',
  accepted_rental_requests: 'Accepted rental requests',
  declined_rental_requests: 'Declined rental requests',
  cancelled_rental_requests: 'Cancelled rental requests',
  completed_rental_requests: 'Completed rental requests',
  total_reports: 'Total reports',
  open_reports: 'Open reports',
  resolved_reports: 'Resolved reports',
  dismissed_reports: 'Dismissed reports',
  total_reviews: 'Total reviews',
  total_conversations: 'Total conversations',
  total_messages: 'Total messages',
};

/**
 * Which model/status each metric counts against.
 * Aggregation (US-24.3) must follow these bindings — no invented statuses.
 */
export const ACTIVITY_METRIC_SOURCES: Record<
  ActivityMetricKey,
  {
    collection:
      | 'users'
      | 'listings'
      | 'rental_requests'
      | 'reports'
      | 'reviews'
      | 'conversations'
      | 'messages';
    /** Human-readable filter description for implementers. */
    criteria: string;
  }
> = {
  total_registered_students: {
    collection: 'users',
    criteria: "role === 'student'",
  },
  verified_students: {
    collection: 'users',
    criteria: "role === 'student' && verification_status === 'verified'",
  },
  pending_students: {
    collection: 'users',
    criteria: "role === 'student' && verification_status === 'pending'",
  },
  rejected_students: {
    collection: 'users',
    criteria: "role === 'student' && verification_status === 'rejected'",
  },
  suspended_users: {
    collection: 'users',
    criteria: "status === 'suspended'",
  },
  total_listings: { collection: 'listings', criteria: 'all listings' },
  available_listings: {
    collection: 'listings',
    criteria: "availability === 'available'",
  },
  unavailable_listings: {
    collection: 'listings',
    criteria: "availability === 'unavailable'",
  },
  total_rental_requests: {
    collection: 'rental_requests',
    criteria: 'all rental requests',
  },
  pending_rental_requests: {
    collection: 'rental_requests',
    criteria: "status === 'pending'",
  },
  accepted_rental_requests: {
    collection: 'rental_requests',
    criteria: "status === 'accepted'",
  },
  declined_rental_requests: {
    collection: 'rental_requests',
    criteria: "status === 'declined'",
  },
  cancelled_rental_requests: {
    collection: 'rental_requests',
    criteria: "status === 'cancelled'",
  },
  completed_rental_requests: {
    collection: 'rental_requests',
    criteria: "status === 'completed'",
  },
  total_reports: { collection: 'reports', criteria: 'all reports' },
  open_reports: {
    collection: 'reports',
    criteria: "status === 'open'",
  },
  resolved_reports: {
    collection: 'reports',
    criteria: "status === 'resolved'",
  },
  dismissed_reports: {
    collection: 'reports',
    criteria: "status === 'dismissed'",
  },
  total_reviews: { collection: 'reviews', criteria: 'all reviews' },
  total_conversations: {
    collection: 'conversations',
    criteria: 'all conversations',
  },
  total_messages: { collection: 'messages', criteria: 'all messages' },
};

/** Metric groups an administrator may filter the dashboard/report by. */
export const ACTIVITY_SCOPES = [
  'all',
  'users',
  'listings',
  'rental_requests',
  'reports',
  'reviews',
  'messaging',
] as const;

export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];

export const ACTIVITY_SCOPE_LABELS: Record<ActivityScope, string> = {
  all: 'All activity',
  users: 'Users',
  listings: 'Listings',
  rental_requests: 'Rental requests',
  reports: 'Reports',
  reviews: 'Reviews',
  messaging: 'Messaging',
};

export const ACTIVITY_SCOPE_METRICS: Record<ActivityScope, readonly ActivityMetricKey[]> = {
  all: ACTIVITY_METRIC_KEYS,
  users: [
    'total_registered_students',
    'verified_students',
    'pending_students',
    'rejected_students',
    'suspended_users',
  ],
  listings: ['total_listings', 'available_listings', 'unavailable_listings'],
  rental_requests: [
    'total_rental_requests',
    'pending_rental_requests',
    'accepted_rental_requests',
    'declined_rental_requests',
    'cancelled_rental_requests',
    'completed_rental_requests',
  ],
  reports: ['total_reports', 'open_reports', 'resolved_reports', 'dismissed_reports'],
  reviews: ['total_reviews'],
  messaging: ['total_conversations', 'total_messages'],
};

/**
 * Non-overlapping base metric keys used for summary_total / has_data.
 *
 * Status breakdowns (available/unavailable, pending/accepted/…, open/resolved/…)
 * are display rows only — never summed into summary_total, or the same records
 * would be double-counted.
 *
 * Messaging keeps both conversations and messages because they are distinct
 * collections, not status slices of one another.
 */
export const ACTIVITY_SUMMARY_BASE_METRICS: Record<
  ActivityScope,
  readonly ActivityMetricKey[]
> = {
  all: [
    'total_registered_students',
    'total_listings',
    'total_rental_requests',
    'total_reports',
    'total_reviews',
    'total_conversations',
    'total_messages',
  ],
  users: ['total_registered_students'],
  listings: ['total_listings'],
  rental_requests: ['total_rental_requests'],
  reports: ['total_reports'],
  reviews: ['total_reviews'],
  messaging: ['total_conversations', 'total_messages'],
};

/** Listing categories from validation.ts — optional listing-scope filter. */
export const ACTIVITY_LISTING_CATEGORIES = LISTING_CATEGORIES;
export type ActivityListingCategory = ListingCategory;

/**
 * Administrator activity filters.
 * Dates are calendar dates (YYYY-MM-DD); later aggregation maps them onto
 * created_at inclusive ranges in UTC.
 */
export interface ActivityReportFilters {
  start_date: string | null;
  end_date: string | null;
  activity_scope: ActivityScope;
  /**
   * When set, listing metrics are limited to this category.
   * Allowed only with activity_scope=all or activity_scope=listings.
   * Under all, non-listing metrics stay global (no cross-collection joins).
   * Incompatible single scopes (users, rental_requests, …) are rejected.
   */
  listing_category: ActivityListingCategory | null;
}

export type ActivityMetricCounts = Record<ActivityMetricKey, number>;

export interface ActivityMetricRow {
  key: ActivityMetricKey;
  label: string;
  count: number;
}

/**
 * Generated administrative activity summary — not a raw database dump.
 * Intentionally excludes passwords, tokens, message bodies, report narratives,
 * and personal identity lists.
 */
export interface ActivityReport {
  generated_at: string;
  filters: ActivityReportFilters;
  metrics: ActivityMetricRow[];
  /**
   * Non-overlapping count of top-level activity records for the selected scope.
   * Uses ACTIVITY_SUMMARY_BASE_METRICS only — never sums status breakdown rows.
   */
  summary_total: number;
  /** True when summary_total > 0 for the selected scope. */
  has_data: boolean;
  /** Present when has_data is false — never treated as a server error. */
  no_data_message: string | null;
}

/** Fields that must never appear on an activity report payload. */
export const ACTIVITY_REPORT_EXCLUDED_FIELDS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'authorization',
  'secret',
  'mongodb_uri',
  'message_body',
  'body',
  'email',
  'phone',
  'first_name',
  'last_name',
  'reporter_id',
  'reason',
  'details',
  'comment',
] as const;

export type ActivityReportExcludedField =
  (typeof ACTIVITY_REPORT_EXCLUDED_FIELDS)[number];

export const ACTIVITY_NO_DATA_MESSAGE =
  'No platform activity matches the selected filters.';

export const ACTIVITY_DATE_FORMAT_MESSAGE =
  'Dates must use YYYY-MM-DD format.';

export const ACTIVITY_DATE_RANGE_ORDER_MESSAGE =
  'Start date cannot be after end date.';

export const ACTIVITY_SCOPE_INVALID_MESSAGE =
  'Activity scope must be one of: all, users, listings, rental_requests, reports, reviews, messaging.';

export const ACTIVITY_CATEGORY_INVALID_MESSAGE =
  'Listing category filter is not supported.';

export const ACTIVITY_CATEGORY_SCOPE_MESSAGE =
  'listing_category can only be used with activity_scope=all or activity_scope=listings.';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isActivityMetricKey(value: string): value is ActivityMetricKey {
  return (ACTIVITY_METRIC_KEYS as readonly string[]).includes(value);
}

export function isActivityScope(value: unknown): value is ActivityScope {
  return (
    typeof value === 'string' &&
    (ACTIVITY_SCOPES as readonly string[]).includes(value)
  );
}

export function isActivityListingCategory(
  value: unknown
): value is ActivityListingCategory {
  return (
    typeof value === 'string' &&
    (ACTIVITY_LISTING_CATEGORIES as readonly string[]).includes(value)
  );
}

export function emptyActivityMetricCounts(): ActivityMetricCounts {
  return ACTIVITY_METRIC_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as ActivityMetricCounts);
}

export function metricsForScope(scope: ActivityScope): readonly ActivityMetricKey[] {
  return ACTIVITY_SCOPE_METRICS[scope];
}

export function summaryBaseMetricsForScope(
  scope: ActivityScope
): readonly ActivityMetricKey[] {
  return ACTIVITY_SUMMARY_BASE_METRICS[scope];
}

/**
 * Sum only non-overlapping base totals for the scope.
 * Never includes status/category breakdown rows.
 */
export function computeActivitySummaryTotal(
  counts: Partial<Record<ActivityMetricKey, number>>,
  scope: ActivityScope = 'all'
): number {
  return summaryBaseMetricsForScope(scope).reduce(
    (sum, key) => sum + (counts[key] ?? 0),
    0
  );
}

/** True when the non-overlapping summary_total for the scope is greater than zero. */
export function activityMetricsHaveData(
  counts: Partial<Record<ActivityMetricKey, number>>,
  scope: ActivityScope = 'all'
): boolean {
  return computeActivitySummaryTotal(counts, scope) > 0;
}

/**
 * Normalize a YYYY-MM-DD calendar date (or blank → null).
 * Does not invent timestamps.
 */
export function normalizeActivityDateInput(raw: unknown): {
  value: string | null;
  error: string;
} {
  if (raw == null || raw === '') {
    return { value: null, error: '' };
  }
  if (typeof raw !== 'string') {
    return { value: null, error: ACTIVITY_DATE_FORMAT_MESSAGE };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: '' };
  }
  if (!ISO_DATE_RE.test(trimmed)) {
    return { value: null, error: ACTIVITY_DATE_FORMAT_MESSAGE };
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { value: null, error: ACTIVITY_DATE_FORMAT_MESSAGE };
  }
  return { value: trimmed, error: '' };
}

/**
 * Build an inclusive UTC created_at range from calendar dates.
 * end_date covers the full UTC day (23:59:59.999).
 * Aggregation may use an equivalent exclusive next-day upper bound.
 */
export function activityDateRangeBounds(
  startDate: string | null,
  endDate: string | null
): { range_start: Date | null; range_end: Date | null } {
  let range_start: Date | null = null;
  let range_end: Date | null = null;

  if (startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    range_start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }
  if (endDate) {
    const [y, m, d] = endDate.split('-').map(Number);
    range_end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  return { range_start, range_end };
}

/**
 * Mongo created_at predicate for inclusive calendar-day filters.
 * Uses $gte start-of-day and exclusive $lt next-day when end_date is set.
 */
export function activityCreatedAtMongoFilter(
  startDate: string | null,
  endDate: string | null
): { created_at: { $gte?: Date; $lt?: Date } } | Record<string, never> {
  const created_at: { $gte?: Date; $lt?: Date } = {};

  if (startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    created_at.$gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }
  if (endDate) {
    const [y, m, d] = endDate.split('-').map(Number);
    created_at.$lt = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  }

  return Object.keys(created_at).length > 0 ? { created_at } : {};
}

export function normalizeActivityFilters(input: {
  start_date?: unknown;
  end_date?: unknown;
  activity_scope?: unknown;
  listing_category?: unknown;
}): { filters: ActivityReportFilters; error: string } {
  const start = normalizeActivityDateInput(input.start_date);
  if (start.error) {
    return {
      filters: defaultActivityFilters(),
      error: start.error,
    };
  }
  const end = normalizeActivityDateInput(input.end_date);
  if (end.error) {
    return {
      filters: defaultActivityFilters(),
      error: end.error,
    };
  }

  if (start.value && end.value && start.value > end.value) {
    return {
      filters: defaultActivityFilters(),
      error: ACTIVITY_DATE_RANGE_ORDER_MESSAGE,
    };
  }

  let scope: ActivityScope = 'all';
  if (input.activity_scope != null && input.activity_scope !== '') {
    if (!isActivityScope(input.activity_scope)) {
      return {
        filters: defaultActivityFilters(),
        error: ACTIVITY_SCOPE_INVALID_MESSAGE,
      };
    }
    scope = input.activity_scope;
  }

  let listing_category: ActivityListingCategory | null = null;
  if (input.listing_category != null && input.listing_category !== '') {
    if (!isActivityListingCategory(input.listing_category)) {
      return {
        filters: defaultActivityFilters(),
        error: ACTIVITY_CATEGORY_INVALID_MESSAGE,
      };
    }
    listing_category = input.listing_category;
  }

  if (
    listing_category &&
    scope !== 'all' &&
    scope !== 'listings'
  ) {
    return {
      filters: defaultActivityFilters(),
      error: ACTIVITY_CATEGORY_SCOPE_MESSAGE,
    };
  }

  return {
    filters: {
      start_date: start.value,
      end_date: end.value,
      activity_scope: scope,
      listing_category,
    },
    error: '',
  };
}

export function defaultActivityFilters(): ActivityReportFilters {
  return {
    start_date: null,
    end_date: null,
    activity_scope: 'all',
    listing_category: null,
  };
}

export function buildActivityMetricRows(
  counts: Partial<Record<ActivityMetricKey, number>>,
  scope: ActivityScope = 'all'
): ActivityMetricRow[] {
  return metricsForScope(scope).map((key) => ({
    key,
    label: ACTIVITY_METRIC_LABELS[key],
    count: counts[key] ?? 0,
  }));
}

/**
 * Pure report assembler for later aggregation/API tasks.
 * summary_total / has_data use non-overlapping base totals only.
 * Zero matching activity → has_data false + no_data_message (not an error).
 */
export function buildActivityReport(
  counts: Partial<Record<ActivityMetricKey, number>>,
  filters: ActivityReportFilters,
  generatedAt: Date | string = new Date()
): ActivityReport {
  const metrics = buildActivityMetricRows(counts, filters.activity_scope);
  const summary_total = computeActivitySummaryTotal(
    counts,
    filters.activity_scope
  );
  const has_data = summary_total > 0;

  return {
    generated_at:
      typeof generatedAt === 'string'
        ? generatedAt
        : generatedAt.toISOString(),
    filters: { ...filters },
    metrics,
    summary_total,
    has_data,
    no_data_message: has_data ? null : ACTIVITY_NO_DATA_MESSAGE,
  };
}

export function activityReportKeys(report: ActivityReport): string[] {
  const filterKeys = Object.keys(report.filters);
  const metricKeys = report.metrics.flatMap((row) => Object.keys(row));
  return [
    ...Object.keys(report),
    ...filterKeys.map((key) => `filters.${key}`),
    ...metricKeys,
  ];
}

/** True when a report object (or nested plain object) contains a forbidden key. */
export function activityReportContainsSensitiveField(
  value: unknown,
  seen = new Set<unknown>()
): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => activityReportContainsSensitiveField(item, seen));
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      (ACTIVITY_REPORT_EXCLUDED_FIELDS as readonly string[]).includes(key) ||
      /password|token|secret|mongodb_uri/i.test(key)
    ) {
      return true;
    }
    if (activityReportContainsSensitiveField(child, seen)) {
      return true;
    }
  }
  return false;
}
