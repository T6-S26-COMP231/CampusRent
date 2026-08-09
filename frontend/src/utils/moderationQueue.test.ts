/**
 * US-23.1 — moderation-queue workflow design helpers.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MODERATION_ACTIONS,
  MODERATION_API_PATHS,
  MODERATION_QUEUE_HEADING,
  MODERATION_SECTION_LABEL,
  MODERATION_STATUSES,
  MODERATION_WORKFLOW_STEPS,
  actionsForListingReport,
  actionsForUserReport,
  buildModerationAuditRecord,
  canPerformModerationAction,
  filterOpenModerationQueueRows,
  formatModerationListingLabel,
  formatModerationPersonLabel,
  isModerationAction,
  moderationActionClosesReport,
  moderationActionRequiresConfirm,
  moderationActionResultStatus,
  moderationConfirmMessage,
  moderationStatusLabel,
  normalizeModerationStatus,
  sortModerationQueueRows,
  toModerationQueueRow,
  toModerationReportDetail,
  type ModerationQueueRow,
  type ModerationReportSource,
} from './moderationQueue';

const sampleListingReport: ModerationReportSource = {
  id: 10,
  reporter_id: 9,
  target_type: 'listing',
  target_id: 12,
  reason: 'Misleading photos',
  details: 'Images do not match the item.',
  created_at: '2026-08-08T18:00:00.000Z',
};

const sampleUserReport: ModerationReportSource = {
  id: 11,
  reporter_id: 9,
  target_type: 'user',
  target_id: 4,
  reason: 'Harassment',
  details: 'Threatening rental messages.',
  created_at: '2026-08-08T19:00:00.000Z',
};

describe('US-23.1 moderation-queue workflow design', () => {
  test('queue consumes US-20 report fields without inventing a second collection', () => {
    const row = toModerationQueueRow(
      sampleListingReport,
      { label: 'Campus Camera', exists: true, target_type: 'listing', target_id: 12 },
      { label: 'Ramika Student', exists: true, reporter_id: 9 }
    );

    assert.equal(row.report_id, 10);
    assert.equal(row.target_type, 'listing');
    assert.equal(row.target_id, 12);
    assert.equal(row.target_label, 'Campus Camera');
    assert.equal(row.reporter_id, 9);
    assert.equal(row.reporter_label, 'Ramika Student');
    assert.equal(row.reason, 'Misleading photos');
    assert.equal(row.created_at, sampleListingReport.created_at);
    assert.equal(row.status, 'open');
    assert.equal(MODERATION_SECTION_LABEL, 'Moderation');
    assert.equal(MODERATION_QUEUE_HEADING, 'Reported content');
    assert.equal(MODERATION_API_PATHS.list, '/admin/reports');
  });

  test('missing status defaults to open; resolve/dismiss close distinctly', () => {
    assert.deepEqual(MODERATION_STATUSES, ['open', 'resolved', 'dismissed']);
    assert.equal(normalizeModerationStatus(undefined), 'open');
    assert.equal(moderationStatusLabel(undefined), 'Open');
    assert.equal(moderationActionResultStatus('resolve'), 'resolved');
    assert.equal(moderationActionResultStatus('dismiss'), 'dismissed');
    assert.equal(moderationActionResultStatus('warn'), null);
    assert.equal(moderationActionClosesReport('resolve'), true);
    assert.equal(moderationActionClosesReport('dismiss'), true);
    assert.equal(moderationActionClosesReport('warn'), false);
  });

  test('TAC and GitHub #155 actions are listed; listing vs user action sets differ', () => {
    assert.ok(MODERATION_ACTIONS.includes('warn'));
    assert.ok(MODERATION_ACTIONS.includes('remove_listing'));
    assert.ok(MODERATION_ACTIONS.includes('suspend_user'));
    assert.ok(MODERATION_ACTIONS.includes('resolve'));
    assert.ok(MODERATION_ACTIONS.includes('dismiss'));
    assert.equal(isModerationAction('shadow_ban'), false);

    assert.deepEqual(actionsForListingReport(), [
      'warn',
      'remove_listing',
      'resolve',
      'dismiss',
    ]);
    assert.deepEqual(actionsForUserReport(), ['warn', 'suspend_user', 'resolve', 'dismiss']);
    assert.equal(canPerformModerationAction('listing', 'remove_listing', 'open'), true);
    assert.equal(canPerformModerationAction('listing', 'suspend_user', 'open'), false);
    assert.equal(canPerformModerationAction('user', 'suspend_user', 'open'), true);
    assert.equal(canPerformModerationAction('user', 'remove_listing', 'open'), false);
    assert.equal(canPerformModerationAction('listing', 'resolve', 'resolved'), false);
  });

  test('destructive actions require confirmation; audit shape is minimal', () => {
    assert.equal(moderationActionRequiresConfirm('remove_listing'), true);
    assert.equal(moderationActionRequiresConfirm('suspend_user'), true);
    assert.equal(moderationActionRequiresConfirm('warn'), false);
    assert.equal(moderationActionRequiresConfirm('dismiss'), false);
    assert.match(moderationConfirmMessage('remove_listing'), /Remove this listing/i);
    assert.match(moderationConfirmMessage('suspend_user'), /Suspend this user/i);

    const audit = buildModerationAuditRecord(10, 1, 'remove_listing', '2026-08-08T20:00:00.000Z');
    assert.deepEqual(audit, {
      report_id: 10,
      administrator_id: 1,
      action: 'remove_listing',
      created_at: '2026-08-08T20:00:00.000Z',
    });
  });

  test('report detail and target labels support listing/user review panels', () => {
    const detail = toModerationReportDetail(sampleUserReport, 'Ramika Student');
    assert.equal(detail.report_id, 11);
    assert.equal(detail.reporter_label, 'Ramika Student');
    assert.equal(detail.reason, 'Harassment');
    assert.equal(detail.details, 'Threatening rental messages.');
    assert.equal(detail.target_type, 'user');
    assert.equal(detail.target_id, 4);
    assert.equal(detail.status, 'open');

    assert.equal(
      formatModerationListingLabel({ title: '  Campus Camera  ' }, 12),
      'Campus Camera'
    );
    assert.equal(formatModerationListingLabel(null, 12), 'Listing #12');
    assert.equal(
      formatModerationPersonLabel(
        { first_name: 'Test', last_name: 'Test', email: 'test@mycentennialcollege.ca' },
        4
      ),
      'Test Test'
    );
    assert.equal(formatModerationPersonLabel(null, 4), 'User #4');
  });

  test('queue sorts newest-first and can filter open reports for review', () => {
    const older = toModerationQueueRow(sampleListingReport);
    const newer = toModerationQueueRow(sampleUserReport);
    const resolved: ModerationQueueRow = {
      ...newer,
      report_id: 12,
      status: 'resolved',
      created_at: '2026-08-08T21:00:00.000Z',
    };

    const sorted = sortModerationQueueRows([older, resolved, newer]);
    assert.deepEqual(
      sorted.map((row) => row.report_id),
      [12, 11, 10]
    );
    assert.deepEqual(
      filterOpenModerationQueueRows(sorted).map((row) => row.report_id),
      [11, 10]
    );
  });

  test('workflow steps cover admin review through audit and close', () => {
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('open_admin_dashboard'));
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('view_submitted_reports'));
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('view_reported_target'));
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('confirm_destructive_action'));
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('record_moderation_audit'));
    assert.ok(MODERATION_WORKFLOW_STEPS.includes('close_report_status'));
    assert.equal(MODERATION_WORKFLOW_STEPS.length, 9);
  });
});
