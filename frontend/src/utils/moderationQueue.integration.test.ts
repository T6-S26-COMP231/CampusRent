/**
 * US-23.6 — AdminPage moderation ↔ admin report APIs integration helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MODERATION_DISMISS_SUCCESS_MESSAGE,
  MODERATION_RESOLVE_SUCCESS_MESSAGE,
  MODERATION_WARN_SUCCESS_MESSAGE,
  applyModerationActionSuccessToViews,
  buildModerationActionRequestBody,
  buildPerformModerationActionCall,
  canSubmitModerationAction,
  findModerationReportView,
  mapAdminReportApiToView,
  mapAdminReportsApiToViews,
  moderationActionBodyExcludesClientIdentity,
  moderationActionSuccessMessage,
  moderationQueueUiStatus,
  moderationStatusLabel,
  moderationWarnSuccessIsTruthful,
  preserveSelectedReportId,
  runModerationActionFlow,
  runModerationQueueLoadFlow,
  type ModerationAction,
  type ModerationReportView,
} from './moderationQueue';

const openListingApi = {
  report: {
    report_id: 10,
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
    owner_label: 'Test Test',
    category: 'Electronics',
    availability: 'available' as const,
    description_preview: 'A campus camera for short rentals.',
  },
};

const openUserApi = {
  report: {
    report_id: 11,
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
    display_name: 'Test Test',
    email: 'test@mycentennialcollege.ca',
    verification_status: 'verified' as const,
    account_status: 'active' as const,
  },
};

describe('US-23.6 moderation API integration', () => {
  test('real queue response mapping, loading, empty, and API error', async () => {
    assert.equal(moderationQueueUiStatus(true, '', 0), 'loading');

    const loaded = await runModerationQueueLoadFlow(async () => [openListingApi, openUserApi]);
    assert.equal(loaded.status, 'populated');
    assert.equal(loaded.views.length, 2);
    assert.equal(loaded.rows.length, 2);
    assert.equal(loaded.error, '');
    assert.equal(loaded.views[0].report.reporter_label, 'Ramika Student');
    assert.equal(loaded.views.find((v) => v.report.report_id === 10)?.report.reason, 'Misleading photos');

    const empty = await runModerationQueueLoadFlow(async () => []);
    assert.equal(empty.status, 'empty');
    assert.deepEqual(empty.views, []);
    assert.deepEqual(empty.rows, []);

    const failed = await runModerationQueueLoadFlow(async () => {
      throw new Error('Forbidden');
    });
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Forbidden');
    assert.deepEqual(failed.views, []);
    assert.equal(failed.selectedReportId, null);
  });

  test('report selection and detail response mapping with persisted status', () => {
    const views = mapAdminReportsApiToViews([openListingApi, openUserApi]);
    const selectedId = 10;
    const detail = findModerationReportView(views, selectedId);
    assert.ok(detail);
    assert.equal(detail!.report.report_id, 10);
    assert.equal(detail!.report.reporter_label, 'Ramika Student');
    assert.equal(detail!.report.reason, 'Misleading photos');
    assert.equal(detail!.report.details, 'Images do not match the item.');
    assert.equal(detail!.report.status, 'open');
    assert.equal(detail!.target.target_type, 'listing');

    const refreshedDetail = mapAdminReportApiToView({
      report: { ...openListingApi.report, status: 'resolved' },
      target: openListingApi.target,
    });
    assert.equal(refreshedDetail.report.status, 'resolved');
    assert.equal(moderationStatusLabel(refreshedDetail.report.status), 'Resolved');

    const afterRefresh = applyModerationActionSuccessToViews(views, refreshedDetail);
    assert.equal(preserveSelectedReportId(10, afterRefresh), 10);
    assert.equal(findModerationReportView(afterRefresh, 10)?.report.status, 'resolved');
  });

  test('each action sends correct action only; body excludes admin/target identity', () => {
    const actions: ModerationAction[] = [
      'warn',
      'remove_listing',
      'suspend_user',
      'resolve',
      'dismiss',
    ];

    for (const action of actions) {
      const body = buildModerationActionRequestBody(action);
      assert.deepEqual(body, { action });
      assert.equal(Object.keys(body).length, 1);
      assert.equal('administrator_id' in body, false);
      assert.equal('target_id' in body, false);
      assert.equal('target_type' in body, false);
      assert.equal(moderationActionBodyExcludesClientIdentity(body), true);

      const call = buildPerformModerationActionCall(10, action);
      assert.equal(call.path, '/admin/reports/10/actions');
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.body, { action });
      assert.equal(JSON.stringify(call.body).includes('administrator_id'), false);
      assert.equal(JSON.stringify(call.body).includes('target_id'), false);
      assert.equal(JSON.stringify(call.body).includes('target_type'), false);
    }
  });

  test('destructive actions require confirmation before API call', async () => {
    let called = false;
    const confirmOnly = await runModerationActionFlow({
      reportId: 10,
      action: 'remove_listing',
      status: 'open',
      acting: false,
      confirmed: false,
      perform: async () => {
        called = true;
        return openListingApi;
      },
    });
    assert.equal(confirmOnly.kind, 'confirm');
    assert.equal(confirmOnly.pendingAction, 'remove_listing');
    assert.equal(called, false);

    const suspendConfirm = await runModerationActionFlow({
      reportId: 11,
      action: 'suspend_user',
      status: 'open',
      acting: false,
      confirmed: false,
      perform: async () => {
        called = true;
        return openUserApi;
      },
    });
    assert.equal(suspendConfirm.kind, 'confirm');
    assert.equal(called, false);

    const confirmed = await runModerationActionFlow({
      reportId: 10,
      action: 'remove_listing',
      status: 'open',
      acting: false,
      confirmed: true,
      perform: async (reportId, action) => {
        called = true;
        assert.equal(reportId, 10);
        assert.equal(action, 'remove_listing');
        return {
          report: openListingApi.report,
          target: { ...openListingApi.target, exists: false, title: null },
        };
      },
    });
    assert.equal(called, true);
    assert.equal(confirmed.kind, 'success');
    assert.equal(confirmed.view?.target.exists, false);
  });

  test('warn/resolve/dismiss send correct actions; warn copy is truthful', async () => {
    const sent: ModerationAction[] = [];

    const warn = await runModerationActionFlow({
      reportId: 10,
      action: 'warn',
      status: 'open',
      acting: false,
      perform: async (_id, action) => {
        sent.push(action);
        return openListingApi;
      },
    });
    assert.equal(warn.kind, 'success');
    assert.equal(warn.success, MODERATION_WARN_SUCCESS_MESSAGE);
    assert.equal(moderationWarnSuccessIsTruthful(warn.success), true);
    assert.doesNotMatch(warn.success, /email sent|notification delivered|user notified/i);

    const resolve = await runModerationActionFlow({
      reportId: 10,
      action: 'resolve',
      status: 'open',
      acting: false,
      perform: async (_id, action) => {
        sent.push(action);
        return {
          report: { ...openListingApi.report, status: 'resolved' },
          target: openListingApi.target,
        };
      },
    });
    assert.equal(resolve.kind, 'success');
    assert.equal(resolve.success, MODERATION_RESOLVE_SUCCESS_MESSAGE);
    assert.equal(resolve.view?.report.status, 'resolved');
    assert.equal(moderationStatusLabel(resolve.view!.report.status), 'Resolved');

    const dismiss = await runModerationActionFlow({
      reportId: 11,
      action: 'dismiss',
      status: 'open',
      acting: false,
      perform: async (_id, action) => {
        sent.push(action);
        return {
          report: { ...openUserApi.report, status: 'dismissed' },
          target: openUserApi.target,
        };
      },
    });
    assert.equal(dismiss.kind, 'success');
    assert.equal(dismiss.success, MODERATION_DISMISS_SUCCESS_MESSAGE);
    assert.equal(dismiss.view?.report.status, 'dismissed');
    assert.equal(moderationStatusLabel(dismiss.view!.report.status), 'Dismissed');

    assert.deepEqual(sent, ['warn', 'resolve', 'dismiss']);
    assert.equal(moderationActionSuccessMessage('warn'), MODERATION_WARN_SUCCESS_MESSAGE);
  });

  test('duplicate submission blocked; failure is retryable and does not claim success', async () => {
    assert.equal(canSubmitModerationAction({ acting: true, status: 'open' }), false);
    assert.equal(canSubmitModerationAction({ acting: false, status: 'open' }), true);

    let calls = 0;
    const blocked = await runModerationActionFlow({
      reportId: 10,
      action: 'warn',
      status: 'open',
      acting: true,
      perform: async () => {
        calls += 1;
        return openListingApi;
      },
    });
    assert.equal(blocked.kind, 'blocked');
    assert.equal(calls, 0);
    assert.equal(blocked.success, '');

    const failed = await runModerationActionFlow({
      reportId: 10,
      action: 'resolve',
      status: 'open',
      acting: false,
      perform: async () => {
        throw new Error('Report already closed');
      },
    });
    assert.equal(failed.kind, 'failure');
    assert.equal(failed.success, '');
    assert.equal(failed.error, 'Report already closed');
    assert.equal(failed.retryable, true);
    assert.equal(failed.selectedReportId, 10);

    const retry = await runModerationActionFlow({
      reportId: 10,
      action: 'resolve',
      status: 'open',
      acting: false,
      perform: async () => ({
        report: { ...openListingApi.report, status: 'resolved' },
        target: openListingApi.target,
      }),
    });
    assert.equal(retry.kind, 'success');
    assert.equal(retry.view?.report.status, 'resolved');
  });

  test('successful action refreshes queue/detail from server-returned state', async () => {
    const initial = mapAdminReportsApiToViews([openListingApi, openUserApi]);
    const suspended: ModerationReportView = mapAdminReportApiToView({
      report: openUserApi.report,
      target: { ...openUserApi.target, account_status: 'suspended' },
    });

    const afterSuspend = applyModerationActionSuccessToViews(initial, suspended);
    const selected = findModerationReportView(afterSuspend, 11);
    assert.ok(selected);
    assert.equal(selected!.target.target_type, 'user');
    if (selected!.target.target_type === 'user') {
      assert.equal(selected!.target.account_status, 'suspended');
    }
    assert.equal(preserveSelectedReportId(11, afterSuspend), 11);

    const reloaded = await runModerationQueueLoadFlow(
      async () => [
        openListingApi,
        {
          report: { ...openUserApi.report, status: 'open' },
          target: { ...openUserApi.target, account_status: 'suspended' },
        },
      ],
      11
    );
    assert.equal(reloaded.selectedReportId, 11);
    const detail = findModerationReportView(reloaded.views, 11);
    assert.ok(detail);
    if (detail!.target.target_type === 'user') {
      assert.equal(detail!.target.account_status, 'suspended');
    }
  });
});
