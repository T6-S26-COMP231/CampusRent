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

/* -------------------------------------------------------------------------- */
/* US-23.2 — moderation queue / report-detail UI view-model                   */
/* -------------------------------------------------------------------------- */

export const MODERATION_QUEUE_LOADING_LABEL = 'Loading reports…';
export const MODERATION_QUEUE_ERROR_FALLBACK = 'Unable to load reports.';
export const MODERATION_DETAIL_EMPTY_SELECTION = 'Select a report to review its details.';
export const MODERATION_TARGET_MISSING_LISTING = 'This listing is no longer available.';
export const MODERATION_TARGET_MISSING_USER = 'This user account is no longer available.';
export const MODERATION_ACTION_NOT_CONNECTED_MESSAGE =
  'Moderation actions are not connected yet.';
export const MODERATION_ACTION_PROCESSING_LABEL = 'Processing moderation action…';
export const MODERATION_WARN_SUCCESS_MESSAGE = 'Warning moderation action recorded.';
export const MODERATION_REMOVE_SUCCESS_MESSAGE = 'Listing removed successfully.';
export const MODERATION_SUSPEND_SUCCESS_MESSAGE = 'User account suspended.';
export const MODERATION_RESOLVE_SUCCESS_MESSAGE = 'Report resolved.';
export const MODERATION_DISMISS_SUCCESS_MESSAGE = 'Report dismissed.';
export const MODERATION_ACTION_ERROR_FALLBACK = 'Unable to complete moderation action.';
export const MODERATION_CANCEL_CONFIRM_LABEL = 'Cancel';
export const MODERATION_CONFIRM_ACTION_LABEL = 'Confirm';

/**
 * Full admin report view for queue + detail (#154 will populate this).
 * Compatible with US-20 Report fields; status/target resolved for display.
 */
export interface ModerationReportView {
  report: ModerationReportDetail;
  target: ModerationTargetView;
}

export type ModerationQueueUiStatus = 'loading' | 'empty' | 'error' | 'populated';

export interface ModerationQueueUiState {
  status: ModerationQueueUiStatus;
  rows: ModerationQueueRow[];
  error: string;
  selectedReportId: number | null;
}

export interface ModerationActionUiState {
  pendingAction: ModerationAction | null;
  notice: string;
}

/** Map a full report view to a queue row (no fabricated fields). */
export function moderationReportViewToQueueRow(view: ModerationReportView): ModerationQueueRow {
  const { report, target } = view;
  const targetLabel =
    target.target_type === 'listing'
      ? formatModerationListingLabel(
          target.exists ? { title: target.title ?? undefined } : null,
          target.listing_id
        )
      : target.exists && target.display_name?.trim()
        ? target.display_name.trim()
        : formatModerationPersonLabel(
            target.exists ? { email: target.email ?? undefined } : null,
            target.user_id
          );

  return {
    report_id: report.report_id,
    target_type: report.target_type,
    target_id: report.target_id,
    target_label: targetLabel,
    target_exists: target.exists,
    reporter_id: report.reporter_id,
    reporter_label: report.reporter_label,
    reason: report.reason,
    created_at: report.created_at,
    status: normalizeModerationStatus(report.status),
  };
}

export function moderationQueueRowsFromViews(views: ModerationReportView[]): ModerationQueueRow[] {
  return sortModerationQueueRows(views.map(moderationReportViewToQueueRow));
}

export function findModerationReportView(
  views: ModerationReportView[],
  reportId: number | null
): ModerationReportView | null {
  if (reportId == null) return null;
  return views.find((view) => view.report.report_id === reportId) ?? null;
}

export function moderationQueueUiStatus(
  loading: boolean,
  error: string,
  rowCount: number
): ModerationQueueUiStatus {
  if (loading) return 'loading';
  if (error.trim()) return 'error';
  if (rowCount === 0) return 'empty';
  return 'populated';
}

export function applyModerationQueueLoading(): Pick<ModerationQueueUiState, 'status' | 'error'> {
  return { status: 'loading', error: '' };
}

export function applyModerationQueueLoaded(
  views: ModerationReportView[]
): Pick<ModerationQueueUiState, 'status' | 'rows' | 'error'> {
  const rows = moderationQueueRowsFromViews(views);
  return {
    status: moderationQueueUiStatus(false, '', rows.length),
    rows,
    error: '',
  };
}

export function applyModerationQueueFailure(
  error: unknown
): Pick<ModerationQueueUiState, 'status' | 'rows' | 'error' | 'selectedReportId'> {
  return {
    status: 'error',
    rows: [],
    selectedReportId: null,
    error: error instanceof Error ? error.message : MODERATION_QUEUE_ERROR_FALLBACK,
  };
}

export function selectModerationReport(
  currentSelectedId: number | null,
  reportId: number
): number {
  return currentSelectedId === reportId ? reportId : reportId;
}

