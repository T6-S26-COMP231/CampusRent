import mongoose, { Schema } from 'mongoose';

/**
 * US-20.3 / US-23.5 — Report persistence.
 *
 * One collection for both user and listing reports (target_type + target_id).
 * Reporter is stored as a user id only — never from editable frontend identity
 * fields. Reason and details are required, trimmed, non-empty.
 *
 * US-23.5 adds moderation status: open | resolved | dismissed (default open).
 */

export const REPORT_TARGET_TYPES = ['user', 'listing'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_MODERATION_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportModerationStatus = (typeof REPORT_MODERATION_STATUSES)[number];

export interface ReportDoc {
  _id: number;
  reporter_id: number;
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  details: string;
  status: ReportModerationStatus;
  created_at: Date;
}

function assertPositiveInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return numeric;
}

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === 'string' && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function normalizeReportTargetType(raw: unknown): ReportTargetType {
  if (raw == null || raw === '') {
    throw new Error('target_type is required');
  }
  if (!isReportTargetType(raw)) {
    throw new Error('target_type must be user or listing');
  }
  return raw;
}

/** Normalize and validate report reason for persistence. No closed category list. */
export function normalizeReportReason(raw: unknown): string {
  if (raw == null) {
    throw new Error('Report reason is required');
  }
  if (typeof raw !== 'string') {
    throw new Error('Report reason must be a string');
  }
  const reason = raw.trim();
  if (reason.length === 0) {
    throw new Error('Report reason cannot be blank');
  }
  return reason;
}

/** Normalize and validate supporting details. No invented maximum length. */
export function normalizeReportDetails(raw: unknown): string {
  if (raw == null) {
    throw new Error('Report details are required');
  }
  if (typeof raw !== 'string') {
    throw new Error('Report details must be a string');
  }
  const details = raw.trim();
  if (details.length === 0) {
    throw new Error('Report details cannot be blank');
  }
  return details;
}

export function assertReportIdentifiers(
  reporterId: unknown,
  targetType: unknown,
  targetId: unknown
): {
  reporter_id: number;
  target_type: ReportTargetType;
  target_id: number;
} {
  return {
    reporter_id: assertPositiveInteger(reporterId, 'reporter_id'),
    target_type: normalizeReportTargetType(targetType),
    target_id: assertPositiveInteger(targetId, 'target_id'),
  };
}

const reportSchema = new Schema<ReportDoc>(
  {
    _id: { type: Number, required: true },
    reporter_id: { type: Number, required: true, index: true, min: 1 },
    target_type: {
      type: String,
      required: true,
      enum: REPORT_TARGET_TYPES,
      index: true,
    },
    target_id: { type: Number, required: true, index: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    details: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: REPORT_MODERATION_STATUSES,
      default: 'open',
      index: true,
    },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/** Admin moderation listing: newest reports first. */
reportSchema.index({ created_at: -1, _id: -1 }, { name: 'idx_report_created_chronology' });

/** Lookup reports about a specific user or listing. */
reportSchema.index(
  { target_type: 1, target_id: 1, created_at: -1 },
  { name: 'idx_report_target' }
);

reportSchema.index({ status: 1, created_at: -1 }, { name: 'idx_report_status' });

reportSchema.pre('validate', function () {
  const ids = assertReportIdentifiers(this.reporter_id, this.target_type, this.target_id);
  this.reporter_id = ids.reporter_id;
  this.target_type = ids.target_type;
  this.target_id = ids.target_id;
  this.reason = normalizeReportReason(this.reason);
  this.details = normalizeReportDetails(this.details);
});

export const Report =
  mongoose.models.Report || mongoose.model<ReportDoc>('Report', reportSchema);

export function normalizeReportModerationStatus(
  status: ReportModerationStatus | undefined | null
): ReportModerationStatus {
  if (status && (REPORT_MODERATION_STATUSES as readonly string[]).includes(status)) {
    return status;
  }
  return 'open';
}

/** API-facing row shape for submit/list endpoints (US-20.4 / US-23). */
export function toReportRow(report: ReportDoc) {
  return {
    id: report._id,
    reporter_id: report.reporter_id,
    target_type: report.target_type,
    target_id: report.target_id,
    reason: report.reason,
    details: report.details,
    status: normalizeReportModerationStatus(report.status),
    created_at: report.created_at.toISOString(),
  };
}
