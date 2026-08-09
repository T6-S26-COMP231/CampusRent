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
 *   UI: ProtectedRoute requireAdmin + Layout admin nav (role === 'admin').
 *   API: authenticate + requireAdmin on /api/admin/* activity routes.
 *   Students must not reach monitoring screens; server must enforce independently.
 *
 * UI placement (US-24.2):
 *   Extend the existing Admin Dashboard (/admin, AdminPage) — do not create a
 *   separate admin app. Prefer:
 *     Admin Dashboard
 *     → Platform activity section
 *     → Filters (date range / activity scope / listing category)
 *     → Metric widgets
 *     → Generate activity summary
 *
 * Supported CampusRent data (do not invent statuses):
 *   User.verification_status: pending | verified | rejected
 *   User.status: active | suspended
 *   Listing.availability: available | unavailable
 *   Listing.category: Textbooks … Other (existing listing categories)
 *   RentalRequest.status: pending | accepted | declined | cancelled | completed
 *   Report.status: open | resolved | dismissed
 *   Review / Conversation / Message: countable via created_at
 *
 * Date filter: created_at on each collection (no fabricated resolved_at).
 *
 * Implementation boundaries for this file:
 *   Design helpers/types only. No dashboard widgets, no aggregation API,
 *   no frontend/backend integration.
 */

/** Same listing categories enforced by backend validation. */
export const ACTIVITY_LISTING_CATEGORIES = [
  'Textbooks',
  'Electronics',
  'Lab Equipment',
  'Sports & Recreation',
  'Tools',
  'Furniture',
  'Clothing',
  'Other',
] as const;

export type ActivityListingCategory = (typeof ACTIVITY_LISTING_CATEGORIES)[number];

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
 * Status breakdowns are display rows only — never summed into summary_total.
 * Messaging keeps conversations + messages as distinct collections.
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

export interface ActivityReportFilters {
  start_date: string | null;
  end_date: string | null;
  activity_scope: ActivityScope;
  listing_category: ActivityListingCategory | null;
}

export type ActivityMetricCounts = Record<ActivityMetricKey, number>;

export interface ActivityMetricRow {
  key: ActivityMetricKey;
  label: string;
  count: number;
}

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
  no_data_message: string | null;
}

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

export const ACTIVITY_DASHBOARD_PATH = '/admin';
export const ACTIVITY_SECTION_LABEL = 'Platform activity';
export const ACTIVITY_DASHBOARD_HEADING = 'Platform activity';
export const ACTIVITY_FILTERS_HEADING = 'Activity filters';
export const ACTIVITY_REPORT_HEADING = 'Activity summary';
export const ACTIVITY_GENERATE_REPORT_LABEL = 'Generate report';
export const ACTIVITY_NO_DATA_MESSAGE =
  'No platform activity matches the selected filters.';
export const ACTIVITY_DATE_FORMAT_MESSAGE = 'Dates must use YYYY-MM-DD format.';
export const ACTIVITY_DATE_RANGE_ORDER_MESSAGE =
  'Start date cannot be after end date.';

export const ACTIVITY_WORKFLOW_STEPS = [
  'open_activity_dashboard',
  'view_platform_statistics',
  'apply_filters',
  'generate_activity_report',
  'display_no_data_when_empty',
] as const;

export type ActivityWorkflowStep = (typeof ACTIVITY_WORKFLOW_STEPS)[number];

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

export function defaultActivityFilters(): ActivityReportFilters {
  return {
    start_date: null,
    end_date: null,
    activity_scope: 'all',
    listing_category: null,
  };
}

export function normalizeActivityFilters(input: {
  start_date?: unknown;
  end_date?: unknown;
  activity_scope?: unknown;
  listing_category?: unknown;
}): { filters: ActivityReportFilters; error: string } {
  const start = normalizeActivityDateInput(input.start_date);
  if (start.error) {
    return { filters: defaultActivityFilters(), error: start.error };
  }
  const end = normalizeActivityDateInput(input.end_date);
  if (end.error) {
    return { filters: defaultActivityFilters(), error: end.error };
  }
  if (start.value && end.value && start.value > end.value) {
    return {
      filters: defaultActivityFilters(),
      error: ACTIVITY_DATE_RANGE_ORDER_MESSAGE,
    };
  }

  const scope = isActivityScope(input.activity_scope)
    ? input.activity_scope
    : 'all';

  let listing_category: ActivityListingCategory | null = null;
  if (input.listing_category != null && input.listing_category !== '') {
    if (!isActivityListingCategory(input.listing_category)) {
      return {
        filters: defaultActivityFilters(),
        error: 'Listing category filter is not supported.',
      };
    }
    listing_category = input.listing_category;
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
