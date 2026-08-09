/**
 * US-23.7 — frontend helper coverage mapped to Team6 TAC moderation UX.
 *
 * TAC Test 1 — View submitted reports → queue mapping / display states
 * TAC Test 2 — Review reported listing → detail selection + listing fields
 * TAC Test 3 — Remove violating listing → remove_listing after confirm only
 * TAC Test 4 — Suspend violating user → suspend_user after confirm only
 * TAC Test 5 — Resolve report → resolved status from server response
 *
 * Also covers client request body trust model and failure/success refresh.
 *
 * Broader detail remains in moderationQueue.ui.test.ts and
 * moderationQueue.integration.test.ts. This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; AdminPage /
 * ModerationQueue / ModerationReportDetail rendering is not exercised here.
 *
 * US-20 TAC Test 4 remains PENDING for production/manual acceptance after deploy.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MODERATION_QUEUE_EMPTY_MESSAGE,
  MODERATION_RESOLVE_SUCCESS_MESSAGE,
  MODERATION_WARN_SUCCESS_MESSAGE,
  applyModerationActionSuccessToViews,
  buildPerformModerationActionCall,
  canSubmitModerationAction,
  findModerationReportView,
  mapAdminReportApiToView,
  mapAdminReportsApiToViews,
  moderationActionBodyExcludesClientIdentity,
  moderationActionRequiresConfirm,
  moderationQueueRowsFromViews,
  moderationQueueUiStatus,
  moderationStatusLabel,
  moderationWarnSuccessIsTruthful,
  preserveSelectedReportId,
  runModerationActionFlow,
  runModerationQueueLoadFlow,
  type ModerationReportView,
} from './moderationQueue';

/**
 * Keep aligned with us-20-acceptance.test.ts.
 * Automated US-23 proof must not flip US-20 Test 4 to PASSED.
 */
const US_20_TAC_TEST_4_STATUS = 'PENDING US-23' as const;

const listingApiPayload = {
  report: {
    report_id: 55,
    reporter_id: 9,
    reporter: {
      id: 9,
      first_name: 'Ramika',
      last_name: 'Student',
      email: 'ramika@mycentennialcollege.ca',
    },
    reporter_label: 'Ramika Student',
    reason: 'Misleading photos',
    details: 'Images do not match the item.',
    created_at: '2026-08-08T18:00:00.000Z',
    status: 'open' as const,
    target_type: 'listing' as const,
    target_id: 12,
  },
  target: {
    target_type: 'listing' as const,
    listing_id: 12,
    exists: true,
    title: 'Campus Camera',
    owner_id: 4,
    owner_label: 'Test Owner',
    category: 'Electronics',
    availability: 'available' as const,
    description_preview: 'A campus camera for short rentals.',
  },
};

const userApiPayload = {
  report: {
    report_id: 56,
    reporter_id: 9,
    reporter: null,
    reporter_label: 'Ramika Student',
    reason: 'Harassment',
    details: 'Threatening rental messages.',
    created_at: '2026-08-08T19:00:00.000Z',
    status: 'open' as const,
    target_type: 'user' as const,
    target_id: 4,
  },
  target: {
    target_type: 'user' as const,
    user_id: 4,
    exists: true,
    display_name: 'Test Owner',
    email: 'owner@mycentennialcollege.ca',
    verification_status: 'verified' as const,
    account_status: 'active' as const,
  },
};

