import mongoose, { Schema } from 'mongoose';
import {
  MODERATION_ACTION_NAMES,
  ModerationActionName,
} from '../utils/moderationActions';

/**
 * US-23.5 — persistent moderation audit trail.
 * Records who performed which action on which report, and when.
 */

export interface ModerationAuditDoc {
  _id: number;
  report_id: number;
  administrator_id: number;
  action: ModerationActionName;
  created_at: Date;
}

const moderationAuditSchema = new Schema<ModerationAuditDoc>(
  {
    _id: { type: Number, required: true },
    report_id: { type: Number, required: true, index: true, min: 1 },
    administrator_id: { type: Number, required: true, index: true, min: 1 },
    action: {
      type: String,
      required: true,
      enum: MODERATION_ACTION_NAMES,
    },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

moderationAuditSchema.index(
  { report_id: 1, created_at: -1 },
  { name: 'idx_moderation_audit_report' }
);

export const ModerationAudit =
  mongoose.models.ModerationAudit ||
  mongoose.model<ModerationAuditDoc>('ModerationAudit', moderationAuditSchema);

export function toModerationAuditRow(audit: ModerationAuditDoc) {
  return {
    id: audit._id,
    report_id: audit.report_id,
    administrator_id: audit.administrator_id,
    action: audit.action,
    created_at: audit.created_at.toISOString(),
  };
}
