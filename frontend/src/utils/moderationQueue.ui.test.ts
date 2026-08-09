/**
 * US-23.2 — moderation queue / report-detail UI helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MODERATION_ACTION_NOT_CONNECTED_MESSAGE,
  MODERATION_QUEUE_EMPTY_MESSAGE,
  MODERATION_TARGET_MISSING_LISTING,
  MODERATION_TARGET_MISSING_USER,
  applyModerationQueueFailure,
  applyModerationQueueLoaded,
  applyModerationQueueLoading,
  attemptModerationActionUi,
  beginModerationActionConfirm,
  cancelModerationActionConfirm,
  findModerationReportView,
  moderationActionButtonClass,
  moderationActionsDisabledReason,
  moderationQueueRowsFromViews,
  moderationQueueUiStatus,
  moderationReportViewToQueueRow,
  moderationTargetMissingMessage,
  selectModerationReport,
  visibleModerationActions,
  type ModerationReportView,
} from './moderationQueue';

const listingView: ModerationReportView = {
  report: {
    report_id: 10,
    reporter_id: 9,
    reporter_label: 'Ramika Student',
    reason: 'Misleading photos',
    details: 'Images do not match the item.',
    created_at: '2026-08-08T18:00:00.000Z',
    status: 'open',
    target_type: 'listing',
    target_id: 12,
  },
  target: {
    target_type: 'listing',
    listing_id: 12,
    exists: true,
    title: 'Campus Camera',
    owner_id: 4,
    owner_label: 'Test Test',
    category: 'Electronics',
    availability: 'available',
    description_preview: 'A campus camera for short rentals.',
  },
};

const userView: ModerationReportView = {
  report: {
    report_id: 11,
    reporter_id: 9,
    reporter_label: 'Ramika Student',
    reason: 'Harassment',
    details: 'Threatening rental messages.',
    created_at: '2026-08-08T19:00:00.000Z',
    status: 'open',
    target_type: 'user',
    target_id: 4,
  },
  target: {
    target_type: 'user',
    user_id: 4,
    exists: true,
    display_name: 'Test Test',
    email: 'test@mycentennialcollege.ca',
    verification_status: 'verified',
    account_status: 'active',
  },
};

const missingListingView: ModerationReportView = {
  report: {
    ...listingView.report,
    report_id: 12,
  },
  target: {
    target_type: 'listing',
    listing_id: 99,
    exists: false,
    title: null,
    owner_id: null,
    owner_label: null,
    category: null,
    availability: null,
    description_preview: null,
  },
};

describe('US-23.2 moderation queue and report-detail UI', () => {
  test('loading, empty, error, and populated queue states', () => {
    assert.equal(moderationQueueUiStatus(true, '', 0), 'loading');
    assert.equal(moderationQueueUiStatus(false, 'boom', 0), 'error');
    assert.equal(moderationQueueUiStatus(false, '', 0), 'empty');
    assert.equal(moderationQueueUiStatus(false, '', 2), 'populated');
    assert.equal(MODERATION_QUEUE_EMPTY_MESSAGE, 'No reports awaiting review.');

    assert.deepEqual(applyModerationQueueLoading(), { status: 'loading', error: '' });
    assert.deepEqual(applyModerationQueueLoaded([]), {
      status: 'empty',
      rows: [],
      error: '',
    });

    const loaded = applyModerationQueueLoaded([listingView, userView]);
    assert.equal(loaded.status, 'populated');
    assert.equal(loaded.rows.length, 2);
    assert.equal(loaded.rows[0].report_id, 11);
    assert.equal(loaded.rows[1].report_id, 10);

    const failed = applyModerationQueueFailure(new Error('Network down'));
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Network down');
    assert.deepEqual(failed.rows, []);
    assert.equal(failed.selectedReportId, null);
  });

  test('report row rendering contract from view-model', () => {
    const row = moderationReportViewToQueueRow(listingView);
    assert.equal(row.report_id, 10);
    assert.equal(row.target_type, 'listing');
    assert.equal(row.target_label, 'Campus Camera');
    assert.equal(row.reporter_label, 'Ramika Student');
    assert.equal(row.reason, 'Misleading photos');
    assert.equal(row.created_at, '2026-08-08T18:00:00.000Z');
    assert.equal(row.status, 'open');
    assert.equal(row.target_exists, true);
  });

  test('selecting a report resolves detail view; empty selection is null', () => {
    const views = [listingView, userView];
    assert.equal(findModerationReportView(views, null), null);
    assert.equal(selectModerationReport(null, 10), 10);
    const selected = findModerationReportView(views, 10);
    assert.ok(selected);
    assert.equal(selected!.report.report_id, 10);
    assert.equal(selected!.report.reason, 'Misleading photos');
    assert.equal(selected!.report.details, 'Images do not match the item.');
    assert.equal(selected!.target.target_type, 'listing');
  });

  test('listing-target and user-target detail contracts', () => {
    assert.equal(listingView.target.target_type, 'listing');
    if (listingView.target.target_type === 'listing') {
      assert.equal(listingView.target.title, 'Campus Camera');
      assert.equal(listingView.target.owner_label, 'Test Test');
      assert.equal(listingView.target.category, 'Electronics');
      assert.equal(listingView.target.availability, 'available');
      assert.equal(listingView.target.description_preview, 'A campus camera for short rentals.');
      assert.equal(listingView.target.exists, true);
    }

    assert.equal(userView.target.target_type, 'user');
    if (userView.target.target_type === 'user') {
      assert.equal(userView.target.display_name, 'Test Test');
      assert.equal(userView.target.email, 'test@mycentennialcollege.ca');
      assert.equal(userView.target.verification_status, 'verified');
      assert.equal(userView.target.account_status, 'active');
      assert.equal(userView.target.exists, true);
    }
  });

  test('missing target state surfaces dedicated messaging', () => {
    const row = moderationReportViewToQueueRow(missingListingView);
    assert.equal(row.target_exists, false);
    assert.equal(row.target_label, 'Listing #99');
    assert.equal(
      moderationTargetMissingMessage(missingListingView.target),
      MODERATION_TARGET_MISSING_LISTING
    );
    assert.equal(
      moderationTargetMissingMessage(userView.target),
      MODERATION_TARGET_MISSING_USER
    );
  });

  test('listing report shows remove-listing; user report shows suspend-user; shared actions appear', () => {
    const listingActions = visibleModerationActions('listing', 'open');
    const userActions = visibleModerationActions('user', 'open');

    assert.deepEqual(listingActions, ['warn', 'remove_listing', 'resolve', 'dismiss']);
    assert.deepEqual(userActions, ['warn', 'suspend_user', 'resolve', 'dismiss']);
    assert.ok(listingActions.includes('warn'));
    assert.ok(listingActions.includes('resolve'));
    assert.ok(listingActions.includes('dismiss'));
    assert.ok(!listingActions.includes('suspend_user'));
    assert.ok(!userActions.includes('remove_listing'));
    assert.equal(moderationActionButtonClass('remove_listing'), 'danger');
    assert.equal(moderationActionButtonClass('suspend_user'), 'danger');
  });

  test('destructive confirmation UI state; actions never claim success without handler', () => {
    const confirm = beginModerationActionConfirm('remove_listing');
    assert.equal(confirm.pendingAction, 'remove_listing');
    assert.equal(confirm.notice, '');

    const cancelled = cancelModerationActionConfirm();
    assert.equal(cancelled.pendingAction, null);

    const needsConfirm = attemptModerationActionUi('suspend_user');
    assert.equal(needsConfirm.pendingAction, 'suspend_user');
    assert.equal(needsConfirm.notice, '');

    const notConnected = attemptModerationActionUi('warn');
    assert.equal(notConnected.pendingAction, null);
    assert.equal(notConnected.notice, MODERATION_ACTION_NOT_CONNECTED_MESSAGE);
    assert.doesNotMatch(notConnected.notice, /success/i);

    const confirmedNotConnected = attemptModerationActionUi('remove_listing', {
      confirmed: true,
    });
    assert.equal(confirmedNotConnected.notice, MODERATION_ACTION_NOT_CONNECTED_MESSAGE);

    let called: string | null = null;
    const withHandler = attemptModerationActionUi('resolve', {
      onAction: (action) => {
        called = action;
      },
    });
    assert.equal(called, 'resolve');
    assert.equal(withHandler.notice, '');
  });

  test('closed reports disable actions; admin UI does not fabricate report data', () => {
    assert.equal(moderationActionsDisabledReason('resolved'), 'This report is resolved.');
    assert.deepEqual(visibleModerationActions('listing', 'resolved'), []);
    assert.deepEqual(moderationQueueRowsFromViews([]), []);
    assert.equal(applyModerationQueueLoaded([]).status, 'empty');
  });
});