describe('US-23 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — View submitted reports maps real API queue data for display', async () => {
    assert.equal(moderationQueueUiStatus(true, '', 0), 'loading');

    const loaded = await runModerationQueueLoadFlow(async () => [listingApiPayload]);
    assert.equal(loaded.status, 'populated');
    assert.equal(loaded.rows.length, 1);
    assert.equal(loaded.rows[0].report_id, 55);
    assert.equal(loaded.rows[0].reason, 'Misleading photos');
    assert.equal(loaded.rows[0].reporter_label, 'Ramika Student');
    assert.equal(loaded.rows[0].target_label, 'Campus Camera');

    const empty = await runModerationQueueLoadFlow(async () => []);
    assert.equal(empty.status, 'empty');
    assert.equal(MODERATION_QUEUE_EMPTY_MESSAGE, 'No reports awaiting review.');

    const failed = await runModerationQueueLoadFlow(async () => {
      throw new Error('Unable to load reports.');
    });
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Unable to load reports.');
  });

  test('TAC Test 2 — Review reported listing: selection shows real listing detail fields', () => {
    const views = mapAdminReportsApiToViews([listingApiPayload, userApiPayload]);
    const selected = findModerationReportView(views, 55);
    assert.ok(selected);
    assert.equal(selected!.report.reason, 'Misleading photos');
    assert.equal(selected!.report.details, 'Images do not match the item.');
    assert.equal(selected!.report.reporter_label, 'Ramika Student');
    assert.equal(selected!.target.target_type, 'listing');
    if (selected!.target.target_type === 'listing') {
      assert.equal(selected!.target.exists, true);
      assert.equal(selected!.target.title, 'Campus Camera');
      assert.equal(selected!.target.owner_label, 'Test Owner');
      assert.equal(selected!.target.category, 'Electronics');
      assert.equal(selected!.target.availability, 'available');
      assert.equal(selected!.target.description_preview, 'A campus camera for short rentals.');
    }
  });

  test('TAC Test 3 — Remove violating listing waits for confirmation then sends remove_listing only', async () => {
    assert.equal(moderationActionRequiresConfirm('remove_listing'), true);

    let called = false;
    const pending = await runModerationActionFlow({
      reportId: 55,
      action: 'remove_listing',
      status: 'open',
      acting: false,
      confirmed: false,
      perform: async () => {
        called = true;
        return listingApiPayload;
      },
    });
    assert.equal(pending.kind, 'confirm');
    assert.equal(called, false);

    const call = buildPerformModerationActionCall(55, 'remove_listing');
    assert.equal(call.path, '/admin/reports/55/actions');
    assert.deepEqual(call.body, { action: 'remove_listing' });
    assert.equal(moderationActionBodyExcludesClientIdentity(call.body), true);

    const confirmed = await runModerationActionFlow({
      reportId: 55,
      action: 'remove_listing',
      status: 'open',
      acting: false,
      confirmed: true,
      perform: async (_id, action) => {
        called = true;
        assert.equal(action, 'remove_listing');
        return {
          report: listingApiPayload.report,
          target: {
            ...listingApiPayload.target,
            exists: false,
            title: null,
            owner_id: null,
            owner_label: null,
            category: null,
            availability: null,
            description_preview: null,
          },
        };
      },
    });
    assert.equal(called, true);
    assert.equal(confirmed.kind, 'success');
    assert.equal(confirmed.view?.target.exists, false);
  });

  test('TAC Test 4 — Suspend violating user waits for confirmation then sends suspend_user only', async () => {
    assert.equal(moderationActionRequiresConfirm('suspend_user'), true);

    let actionSent: string | null = null;
    const pending = await runModerationActionFlow({
      reportId: 56,
      action: 'suspend_user',
      status: 'open',
      acting: false,
      confirmed: false,
      perform: async () => userApiPayload,
    });
    assert.equal(pending.kind, 'confirm');

    const confirmed = await runModerationActionFlow({
      reportId: 56,
      action: 'suspend_user',
      status: 'open',
      acting: false,
      confirmed: true,
      perform: async (_id, action) => {
        actionSent = action;
        return {
          report: userApiPayload.report,
          target: { ...userApiPayload.target, account_status: 'suspended' },
        };
      },
    });
    assert.equal(actionSent, 'suspend_user');
    assert.equal(confirmed.kind, 'success');
    if (confirmed.view?.target.target_type === 'user') {
      assert.equal(confirmed.view.target.account_status, 'suspended');
    }

    const call = buildPerformModerationActionCall(56, 'suspend_user');
    assert.deepEqual(call.body, { action: 'suspend_user' });
    assert.equal('administrator_id' in call.body, false);
    assert.equal('target_id' in call.body, false);
    assert.equal('target_type' in call.body, false);
  });

  test('TAC Test 5 — Resolve report displays server-returned Resolved status', async () => {
    const resolved = await runModerationActionFlow({
      reportId: 55,
      action: 'resolve',
      status: 'open',
      acting: false,
      perform: async () => ({
        report: { ...listingApiPayload.report, status: 'resolved' },
        target: listingApiPayload.target,
      }),
    });
    assert.equal(resolved.kind, 'success');
    assert.equal(resolved.success, MODERATION_RESOLVE_SUCCESS_MESSAGE);
    assert.equal(resolved.view?.report.status, 'resolved');
    assert.equal(moderationStatusLabel(resolved.view!.report.status), 'Resolved');

    const initial = mapAdminReportsApiToViews([listingApiPayload]);
    const refreshed = applyModerationActionSuccessToViews(initial, resolved.view!);
    assert.equal(findModerationReportView(refreshed, 55)?.report.status, 'resolved');
    assert.equal(preserveSelectedReportId(55, refreshed), 55);

    const dismissed = await runModerationActionFlow({
      reportId: 56,
      action: 'dismiss',
      status: 'open',
      acting: false,
      perform: async () => ({
        report: { ...userApiPayload.report, status: 'dismissed' },
        target: userApiPayload.target,
      }),
    });
    assert.equal(dismissed.view?.report.status, 'dismissed');
    assert.equal(moderationStatusLabel(dismissed.view!.report.status), 'Dismissed');
  });

  test('client trust model, failure path, warn wording, and US-20 Test 4 still PENDING', async () => {
    for (const action of ['warn', 'remove_listing', 'suspend_user', 'resolve', 'dismiss'] as const) {
      const call = buildPerformModerationActionCall(55, action);
      assert.deepEqual(Object.keys(call.body), ['action']);
      assert.equal(moderationActionBodyExcludesClientIdentity(call.body), true);
    }

    assert.equal(canSubmitModerationAction({ acting: true, status: 'open' }), false);

    const failed = await runModerationActionFlow({
      reportId: 55,
      action: 'resolve',
      status: 'open',
      acting: false,
      perform: async () => {
        throw new Error('Unable to complete moderation action.');
      },
    });
    assert.equal(failed.kind, 'failure');
    assert.equal(failed.success, '');
    assert.equal(failed.retryable, true);
    assert.equal(failed.selectedReportId, 55);

    assert.equal(moderationWarnSuccessIsTruthful(MODERATION_WARN_SUCCESS_MESSAGE), true);
    assert.doesNotMatch(MODERATION_WARN_SUCCESS_MESSAGE, /email|notification delivered|user notified/i);

    // Cross-story support for US-20 Test 4 remains technical only — not production PASSED.
    assert.equal(US_20_TAC_TEST_4_STATUS, 'PENDING US-23');
    const mapped: ModerationReportView = mapAdminReportApiToView(listingApiPayload);
    assert.equal(moderationQueueRowsFromViews([mapped]).length, 1);
  });
});
