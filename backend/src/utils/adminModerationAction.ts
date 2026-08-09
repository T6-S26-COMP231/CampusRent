import { nextId } from '../models/Counter';
import { ModerationAudit, toModerationAuditRow } from '../models/ModerationAudit';
import { Report, normalizeReportModerationStatus } from '../models/Report';
import {
  AdminModerationReportView,
  getAdminModerationReport,
} from './moderationReports';
import {
  ModerationActionDecision,
  ModerationActionError,
  ModerationActionName,
  executeModerationAction,
} from './moderationActions';

/**
 * US-23.5 — admin-authorized moderation action orchestration.
 * Runs US-23.4 domain logic, persists dismiss/resolve status, and writes audit.
 */

export interface AdminModerationActionResult {
  action: ModerationActionName;
  decision: ModerationActionDecision;
  report: AdminModerationReportView['report'];
  target: AdminModerationReportView['target'];
  audit: {
    id: number;
    report_id: number;
    administrator_id: number;
    action: ModerationActionName;
    created_at: string;
  };
}

export async function performAdminModerationAction(
  reportId: number,
  action: unknown,
  administratorId: number
): Promise<AdminModerationActionResult> {
  if (!Number.isInteger(administratorId) || administratorId <= 0) {
    throw new ModerationActionError(400, 'Invalid administrator id');
  }

  // Domain mutations use only report.target_* from the stored Report.
  const decision = await executeModerationAction(reportId, action);

  const report = await Report.findById(decision.report_id);
  if (!report) {
    throw new ModerationActionError(404, 'Report not found');
  }

  if (decision.action === 'dismiss') {
    report.status = 'dismissed';
    await report.save();
  } else if (decision.action === 'resolve') {
    report.status = 'resolved';
    await report.save();
  } else {
    // warn / remove_listing / suspend_user leave status unchanged (default open).
    report.status = normalizeReportModerationStatus(report.status);
  }

  const audit = await ModerationAudit.create({
    _id: await nextId('moderation_audits'),
    report_id: report._id,
    administrator_id: administratorId,
    action: decision.action,
  });

  const view = await getAdminModerationReport(report._id);
  if (!view) {
    throw new ModerationActionError(404, 'Report not found');
  }

  return {
    action: decision.action,
    decision,
    report: view.report,
    target: view.target,
    audit: toModerationAuditRow(audit),
  };
}
