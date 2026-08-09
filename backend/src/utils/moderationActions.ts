import { Listing } from '../models/Listing';
import { Report, ReportDoc, ReportTargetType } from '../models/Report';
import { User } from '../models/User';
import { removeListingDocument } from './listingRemoval';

/**
 * US-23.4 — moderation action domain logic.
 *
 * Trusted target is always report.target_type + report.target_id.
 * Callers must not supply a separate target id that can diverge from the report.
 *
 * #156 owns persisted report status + audit recording.
 * #157 owns HTTP/frontend wiring.
 */

export const MODERATION_ACTION_NAMES = [
  'warn',
  'remove_listing',
  'suspend_user',
  'dismiss',
  'resolve',
] as const;

export type ModerationActionName = (typeof MODERATION_ACTION_NAMES)[number];

export class ModerationActionError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ModerationActionError';
    this.statusCode = statusCode;
  }
}

export function isModerationActionName(value: unknown): value is ModerationActionName {
  return typeof value === 'string' && (MODERATION_ACTION_NAMES as readonly string[]).includes(value);
}

function assertActionCompatible(targetType: ReportTargetType, action: ModerationActionName): void {
  if (action === 'remove_listing' && targetType !== 'listing') {
    throw new ModerationActionError(400, 'remove_listing applies only to listing reports');
  }
  if (action === 'suspend_user' && targetType !== 'user') {
    throw new ModerationActionError(400, 'suspend_user applies only to user reports');
  }
}

export async function loadReportForModeration(reportId: number): Promise<ReportDoc> {
  if (!Number.isInteger(reportId) || reportId <= 0) {
    throw new ModerationActionError(400, 'Invalid report id');
  }

  const report = await Report.findById(reportId);
  if (!report) {
    throw new ModerationActionError(404, 'Report not found');
  }

  return report;
}

export function validateModerationAction(
  report: ReportDoc,
  action: unknown
): ModerationActionName {
  if (!isModerationActionName(action)) {
    throw new ModerationActionError(
      400,
      'Action must be warn, remove_listing, suspend_user, dismiss, or resolve'
    );
  }
  assertActionCompatible(report.target_type, action);
  return action;
}

export interface ModerationActionDecision {
  action: ModerationActionName;
  report_id: number;
  target_type: ReportTargetType;
  target_id: number;
  /** True when a listing/user was mutated by this action. */
  target_mutated: boolean;
  /**
   * Report status persistence belongs to US-23.5 (#156).
   * These decisions do not write status onto the Report document.
   */
  report_status_persisted: false;
  /** Warn does not send email/SMS — audit recording is #156. */
  notification_delivered: false;
  message: string;
}

function decision(
  report: ReportDoc,
  action: ModerationActionName,
  targetMutated: boolean,
  message: string
): ModerationActionDecision {
  return {
    action,
    report_id: report._id,
    target_type: report.target_type,
    target_id: report.target_id,
    target_mutated: targetMutated,
    report_status_persisted: false,
    notification_delivered: false,
    message,
  };
}

/** Remove the listing identified by report.target_id (not client-supplied). */
export async function removeReportedListing(report: ReportDoc): Promise<ModerationActionDecision> {
  validateModerationAction(report, 'remove_listing');

  const listing = await Listing.findById(report.target_id);
  if (!listing) {
    throw new ModerationActionError(404, 'Reported listing not found');
  }

  await removeListingDocument(listing);

  return decision(
    report,
    'remove_listing',
    true,
    'Reported listing removed successfully.'
  );
}

/** Suspend the student identified by report.target_id using User.status. */
export async function suspendReportedUser(report: ReportDoc): Promise<ModerationActionDecision> {
  validateModerationAction(report, 'suspend_user');

  const user = await User.findById(report.target_id);
  if (!user) {
    throw new ModerationActionError(404, 'Reported user not found');
  }
  if (user.role !== 'student') {
    throw new ModerationActionError(400, 'Only student accounts can be suspended through moderation');
  }

  user.status = 'suspended';
  await user.save();

  return decision(
    report,
    'suspend_user',
    true,
    'Reported user account suspended.'
  );
}

/**
 * Warn semantics for audit later (#156).
 * No email/SMS/notification delivery is invented here.
 */
export function prepareWarnDecision(report: ReportDoc): ModerationActionDecision {
  validateModerationAction(report, 'warn');
  return decision(
    report,
    'warn',
    false,
    'Warning recorded for audit; no user notification was sent.'
  );
}

/**
 * Dismiss: close without punitive target mutation.
 * Persisted dismissed status belongs to #156.
 */
export function prepareDismissDecision(report: ReportDoc): ModerationActionDecision {
  validateModerationAction(report, 'dismiss');
  return decision(
    report,
    'dismiss',
    false,
    'Dismiss prepared; report status persistence belongs to a later task.'
  );
}

/**
 * Resolve: status change to Resolved belongs to #156.
 * This only validates the action against the report target.
 */
export function prepareResolveDecision(report: ReportDoc): ModerationActionDecision {
  validateModerationAction(report, 'resolve');
  return decision(
    report,
    'resolve',
    false,
    'Resolve prepared; report status persistence belongs to a later task.'
  );
}

/**
 * Execute a moderation action against a report id.
 * Target ids come only from the persisted Report document.
 */
export async function executeModerationAction(
  reportId: number,
  action: unknown
): Promise<ModerationActionDecision> {
  const report = await loadReportForModeration(reportId);
  const validated = validateModerationAction(report, action);

  switch (validated) {
    case 'remove_listing':
      return removeReportedListing(report);
    case 'suspend_user':
      return suspendReportedUser(report);
    case 'warn':
      return prepareWarnDecision(report);
    case 'dismiss':
      return prepareDismissDecision(report);
    case 'resolve':
      return prepareResolveDecision(report);
    default: {
      const _exhaustive: never = validated;
      throw new ModerationActionError(400, `Unsupported action: ${_exhaustive}`);
    }
  }
}
