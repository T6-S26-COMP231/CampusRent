/**
 * US-20.1 — report form-flow design helpers.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CANCEL_REPORT_LABEL,
  REPORT_INCOMPLETE_DETAILS_MESSAGE,
  REPORT_INCOMPLETE_REASON_MESSAGE,
  REPORT_LISTING_ENTRY_LABEL,
  REPORT_LISTING_HEADING,
  REPORT_REASON_OPTIONS,
  REPORT_SUCCESS_MESSAGE,
  REPORT_USER_ENTRY_LABEL,
  REPORT_USER_HEADING,
  SUBMIT_REPORT_LABEL,
  SUBMITTING_REPORT_LABEL,
  applyFailedReportSubmit,
  applySuccessfulReportSubmit,
  buildSubmitReportBody,
  canReportTarget,
  canSubmitReport,
  hasReportReason,
  isApprovedReportReason,
  isBlankReportDetails,
  reportEntryLabel,
  reportFormHeading,
  reportSubmitLabel,
  reportTargetSummary,
  reportValidationMessages,
  toReportListingTarget,
  toReportUserTarget,
} from './reportContent';

describe('US-20.1 report-user and report-listing form-flow design', () => {
  test('listing and user entry targets come from trusted page context only', () => {
    const listingTarget = toReportListingTarget({
      id: 12,
      title: '  Campus Camera  ',
    });
    assert.equal(listingTarget.type, 'listing');
    assert.equal(listingTarget.listingId, 12);
    assert.equal(listingTarget.listingTitle, 'Campus Camera');
    assert.equal(reportTargetSummary(listingTarget), 'Listing: Campus Camera');
    assert.equal(reportFormHeading('listing'), REPORT_LISTING_HEADING);
    assert.equal(reportEntryLabel('listing'), REPORT_LISTING_ENTRY_LABEL);

    const userTarget = toReportUserTarget(
      { id: 4, first_name: 'Owner', last_name: 'Student' },
      { listingId: 12, listingTitle: 'Campus Camera' }
    );
    assert.equal(userTarget.type, 'user');
    assert.equal(userTarget.userId, 4);
    assert.equal(userTarget.userName, 'Owner Student');
    assert.equal(userTarget.contextListingId, 12);
    assert.equal(
      reportTargetSummary(userTarget),
      'User: Owner Student · Listing: Campus Camera'
    );
    assert.equal(reportFormHeading('user'), REPORT_USER_HEADING);
    assert.equal(reportEntryLabel('user'), REPORT_USER_ENTRY_LABEL);
  });

  test('reason is required without inventing a closed production category list', () => {
    assert.deepEqual(REPORT_REASON_OPTIONS, []);
    assert.equal(hasReportReason(''), false);
    assert.equal(hasReportReason('   '), false);
    assert.equal(hasReportReason('some-approved-value'), true);
    assert.equal(CANCEL_REPORT_LABEL, 'Cancel');

    // US-20.5 hook: membership checks use a supplied approved list, not a hardcoded one.
    assert.equal(isApprovedReportReason('alpha', []), false);
    assert.equal(isApprovedReportReason('alpha', ['alpha', 'beta']), true);
    assert.equal(isApprovedReportReason('  alpha  ', ['alpha']), true);
    assert.equal(isApprovedReportReason('gamma', ['alpha', 'beta']), false);
  });

  test('supporting details are required, trimmed, and non-empty with no max length', () => {
    assert.equal(isBlankReportDetails(''), true);
    assert.equal(isBlankReportDetails('   '), true);
    assert.equal(isBlankReportDetails('Needs review'), false);

    const incomplete = reportValidationMessages({ reason: '', details: '' });
    assert.equal(incomplete.reason, REPORT_INCOMPLETE_REASON_MESSAGE);
    assert.equal(incomplete.details, REPORT_INCOMPLETE_DETAILS_MESSAGE);

    const valid = reportValidationMessages({
      reason: 'needs-review',
      details: 'Threatening messages about a rental.',
    });
    assert.equal(valid.reason, '');
    assert.equal(valid.details, '');
  });

  test('submit gate blocks self-report, incomplete input, and double submit', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    const userTarget = toReportUserTarget({
      id: 4,
      first_name: 'Owner',
      last_name: 'Student',
    });

    assert.equal(canReportTarget(9, listingTarget), true);
    assert.equal(canReportTarget(4, userTarget), false);
    assert.equal(canReportTarget(9, userTarget), true);
    assert.equal(canReportTarget(undefined, listingTarget), false);

    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'needs-review',
        details: 'Looks like a fake listing.',
        submitting: false,
        viewerId: 9,
      }),
      true
    );
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: '',
        details: 'Looks like a fake listing.',
        submitting: false,
        viewerId: 9,
      }),
      false
    );
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'needs-review',
        details: 'Looks like a fake listing.',
        submitting: true,
        viewerId: 9,
      }),
      false
    );
    assert.equal(reportSubmitLabel(false), SUBMIT_REPORT_LABEL);
    assert.equal(reportSubmitLabel(true), SUBMITTING_REPORT_LABEL);
  });

  test('request body uses trusted target ids and never includes reporter_id', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    const body = buildSubmitReportBody(
      listingTarget,
      '  off-platform-payment  ',
      '  Payment requested off-platform.  '
    );
    assert.deepEqual(body, {
      target_type: 'listing',
      target_id: 12,
      reason: 'off-platform-payment',
      details: 'Payment requested off-platform.',
    });
    assert.equal('reporter_id' in body, false);

    const userBody = buildSubmitReportBody(
      toReportUserTarget({ id: 4, first_name: 'Owner', last_name: 'Student' }),
      'conduct',
      'Repeated no-shows.'
    );
    assert.equal(userBody.target_type, 'user');
    assert.equal(userBody.target_id, 4);
  });

  test('success clears draft; failure preserves typed content', () => {
    const success = applySuccessfulReportSubmit();
    assert.equal(success.reason, '');
    assert.equal(success.details, '');
    assert.equal(success.error, '');
    assert.equal(success.success, REPORT_SUCCESS_MESSAGE);

    const failed = applyFailedReportSubmit(
      'needs-review',
      'Keep this explanation',
      new Error('Database unavailable')
    );
    assert.equal(failed.reason, 'needs-review');
    assert.equal(failed.details, 'Keep this explanation');
    assert.equal(failed.error, 'Database unavailable');
    assert.equal(failed.success, '');
  });
});
