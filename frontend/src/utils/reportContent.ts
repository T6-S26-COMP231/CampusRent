/**
 * US-20.1 — report-user and report-listing form-flow design.
 *
 * TAC: registered students report inappropriate users or listings with a
 * required reason and supporting details. Reports go to the System
 * Administration Team (US-23 moderation consumes the eventual stored shape).
 *
 * Entry points (no new routes — attach to existing surfaces in US-20.2):
 *
 *   Report listing
 *     Primary: ListingDetailPage (/listings/:id) when viewer is not the owner.
 *     Target id = listing.id from page context (never typed by the reporter).
 *
 *   Report user
 *     Primary: listing owner card on ListingDetailPage (listing.owner.id).
 *     Secondary (same trusted counterpart ids as messaging):
 *       - MyRequestsPage → request owner
 *       - Incoming Requests (/requests) → request renter
 *       - ConversationDetailPage → conversation.counterpart.id
 *     Target id = counterpart/owner/renter id from that surface (never typed).
 *
 * Form layout (for US-20.2 implementation):
 *   1. Heading — “Report listing” or “Report user”
 *   2. Target summary — title/name + trusted id context (read-only)
 *   3. Reason — required control (select or equivalent) using ReportReasonOption[]
 *   4. Supporting details — required <textarea className="input-field">
 *   5. Actions — Submit (btn-primary) + Cancel/back (btn-secondary)
 *   Inline panel/modal on the initiating page (same pattern as decline/cancel
 *   confirms and MessageComposer), not a standalone /reports route.
 *
 * Reason/category:
 *   Required non-empty value after trim. No closed production category list is
 *   defined here — TAC/GitHub did not approve one. US-20.2 renders a reason
 *   control from ReportReasonOption[]; US-20.5 enforces whatever approved
 *   values are established later (see isApprovedReportReason).
 *
 * Supporting details:
 *   Required, trimmed, non-empty. No maximum length is specified by TAC.
 *
 * States:
 *   - Validation: reason required; details required after trim
 *   - Submitting: disable controls; label “Submitting...” (double-submit guard)
 *   - Success: emerald banner (existing CampusRent pattern); clear draft
 *   - API/error: red banner; keep typed reason + details
 *   - Incomplete: keep draft; show required-field messages
 *
 * Trust model:
 *   - target_type + target_id come from page context helpers below
 *   - reporter identity comes from authentication later (US-20.4/20.6) —
 *     never from a user-editable form field
 *
 * Persistence / API / Mongo Report model / admin dashboard belong to
 * US-20.3–20.6 and US-23. This module only captures frontend design shapes.
 */

export const REPORT_LISTING_HEADING = 'Report listing';
export const REPORT_USER_HEADING = 'Report user';
export const REPORT_LISTING_ENTRY_LABEL = 'Report listing';
export const REPORT_USER_ENTRY_LABEL = 'Report user';
export const SUBMIT_REPORT_LABEL = 'Submit report';
export const SUBMITTING_REPORT_LABEL = 'Submitting...';
export const CANCEL_REPORT_LABEL = 'Cancel';
export const REPORT_REASON_PLACEHOLDER = 'Select a reason';
export const REPORT_DETAILS_PLACEHOLDER =
  'Describe what happened and why this should be reviewed…';
export const REPORT_SUCCESS_MESSAGE =
  'Report submitted. The System Administration Team will review it.';
export const REPORT_INCOMPLETE_REASON_MESSAGE = 'A report reason is required.';
export const REPORT_INCOMPLETE_DETAILS_MESSAGE =
  'Supporting details are required.';
export const REPORT_LOAD_ERROR_FALLBACK = 'Unable to submit report';

/**
 * Reason/category value selected on the form.
 * Required and non-empty after trim; concrete approved values are TBD.
 */
export type ReportReason = string;

export type ReportTargetType = 'listing' | 'user';

/** Trusted listing target — ids come from ListingDetailPage context only. */
export interface ReportListingTarget {
  type: 'listing';
  listingId: number;
  listingTitle: string;
}

/**
 * Trusted user target — ids come from owner/counterpart/renter context only.
 * Optional listing context helps US-23 moderators understand where the report
 * was filed; it is not a second reportable target.
 */
export interface ReportUserTarget {
  type: 'user';
  userId: number;
  userName: string;
  contextListingId?: number;
  contextListingTitle?: string;
}

export type ReportTarget = ReportListingTarget | ReportUserTarget;

/** Option shape for the US-20.2 reason control (value + display label). */
export interface ReportReasonOption {
  value: ReportReason;
  label: string;
}

/**
 * Reason options for the form control.
 * Intentionally empty — no approved category list exists in TAC/GitHub/repo.
 * US-20.2 supplies options from an approved source when one is available.
 */
export const REPORT_REASON_OPTIONS: ReportReasonOption[] = [];

/**
 * Conceptual POST body for later submit-report API (US-20.4 / US-20.6).
 * Does not include reporter_id — server derives reporter from auth.
 */
export interface SubmitReportBody {
  target_type: ReportTargetType;
  target_id: number;
  reason: ReportReason;
  details: string;
}

