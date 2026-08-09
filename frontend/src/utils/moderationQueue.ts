/**
 * US-23.1 — administrator moderation-queue workflow design.
 *
 * Team6 TAC US-23:
 *   As a System Administration Team member, I can review and moderate reported
 *   users and listings so that the platform remains safe and trustworthy.
 *
 * Notes:
 *   - Administrators can review reported users and listings.
 *   - Administrative actions include removal, suspension, or warning.
 *   - All moderation actions are recorded for auditing purposes.
 * GitHub #155 also lists dismiss among the action-implementation tasks, so
 * dismiss is included here as a non-punitive report disposition.
 *
 * Source of reports (US-20 / US-20 Test 4 dependency):
 *   The queue consumes the same MongoDB Report documents created by
 *   POST /api/reports. Fields already persisted: id, reporter_id, target_type
 *   (user|listing), target_id, reason, details, created_at.
 *   Do NOT copy reports into a second collection for display.
 *   Do NOT add moderation status/audit fields to the Report model in this
 *   design task — status/audit shapes below are conceptual for US-23.3–23.5.
 *
 * UI placement (US-23.2):
 *   Extend the existing Admin Dashboard (/admin, AdminPage) — do not create a
 *   separate admin app. Prefer:
 *     Admin Dashboard
 *     → Moderation / Reports section
 *     → Report queue
 *     → Select report
 *     → Report detail (+ target panel)
 *     → Action controls (with confirm for destructive actions)
 *
 * Authorization:
 *   UI: reuse ProtectedRoute requireAdmin + Layout admin nav (role === 'admin').
 *   API (later): reuse authenticate + requireAdmin on /api/admin/* report routes.
 *   Students must not reach moderation screens; server must enforce independently.
 *
 * Existing platform hooks this design will reuse later:
 *   - User.status: 'active' | 'suspended' (account restriction already exists)
 *   - Listing DELETE /api/listings/:id (owner remove today; admin remove later)
 *   - Admin verification patterns in AdminPage + /api/admin/verifications
 *
 * Implementation boundaries for this file:
 *   Design helpers/types only. No queue UI, no report-list/detail API, no
 *   action endpoints, no Report/User/Listing schema changes.
 */

/** Same target discriminator already stored by US-20 Report records. */
export type ModerationTargetType = 'user' | 'listing';

/**
 * Minimal status lifecycle for Acceptance Test 5
 * (Resolve report → Status changes to Resolved).
 *
 * Conceptual only until US-23.5 persists status on Report (or equivalent).
 * - open: newly submitted / awaiting admin review (default for US-20 reports)
 * - resolved: closed after a punitive or corrective moderation decision
 * - dismissed: closed without punitive action (GitHub #155)
 */
export const MODERATION_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/**
 * Allowed moderation actions (TAC + GitHub #155).
 * No invented extras (no shadow-ban, no fine, etc.).
 */
export const MODERATION_ACTIONS = [
  'warn',
  'remove_listing',
  'suspend_user',
  'resolve',
  'dismiss',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_SECTION_LABEL = 'Moderation';
export const MODERATION_QUEUE_HEADING = 'Reported content';
export const MODERATION_QUEUE_EMPTY_MESSAGE = 'No reports awaiting review.';
export const MODERATION_DETAIL_HEADING = 'Report detail';
export const MODERATION_TARGET_LISTING_HEADING = 'Reported listing';
export const MODERATION_TARGET_USER_HEADING = 'Reported user';
export const MODERATION_ACTIONS_HEADING = 'Moderation actions';
export const MODERATION_CONFIRM_REMOVE_LISTING =
  'Remove this listing? This cannot be undone from the moderation queue.';
export const MODERATION_CONFIRM_SUSPEND_USER =
  'Suspend this user? Their access to registered-student features will be restricted.';

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  warn: 'Warn user',
  remove_listing: 'Remove listing',
  suspend_user: 'Suspend user',
  resolve: 'Resolve report',
  dismiss: 'Dismiss report',
};

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/** US-20 Report row shape the queue will list (from POST /api/reports / list API). */
export interface ModerationReportSource {
  id: number;
  reporter_id: number;
  target_type: ModerationTargetType;
  target_id: number;
  reason: string;
  details: string;
  created_at: string;
  /** Absent until US-23.5 — treat missing as open. */
  status?: ModerationStatus;
}

