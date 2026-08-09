/**
 * US-20.6 — report form ↔ POST /api/reports integration helpers.
 * Pure logic only; no new React test framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REPORT_REASON_OPTIONS,
  REPORT_SUCCESS_MESSAGE,
  applyCancelledReportForm,
  buildSubmitReportBody,
  buildSubmitReportCall,
  canSubmitReport,
  normalizeReportDetails,
  normalizeReportReason,
  runReportSubmitFlow,
  toReportListingTarget,
  toReportUserTarget,
  type SubmitReportBody,
} from './reportContent';

describe('US-20.6 report form backend integration', () => {
  test('request contains target_type, target_id, trimmed reason/details; no reporter_id', () => {
    const listingTarget = toReportListingTarget({ id: 42, title: 'Tripod' });
    const call = buildSubmitReportCall(
      listingTarget,
      '  Misleading photos  ',
      '  Does not match description.  '
    );

    assert.equal(call.path, '/reports');
    assert.equal(call.method, 'POST');
    assert.equal(call.body.target_type, 'listing');
    assert.equal(call.body.target_id, 42);
    assert.equal(call.body.reason, 'Misleading photos');
    assert.equal(call.body.details, 'Does not match description.');
    assert.equal('reporter_id' in call.body, false);
    assert.equal(JSON.stringify(call.body).includes('reporter_id'), false);
  });

  test('listing report uses listing id; user report uses user id', () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Camera' });
    const userTarget = toReportUserTarget(
      { id: 4, first_name: 'Owner', last_name: 'Student' },
      { listingId: 12, listingTitle: 'Camera' }
    );

    const listingBody = buildSubmitReportBody(
      listingTarget,
      'Spam',
      'Repeated junk listing.'
    );
    const userBody = buildSubmitReportBody(
      userTarget,
      'Harassment',
      'Threatening rental messages.'
    );

    assert.equal(listingBody.target_type, 'listing');
    assert.equal(listingBody.target_id, 12);
    assert.equal(userBody.target_type, 'user');
    assert.equal(userBody.target_id, 4);
    assert.notEqual(userBody.target_id, listingBody.target_id);
  });

  test('reason and details helpers trim whitespace', () => {
    assert.equal(normalizeReportReason('  Free text  '), 'Free text');
    assert.equal(normalizeReportDetails('  Supporting details.  '), 'Supporting details.');
  });

  test('successful request produces success state and clears draft', async () => {
    const target = toReportListingTarget({ id: 7, title: 'Bike' });
    let submitted: SubmitReportBody | null = null;

    const result = await runReportSubmitFlow(
      target,
      '  Scam concern  ',
      '  Asked for off-platform payment.  ',
      async (body) => {
        submitted = body;
        return {
          id: 1,
          reporter_id: 9,
          target_type: body.target_type,
          target_id: body.target_id,
          reason: body.reason,
          details: body.details,
          created_at: '2026-08-08T20:00:00.000Z',
        };
      }
    );

    assert.ok(submitted);
    assert.equal(submitted!.target_type, 'listing');
    assert.equal(submitted!.target_id, 7);
    assert.equal(submitted!.reason, 'Scam concern');
    assert.equal(submitted!.details, 'Asked for off-platform payment.');
    assert.equal('reporter_id' in submitted!, false);
    assert.equal(result.success, REPORT_SUCCESS_MESSAGE);
    assert.equal(result.success, 'Report submitted successfully.');
    assert.equal(result.reason, '');
    assert.equal(result.details, '');
    assert.equal(result.error, '');
  });

  test('failed request preserves draft and exposes error state', async () => {
    const target = toReportUserTarget({
      id: 4,
      first_name: 'Owner',
      last_name: 'Student',
    });

    const result = await runReportSubmitFlow(
      target,
      'Keep this reason',
      'Keep these details',
      async () => {
        throw new Error('User not found');
      }
    );

    assert.equal(result.success, '');
    assert.equal(result.error, 'User not found');
    assert.equal(result.reason, 'Keep this reason');
    assert.equal(result.details, 'Keep these details');
  });

  test('submitting blocks duplicate submit; cancel still clears draft', () => {
    const target = toReportListingTarget({ id: 3, title: 'Lamp' });
    assert.equal(
      canSubmitReport({
        target,
        reason: 'Spam',
        details: 'Junk content',
        submitting: true,
        viewerId: 9,
      }),
      false
    );
    assert.equal(
      canSubmitReport({
        target,
        reason: 'Spam',
        details: 'Junk content',
        submitting: false,
        viewerId: 9,
      }),
      true
    );

    const cancelled = applyCancelledReportForm();
    assert.deepEqual(cancelled, {
      reason: '',
      details: '',
      error: '',
      success: '',
    });
  });

  test('no category list or unsupported details max length introduced', () => {
    assert.deepEqual(REPORT_REASON_OPTIONS, []);
    const longDetails = 'x'.repeat(5000);
    const body = buildSubmitReportBody(
      toReportListingTarget({ id: 1, title: 'Item' }),
      'Reason',
      longDetails
    );
    assert.equal(body.details.length, 5000);
    assert.equal(typeof body.details, 'string');
  });

  test('auth/validation-style errors never claim success', async () => {
    const target = toReportListingTarget({ id: 9, title: 'Desk' });
    for (const message of [
      'target_type must be user or listing',
      'Unauthorized',
      'Forbidden',
      'Listing not found',
      'Request failed with status 500',
    ]) {
      const result = await runReportSubmitFlow(
        target,
        'Still here',
        'Still kept',
        async () => {
          throw new Error(message);
        }
      );
      assert.equal(result.success, '');
      assert.equal(result.error, message);
      assert.equal(result.reason, 'Still here');
      assert.equal(result.details, 'Still kept');
    }
  });
});