export interface ReportSubmitGate {
  target: ReportTarget | null;
  reason: string;
  details: string;
  submitting: boolean;
  viewerId: number | undefined;
}

export function normalizeReportReason(raw: string): string {
  return raw.trim();
}

/** Client presence check only — not membership in an invented category list. */
export function hasReportReason(raw: string): boolean {
  return normalizeReportReason(raw).length > 0;
}

/**
 * Hook for US-20.5 (and later UI) once an approved category source exists.
 * Returns false when the approved list is empty or the reason is not listed.
 */
export function isApprovedReportReason(
  reason: string,
  approvedCategories: readonly string[]
): boolean {
  if (!approvedCategories.length) return false;
  const normalized = normalizeReportReason(reason);
  return approvedCategories.includes(normalized);
}

export function normalizeReportDetails(raw: string): string {
  return raw.trim();
}

export function isBlankReportDetails(raw: string): boolean {
  return normalizeReportDetails(raw).length === 0;
}

export function reportFormHeading(targetType: ReportTargetType): string {
  return targetType === 'listing' ? REPORT_LISTING_HEADING : REPORT_USER_HEADING;
}

export function reportEntryLabel(targetType: ReportTargetType): string {
  return targetType === 'listing' ? REPORT_LISTING_ENTRY_LABEL : REPORT_USER_ENTRY_LABEL;
}

export function reportSubmitLabel(submitting: boolean): string {
  return submitting ? SUBMITTING_REPORT_LABEL : SUBMIT_REPORT_LABEL;
}

/** Build a listing target from the open listing page — never from free text. */
export function toReportListingTarget(listing: {
  id: number;
  title: string;
}): ReportListingTarget {
  return {
    type: 'listing',
    listingId: listing.id,
    listingTitle: listing.title.trim() || 'Untitled listing',
  };
}

/** Build a user target from owner/counterpart/renter context — never free text. */
export function toReportUserTarget(
  user: { id: number; first_name: string; last_name: string },
  context?: { listingId?: number; listingTitle?: string }
): ReportUserTarget {
  const userName = `${user.first_name} ${user.last_name}`.trim() || 'CampusRent user';
  return {
    type: 'user',
    userId: user.id,
    userName,
    contextListingId: context?.listingId,
    contextListingTitle: context?.listingTitle?.trim() || undefined,
  };
}

export function reportTargetId(target: ReportTarget): number {
  return target.type === 'listing' ? target.listingId : target.userId;
}

/** Read-only summary shown above the form controls. */
export function reportTargetSummary(target: ReportTarget): string {
  if (target.type === 'listing') {
    return `Listing: ${target.listingTitle}`;
  }
  if (target.contextListingTitle) {
    return `User: ${target.userName} · Listing: ${target.contextListingTitle}`;
  }
  return `User: ${target.userName}`;
}

/**
 * Viewer may report a target when authenticated, target ids are valid,
 * and the viewer is not reporting themselves as a user target.
 */
export function canReportTarget(
  viewerId: number | undefined,
  target: ReportTarget | null
): boolean {
  if (!viewerId || !target) return false;
  if (target.type === 'listing') {
    return Number.isInteger(target.listingId) && target.listingId > 0;
  }
  return (
    Number.isInteger(target.userId) &&
    target.userId > 0 &&
    target.userId !== viewerId
  );
}

export function reportValidationMessages(gate: Pick<ReportSubmitGate, 'reason' | 'details'>): {
  reason: string;
  details: string;
} {
  return {
    reason: hasReportReason(gate.reason) ? '' : REPORT_INCOMPLETE_REASON_MESSAGE,
    details: isBlankReportDetails(gate.details) ? REPORT_INCOMPLETE_DETAILS_MESSAGE : '',
  };
}

/**
 * Client gate before any future network call.
 * Incomplete reports and self-reports are blocked; double-submit while submitting.
 */
export function canSubmitReport(gate: ReportSubmitGate): boolean {
  if (gate.submitting) return false;
  if (!canReportTarget(gate.viewerId, gate.target)) return false;
  const messages = reportValidationMessages(gate);
  return !messages.reason && !messages.details;
}

/** Pure request descriptor — no reporter_id field. */
export function buildSubmitReportBody(
  target: ReportTarget,
  reason: ReportReason,
  details: string
): SubmitReportBody {
  return {
    target_type: target.type,
    target_id: reportTargetId(target),
    reason: normalizeReportReason(reason),
    details: normalizeReportDetails(details),
  };
}

export function reportSuccessMessage(): string {
  return REPORT_SUCCESS_MESSAGE;
}

export function reportErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : REPORT_LOAD_ERROR_FALLBACK;
}

/** On failure: keep typed reason/details and surface the error. */
export function applyFailedReportSubmit(
  reason: string,
  details: string,
  error: unknown
): { reason: string; details: string; error: string; success: string } {
  return {
    reason,
    details,
    error: reportErrorMessage(error),
    success: '',
  };
}

/** On success: clear the form draft and show confirmation. */
export function applySuccessfulReportSubmit(): {
  reason: string;
  details: string;
  error: string;
  success: string;
} {
  return {
    reason: '',
    details: '',
    error: '',
    success: reportSuccessMessage(),
  };
}