/** Resolved labels for queue display — joined at API/UI time, not denormalized into Report. */
export interface ModerationQueueTargetLabel {
  target_type: ModerationTargetType;
  target_id: number;
  /** Listing title or user display name when resolvable; otherwise a stable fallback. */
  label: string;
  /** True when the target User/Listing document still exists. */
  exists: boolean;
}

export interface ModerationQueueReporterLabel {
  reporter_id: number;
  label: string;
  exists: boolean;
}

/** One queue row for Admin Dashboard → Moderation / Reports. */
export interface ModerationQueueRow {
  report_id: number;
  target_type: ModerationTargetType;
  target_id: number;
  target_label: string;
  target_exists: boolean;
  reporter_id: number;
  reporter_label: string;
  reason: string;
  created_at: string;
  status: ModerationStatus;
}

/** Report-detail panel — report fields only. */
export interface ModerationReportDetail {
  report_id: number;
  reporter_id: number;
  reporter_label: string;
  reason: string;
  details: string;
  created_at: string;
  status: ModerationStatus;
  target_type: ModerationTargetType;
  target_id: number;
}

/**
 * Listing target review panel (Acceptance Test 2).
 * Uses already-approved listing/admin-visible fields only.
 */
export interface ModerationListingTargetView {
  target_type: 'listing';
  listing_id: number;
  exists: boolean;
  title: string | null;
  owner_id: number | null;
  owner_label: string | null;
  category: string | null;
  availability: 'available' | 'unavailable' | null;
  description_preview: string | null;
}

/**
 * User target review panel.
 * Uses admin-visible identity already used in verification UI (name, email, statuses).
 */
export interface ModerationUserTargetView {
  target_type: 'user';
  user_id: number;
  exists: boolean;
  display_name: string | null;
  email: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | null;
  account_status: 'active' | 'suspended' | null;
}

export type ModerationTargetView = ModerationListingTargetView | ModerationUserTargetView;

/**
 * Conceptual audit record for later persistence (US-23.5).
 * TAC: all moderation actions are recorded for auditing.
 */
export interface ModerationAuditRecord {
  report_id: number;
  administrator_id: number;
  action: ModerationAction;
  created_at: string;
}

/** Conceptual action request body for later endpoints (US-23.4 / 23.6). */
export interface ModerationActionRequest {
  action: ModerationAction;
}

export function isModerationStatus(value: unknown): value is ModerationStatus {
  return typeof value === 'string' && (MODERATION_STATUSES as readonly string[]).includes(value);
}

export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

/** Missing status on a US-20 report means it is still open for review. */
export function normalizeModerationStatus(status: ModerationStatus | undefined | null): ModerationStatus {
  return status && isModerationStatus(status) ? status : 'open';
}

export function moderationStatusLabel(status: ModerationStatus | undefined | null): string {
  return MODERATION_STATUS_LABELS[normalizeModerationStatus(status)];
}

export function moderationActionLabel(action: ModerationAction): string {
  return MODERATION_ACTION_LABELS[action];
}

/** Destructive actions require an explicit confirm step before the API call. */
export function moderationActionRequiresConfirm(action: ModerationAction): boolean {
  return action === 'remove_listing' || action === 'suspend_user';
}

export function moderationConfirmMessage(action: ModerationAction): string {
  if (action === 'remove_listing') return MODERATION_CONFIRM_REMOVE_LISTING;
  if (action === 'suspend_user') return MODERATION_CONFIRM_SUSPEND_USER;
  return '';
}

/**
 * Dismiss vs resolve (design distinction for later implementation):
 * - dismiss: close the report without punitive action (no remove/suspend/warn effect)
 * - resolve: close after a moderation decision path (often following warn/remove/suspend,
 *   or when the admin marks review complete with status Resolved per TAC Test 5)
 */
export function moderationActionClosesReport(action: ModerationAction): boolean {
  return action === 'dismiss' || action === 'resolve';
}

export function moderationActionResultStatus(action: ModerationAction): ModerationStatus | null {
  if (action === 'dismiss') return 'dismissed';
  if (action === 'resolve') return 'resolved';
  // warn / remove_listing / suspend_user do not by themselves invent a close;
  // admin may Resolve afterward (or later tasks may chain resolve).
  return null;
}

/** Actions that apply to a listing-target report. */
export function actionsForListingReport(): ModerationAction[] {
  return ['warn', 'remove_listing', 'resolve', 'dismiss'];
}

/** Actions that apply to a user-target report. */
export function actionsForUserReport(): ModerationAction[] {
  return ['warn', 'suspend_user', 'resolve', 'dismiss'];
}