export function visibleModerationActions(
  targetType: ModerationTargetType,
  status: ModerationStatus | undefined | null
): ModerationAction[] {
  return actionsForReportTarget(targetType).filter((action) =>
    canPerformModerationAction(targetType, action, status)
  );
}

export function beginModerationActionConfirm(
  action: ModerationAction
): ModerationActionUiState {
  if (moderationActionRequiresConfirm(action)) {
    return { pendingAction: action, notice: '' };
  }
  return { pendingAction: null, notice: '' };
}

export function cancelModerationActionConfirm(): ModerationActionUiState {
  return { pendingAction: null, notice: '' };
}

/**
 * UI-only action seam for #153.
 * Never claims success; later tasks replace the not-connected path with real handlers.
 */
export function attemptModerationActionUi(
  action: ModerationAction,
  options: { confirmed?: boolean; onAction?: (action: ModerationAction) => void | Promise<void> } = {}
): ModerationActionUiState {
  if (moderationActionRequiresConfirm(action) && !options.confirmed) {
    return beginModerationActionConfirm(action);
  }

  if (!options.onAction) {
    return {
      pendingAction: null,
      notice: MODERATION_ACTION_NOT_CONNECTED_MESSAGE,
    };
  }

  void options.onAction(action);
  return { pendingAction: null, notice: '' };
}

export function moderationTargetHeading(target: ModerationTargetView): string {
  return target.target_type === 'listing'
    ? MODERATION_TARGET_LISTING_HEADING
    : MODERATION_TARGET_USER_HEADING;
}

export function moderationTargetMissingMessage(target: ModerationTargetView): string {
  return target.target_type === 'listing'
    ? MODERATION_TARGET_MISSING_LISTING
    : MODERATION_TARGET_MISSING_USER;
}

export function formatModerationTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

export function moderationActionButtonClass(action: ModerationAction): 'primary' | 'secondary' | 'danger' {
  if (action === 'remove_listing' || action === 'suspend_user') return 'danger';
  if (action === 'resolve') return 'primary';
  return 'secondary';
}

/** Closed reports show no actionable controls in the queue detail UI. */
export function moderationActionsDisabledReason(
  status: ModerationStatus | undefined | null
): string {
  const normalized = normalizeModerationStatus(status);
  if (normalized === 'open') return '';
  return `This report is ${moderationStatusLabel(normalized).toLowerCase()}.`;
}

/* -------------------------------------------------------------------------- */
/* US-23.6 — admin API integration helpers                                    */
/* -------------------------------------------------------------------------- */

/** POST body for moderation actions — action only. */
export function buildModerationActionRequestBody(
  action: ModerationAction
): { action: ModerationAction } {
  return { action };
}

export function moderationActionRequestHasTrustedFieldsOnly(body: {
  action: ModerationAction;
}): boolean {
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] === 'action' && isModerationAction(body.action);
}

/**
 * Truthful success copy after a real backend success.
 * Warn never claims notification/email delivery.
 */
export function moderationActionSuccessMessage(action: ModerationAction): string {
  switch (action) {
    case 'warn':
      return MODERATION_WARN_SUCCESS_MESSAGE;
    case 'remove_listing':
      return MODERATION_REMOVE_SUCCESS_MESSAGE;
    case 'suspend_user':
      return MODERATION_SUSPEND_SUCCESS_MESSAGE;
    case 'resolve':
      return MODERATION_RESOLVE_SUCCESS_MESSAGE;
    case 'dismiss':
      return MODERATION_DISMISS_SUCCESS_MESSAGE;
    default: {
      const _exhaustive: never = action;
      return String(_exhaustive);
    }
  }
}

export function moderationActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : MODERATION_ACTION_ERROR_FALLBACK;
}

/** Map admin API list/detail payloads into the UI view-model. */
export function mapAdminReportApiToView(payload: {
  report: ModerationReportDetail & { reporter?: unknown };
  target: ModerationTargetView;
}): ModerationReportView {
  const { report, target } = payload;
  return {
    report: {
      report_id: report.report_id,
      reporter_id: report.reporter_id,
      reporter_label: report.reporter_label,
      reason: report.reason,
      details: report.details,
      created_at: report.created_at,
      status: normalizeModerationStatus(report.status),
      target_type: report.target_type,
      target_id: report.target_id,
    },
    target,
  };
}

export function mapAdminReportsApiToViews(
  payloads: Array<{ report: ModerationReportDetail & { reporter?: unknown }; target: ModerationTargetView }>
): ModerationReportView[] {
  return payloads.map(mapAdminReportApiToView);
}

/**
 * After a successful action, merge the server-returned report/target into the
 * local views list (replace matching report_id, keep selection stable).
 */
export function applyModerationActionSuccessToViews(
  views: ModerationReportView[],
  updated: ModerationReportView
): ModerationReportView[] {
  const mapped = mapAdminReportApiToView(updated);
  const without = views.filter((view) => view.report.report_id !== mapped.report.report_id);
  return sortModerationViewsByQueueOrder([mapped, ...without]);
}

