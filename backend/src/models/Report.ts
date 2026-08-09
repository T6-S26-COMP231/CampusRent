import mongoose, { Schema } from 'mongoose';

/**
 * US-20.3 — Report persistence.
 *
 * One collection for both user and listing reports (target_type + target_id).
 * Reporter is stored as a user id only — never from editable frontend identity
 * fields. Reason and details are required, trimmed, non-empty.
 *
 * Submit API, target-existence checks, and category enforcement belong to
 * US-20.4 / US-20.5. Moderation dashboard / actions belong to US-23.
 *
 * Indexes support later admin listing (created_at) and lookup by target or
 * reporter without inventing moderation status fields.
 */

export const REPORT_TARGET_TYPES = ['user', 'listing'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export interface ReportDoc {
  _id: number;
  reporter_id: number;
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  details: string;
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

/** API-facing row shape for later submit/list endpoints (US-20.4 / US-23). */
export function toReportRow(report: ReportDoc) {
  return {
    id: report._id,
    reporter_id: report.reporter_id,
    target_type: report.target_type,
    target_id: report.target_id,
    reason: report.reason,
    details: report.details,
    created_at: report.created_at.toISOString(),
  };
}