export function actionsForReportTarget(targetType: ModerationTargetType): ModerationAction[] {
  return targetType === 'listing' ? actionsForListingReport() : actionsForUserReport();
}

export function canPerformModerationAction(
  targetType: ModerationTargetType,
  action: ModerationAction,
  status: ModerationStatus | undefined | null
): boolean {
  if (normalizeModerationStatus(status) !== 'open') return false;
  return actionsForReportTarget(targetType).includes(action);
}

export function formatModerationPersonLabel(
  user: { first_name?: string; last_name?: string; email?: string } | null | undefined,
  fallbackId: number
): string {
  if (!user) return `User #${fallbackId}`;
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  if (name) return name;
  if (user.email?.trim()) return user.email.trim();
  return `User #${fallbackId}`;
}

export function formatModerationListingLabel(
  listing: { title?: string } | null | undefined,
  listingId: number
): string {
  const title = listing?.title?.trim();
  return title || `Listing #${listingId}`;
}

/** Build a queue row from a US-20 report + optionally resolved labels. */
export function toModerationQueueRow(
  report: ModerationReportSource,
  target?: Partial<ModerationQueueTargetLabel>,
  reporter?: Partial<ModerationQueueReporterLabel>
): ModerationQueueRow {
  return {
    report_id: report.id,
    target_type: report.target_type,
    target_id: report.target_id,
    target_label:
      target?.label?.trim() ||
      (report.target_type === 'listing'
        ? `Listing #${report.target_id}`
        : `User #${report.target_id}`),
    target_exists: target?.exists ?? false,
    reporter_id: report.reporter_id,
    reporter_label: reporter?.label?.trim() || `User #${report.reporter_id}`,
    reason: report.reason,
    created_at: report.created_at,
    status: normalizeModerationStatus(report.status),
  };
}

export function toModerationReportDetail(
  report: ModerationReportSource,
  reporterLabel?: string
): ModerationReportDetail {
  return {
    report_id: report.id,
    reporter_id: report.reporter_id,
    reporter_label: reporterLabel?.trim() || `User #${report.reporter_id}`,
    reason: report.reason,
    details: report.details,
    created_at: report.created_at,
    status: normalizeModerationStatus(report.status),
    target_type: report.target_type,
    target_id: report.target_id,
  };
}

/** Newest-first queue order (matches Report created_at index intent). */
export function sortModerationQueueRows(rows: ModerationQueueRow[]): ModerationQueueRow[] {
  return [...rows].sort((a, b) => {
    const time = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (time !== 0) return time;
    return b.report_id - a.report_id;
  });
}

/** Open reports first for the primary moderation queue view. */
export function filterOpenModerationQueueRows(rows: ModerationQueueRow[]): ModerationQueueRow[] {
  return rows.filter((row) => row.status === 'open');
}

/**
 * Workflow steps for US-23.2 UI (documentation helper).
 * 1 Open Admin Dashboard → 2 View reports → 3 Select → 4 Detail →
 * 5 Target info → 6 Choose action → 7 Confirm if destructive →
 * 8 Record audit → 9 Resolve/dismiss status.
 */
export const MODERATION_WORKFLOW_STEPS = [
  'open_admin_dashboard',
  'view_submitted_reports',
  'select_report',
  'view_report_detail',
  'view_reported_target',
  'choose_moderation_action',
  'confirm_destructive_action',
  'record_moderation_audit',
  'close_report_status',
] as const;

export type ModerationWorkflowStep = (typeof MODERATION_WORKFLOW_STEPS)[number];

/** Conceptual admin API paths for later tasks — not implemented here. */
export const MODERATION_API_PATHS = {
  list: '/admin/reports',
  detail: (reportId: number) => `/admin/reports/${reportId}`,
  action: (reportId: number) => `/admin/reports/${reportId}/actions`,
} as const;

export function moderationReportDetailPath(reportId: number): string {
  return MODERATION_API_PATHS.detail(reportId);
}

export function moderationReportActionPath(reportId: number): string {
  return MODERATION_API_PATHS.action(reportId);
}

/**
 * Build a conceptual audit row after a successful action (US-23.5 persistence).
 * administrator_id must come from authenticated admin identity only.
 */
export function buildModerationAuditRecord(
  reportId: number,
  administratorId: number,
  action: ModerationAction,
  createdAt: string = new Date().toISOString()
): ModerationAuditRecord {
  return {
    report_id: reportId,
    administrator_id: administratorId,
    action,
    created_at: createdAt,
  };
}