function sortModerationViewsByQueueOrder(views: ModerationReportView[]): ModerationReportView[] {
  const rows = moderationQueueRowsFromViews(views);
  return rows
    .map((row) => views.find((view) => view.report.report_id === row.report_id))
    .filter((view): view is ModerationReportView => Boolean(view));
}

export function preserveSelectedReportId(
  selectedReportId: number | null,
  views: ModerationReportView[]
): number | null {
  if (selectedReportId == null) return null;
  return views.some((view) => view.report.report_id === selectedReportId)
    ? selectedReportId
    : null;
}

export function canSubmitModerationAction(options: {
  acting: boolean;
  status: ModerationStatus | undefined | null;
}): boolean {
  if (options.acting) return false;
  return normalizeModerationStatus(options.status) === 'open';
}

/** US-23.6 — POST /admin/reports/:id/actions call descriptor ({ action } only). */
export function buildPerformModerationActionCall(
  reportId: number,
  action: ModerationAction
): { path: string; method: 'POST'; body: { action: ModerationAction } } {
  return {
    path: `/admin/reports/${reportId}/actions`,
    method: 'POST',
    body: buildModerationActionRequestBody(action),
  };
}

export function moderationActionBodyExcludesClientIdentity(body: Record<string, unknown>): boolean {
  return (
    !('administrator_id' in body) &&
    !('target_id' in body) &&
    !('target_type' in body) &&
    moderationActionRequestHasTrustedFieldsOnly(body as { action: ModerationAction })
  );
}

export interface ModerationQueueLoadFlowResult {
  status: ModerationQueueUiStatus;
  views: ModerationReportView[];
  rows: ModerationQueueRow[];
  error: string;
  selectedReportId: number | null;
}

/** Pure queue-load flow for AdminPage + tests. */
export async function runModerationQueueLoadFlow(
  fetchReports: () => Promise<
    Array<{ report: ModerationReportDetail & { reporter?: unknown }; target: ModerationTargetView }>
  >,
  selectedReportId: number | null = null
): Promise<ModerationQueueLoadFlowResult> {
  try {
    const payloads = await fetchReports();
    const views = mapAdminReportsApiToViews(payloads);
    const loaded = applyModerationQueueLoaded(views);
    return {
      status: loaded.status,
      views,
      rows: loaded.rows,
      error: '',
      selectedReportId: preserveSelectedReportId(selectedReportId, views),
    };
  } catch (error) {
    const failed = applyModerationQueueFailure(error);
    return {
      status: failed.status,
      views: [],
      rows: failed.rows,
      error: failed.error,
      selectedReportId: null,
    };
  }
}

export interface ModerationActionFlowResult {
  kind: 'confirm' | 'blocked' | 'success' | 'failure';
  pendingAction: ModerationAction | null;
  success: string;
  error: string;
  acting: boolean;
  retryable: boolean;
  view: ModerationReportView | null;
  selectedReportId: number | null;
}

/**
 * Pure moderation-action flow for AdminPage + tests.
 * Destructive actions require confirmed=true before the API is called.
 * Success uses truthful UI copy (warn never claims notification delivery).
 */
export async function runModerationActionFlow(options: {
  reportId: number;
  action: ModerationAction;
  status: ModerationStatus | undefined | null;
  acting: boolean;
  confirmed?: boolean;
  perform: (
    reportId: number,
    action: ModerationAction
  ) => Promise<{ report: ModerationReportDetail & { reporter?: unknown }; target: ModerationTargetView }>;
}): Promise<ModerationActionFlowResult> {
  const { reportId, action, status, acting, confirmed = false, perform } = options;

  if (moderationActionRequiresConfirm(action) && !confirmed) {
    return {
      kind: 'confirm',
      pendingAction: action,
      success: '',
      error: '',
      acting: false,
      retryable: true,
      view: null,
      selectedReportId: reportId,
    };
  }

  if (!canSubmitModerationAction({ acting, status })) {
    return {
      kind: 'blocked',
      pendingAction: null,
      success: '',
      error: acting ? MODERATION_ACTION_PROCESSING_LABEL : moderationActionsDisabledReason(status),
      acting,
      retryable: !acting,
      view: null,
      selectedReportId: reportId,
    };
  }

  try {
    const result = await perform(reportId, action);
    const view = mapAdminReportApiToView(result);
    return {
      kind: 'success',
      pendingAction: null,
      success: moderationActionSuccessMessage(action),
      error: '',
      acting: false,
      retryable: false,
      view,
      selectedReportId: reportId,
    };
  } catch (error) {
    return {
      kind: 'failure',
      pendingAction: null,
      success: '',
      error: moderationActionErrorMessage(error),
      acting: false,
      retryable: true,
      view: null,
      selectedReportId: reportId,
    };
  }
}

/** Warn success copy must never claim email/notification delivery. */
export function moderationWarnSuccessIsTruthful(message: string): boolean {
  return (
    message === MODERATION_WARN_SUCCESS_MESSAGE &&
    !/email sent|notification delivered|user notified/i.test(message)
  );
}
