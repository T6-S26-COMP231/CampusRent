/**
 * US-20.1 / US-20.2 — report form-flow and reason-control helpers.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CANCEL_REPORT_LABEL,
  REPORT_INCOMPLETE_DETAILS_MESSAGE,
  REPORT_INCOMPLETE_REASON_MESSAGE,
  REPORT_LISTING_ENTRY_LABEL,
  REPORT_LISTING_HEADING,
  REPORT_NOT_CONNECTED_MESSAGE,
  REPORT_REASON_OPTIONS,
  REPORT_REASON_PLACEHOLDER,
  REPORT_SUCCESS_MESSAGE,
  REPORT_USER_ENTRY_LABEL,
  REPORT_USER_HEADING,
  SUBMIT_REPORT_LABEL,
  SUBMITTING_REPORT_LABEL,
  applyCancelledReportForm,
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
  reportTargetId,
  reportTargetSummary,
  reportValidationMessages,
  submitBodyMatchesTrustedTarget,
  toReportListingTarget,
  toReportUserTarget,
} from './reportContent';

describe('US-20.2 report form and reason controls', () => {
  test('blank and whitespace reason are invalid; non-empty reason is valid', () => {
    assert.equal(hasReportReason(''), false);
    assert.equal(hasReportReason('   '), false);
    assert.equal(hasReportReason('Misleading listing'), true);
    assert.equal(REPORT_REASON_PLACEHOLDER, 'Enter a reason');
  });

  test('blank and whitespace details are invalid; non-empty details are valid', () => {
    assert.equal(isBlankReportDetails(''), true);
    assert.equal(isBlankReportDetails('   \n\t  '), true);
    assert.equal(isBlankReportDetails('Needs admin review'), false);
  });

  test('valid reason + details are allowed by the submit gate', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'Fake photos',
        details: 'Images do not match the item.',
        submitting: false,
        viewerId: 9,
      }),
      true
    );

    const messages = reportValidationMessages({
      reason: 'Fake photos',
      details: 'Images do not match the item.',
    });
    assert.equal(messages.reason, '');
    assert.equal(messages.details, '');
  });

  test('incomplete reason or details produce validation messages', () => {
    const incomplete = reportValidationMessages({ reason: '  ', details: '' });
    assert.equal(incomplete.reason, REPORT_INCOMPLETE_REASON_MESSAGE);
    assert.equal(incomplete.details, REPORT_INCOMPLETE_DETAILS_MESSAGE);
  });

  test('trusted listing and user target conversion', () => {
    const listingTarget = toReportListingTarget({
      id: 12,
      title: '  Campus Camera  ',
    });
    assert.equal(listingTarget.type, 'listing');
    assert.equal(listingTarget.listingId, 12);
    assert.equal(listingTarget.listingTitle, 'Campus Camera');
    assert.equal(reportTargetId(listingTarget), 12);
    assert.equal(reportTargetSummary(listingTarget), 'Listing: Campus Camera');
    assert.equal(reportFormHeading('listing'), REPORT_LISTING_HEADING);
    assert.equal(reportEntryLabel('listing'), REPORT_LISTING_ENTRY_LABEL);

    const userTarget = toReportUserTarget(
      { id: 4, first_name: 'Owner', last_name: 'Student' },
      { listingId: 12, listingTitle: 'Campus Camera' }
    );
    assert.equal(userTarget.type, 'user');
    assert.equal(userTarget.userId, 4);
    assert.equal(reportTargetId(userTarget), 4);
    assert.equal(
      reportTargetSummary(userTarget),
      'User: Owner Student · Listing: Campus Camera'
    );
    assert.equal(reportFormHeading('user'), REPORT_USER_HEADING);
    assert.equal(reportEntryLabel('user'), REPORT_USER_ENTRY_LABEL);
  });

  test('request-body helper excludes reporter_id and uses trusted target id only', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    const body = buildSubmitReportBody(
      listingTarget,
      '  Misleading  ',
      '  Payment requested off-platform.  '
    );
    assert.deepEqual(body, {
      target_type: 'listing',
      target_id: 12,
      reason: 'Misleading',
      details: 'Payment requested off-platform.',
    });
    assert.equal('reporter_id' in body, false);
    assert.equal(submitBodyMatchesTrustedTarget(listingTarget, body), true);

    // Editable spoof values are irrelevant — body is built only from trusted target.
    const spoofedBody = {
      ...body,
      target_id: 999,
    };
    assert.equal(submitBodyMatchesTrustedTarget(listingTarget, spoofedBody), false);
  });

  test('submit-state helper disables duplicate submit and self-report', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    const userTarget = toReportUserTarget({
      id: 4,
      first_name: 'Owner',
      last_name: 'Student',
    });

    assert.equal(canReportTarget(4, userTarget), false);
    assert.equal(canReportTarget(9, userTarget), true);
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'Spam',
        details: 'Repeated junk posts.',
        submitting: true,
        viewerId: 9,
      }),
      false
    );
    assert.equal(reportSubmitLabel(false), SUBMIT_REPORT_LABEL);
    assert.equal(reportSubmitLabel(true), SUBMITTING_REPORT_LABEL);
  });

  test('cancel/reset clears draft; failure preserves entered values', () => {
    const cancelled = applyCancelledReportForm();
    assert.deepEqual(cancelled, {
      reason: '',
      details: '',
      error: '',
      success: '',
    });
    assert.equal(CANCEL_REPORT_LABEL, 'Cancel');

    const failed = applyFailedReportSubmit(
      'Keep reason',
      'Keep details',
      new Error(REPORT_NOT_CONNECTED_MESSAGE)
    );
    assert.equal(failed.reason, 'Keep reason');
    assert.equal(failed.details, 'Keep details');
    assert.equal(failed.error, REPORT_NOT_CONNECTED_MESSAGE);
    assert.equal(failed.success, '');

    const success = applySuccessfulReportSubmit();
    assert.equal(success.success, REPORT_SUCCESS_MESSAGE);
    assert.equal(success.reason, '');
  });

  test('no category-list requirement exists for the reason control', () => {
    assert.deepEqual(REPORT_REASON_OPTIONS, []);
    assert.equal(isApprovedReportReason('anything', []), false);
    assert.equal(hasReportReason('free text reason'), true);
  });
});
