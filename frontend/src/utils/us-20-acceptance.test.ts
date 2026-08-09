/**
 * US-20.7 — frontend helper coverage mapped to Team6 TAC report-submission UX.
 *
 * TAC Test 1 — Open report form → Form displayed
 * TAC Test 2 — Submit valid report → Report saved successfully
 * TAC Test 3 — Submit incomplete report → Validation error displayed
 * TAC Test 4 — Admin views report → Report appears in moderation dashboard
 *              Status: PENDING US-23 (not claimed here)
 *
 * Broader detail remains in reportContent.test.ts and
 * reportContent.integration.test.ts. This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; ReportContentForm /
 * ListingDetailPage / ConversationDetailPage rendering is not exercised here.
 * Form “display” is proven through the helper/form contract those pages use.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REPORT_DETAILS_LABEL,
  REPORT_DETAILS_PLACEHOLDER,
  REPORT_INCOMPLETE_DETAILS_MESSAGE,
  REPORT_INCOMPLETE_REASON_MESSAGE,
  REPORT_LISTING_ENTRY_LABEL,
  REPORT_LISTING_HEADING,
  REPORT_REASON_LABEL,
  REPORT_REASON_PLACEHOLDER,
  REPORT_SUCCESS_MESSAGE,
  REPORT_USER_ENTRY_LABEL,
  REPORT_USER_HEADING,
  buildSubmitReportBody,
  buildSubmitReportCall,
  canReportTarget,
  canSubmitReport,
  reportFormHeading,
  reportTargetId,
  reportTargetSummary,
  reportValidationMessages,
  runReportSubmitFlow,
  submitBodyMatchesTrustedTarget,
  toReportListingTarget,
  toReportUserTarget,
  type ReportTarget,
} from './reportContent';

/** Explicit cross-story marker — do not treat as a pass for US-20. */
export const US_20_TAC_TEST_4_STATUS = 'PENDING US-23' as const;
export const US_20_TAC_TEST_4_REASON =
  'Team6 TAC assigns the moderation queue / report-detail admin UI and report-list/detail APIs to US-23.';

/**
 * Mirrors ListingDetailPage report-entry wiring (trusted page context only).
 */
function listingDetailReportEntries(
  listing: {
    id: number;
    title: string;
    owner?: { id: number; first_name: string; last_name: string } | null;
  },
  viewerId: number | undefined
): { listing: ReportTarget | null; owner: ReportTarget | null } {
  const isOwner = viewerId != null && viewerId === listing.owner?.id;
  const listingTarget = toReportListingTarget(listing);
  const ownerTarget = listing.owner
    ? toReportUserTarget(listing.owner, {
        listingId: listing.id,
        listingTitle: listing.title,
      })
    : null;

  return {
    listing: !isOwner && canReportTarget(viewerId, listingTarget) ? listingTarget : null,
    owner:
      ownerTarget && canReportTarget(viewerId, ownerTarget) ? ownerTarget : null,
  };
}

/**
 * Mirrors ConversationDetailPage report-entry wiring (counterpart only).
 */
function conversationReportEntry(
  counterpart: { id: number; first_name: string; last_name: string } | null | undefined,
  context: { listingId?: number; listingTitle?: string },
  viewerId: number | undefined
): ReportTarget | null {
  if (!counterpart) return null;
  const target = toReportUserTarget(counterpart, context);
  return canReportTarget(viewerId, target) ? target : null;
}

describe('US-20 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — Open report form produces displayable form contract state', () => {
    const listing = {
      id: 12,
      title: 'Campus Camera',
      owner: { id: 4, first_name: 'Owner', last_name: 'Student' },
    };
    const viewerId = 9;
    const entries = listingDetailReportEntries(listing, viewerId);

    assert.ok(entries.listing);
    assert.equal(reportFormHeading(entries.listing!.type), REPORT_LISTING_HEADING);
    assert.equal(reportTargetSummary(entries.listing!), 'Listing: Campus Camera');
    assert.equal(reportTargetId(entries.listing!), 12);
    assert.equal(REPORT_LISTING_ENTRY_LABEL, 'Report listing');

    assert.ok(entries.owner);
    assert.equal(reportFormHeading(entries.owner!.type), REPORT_USER_HEADING);
    assert.equal(
      reportTargetSummary(entries.owner!),
      'User: Owner Student · Listing: Campus Camera'
    );
    assert.equal(reportTargetId(entries.owner!), 4);
    assert.equal(REPORT_USER_ENTRY_LABEL, 'Report user');

    // Reason + supporting-details controls exist as the form contract.
    assert.equal(REPORT_REASON_LABEL, 'Reason');
    assert.equal(REPORT_REASON_PLACEHOLDER, 'Enter a reason');
    assert.equal(REPORT_DETAILS_LABEL, 'Supporting details');
    assert.match(REPORT_DETAILS_PLACEHOLDER, /reviewed/i);

    // Target id is trusted context — body matches page target, not free text.
    const body = buildSubmitReportBody(entries.listing!, 'Spam', 'Junk listing');
    assert.equal(submitBodyMatchesTrustedTarget(entries.listing!, body), true);
    assert.equal(body.target_id, 12);
  });

  test('TAC Test 2 — Submit valid report produces success state after persistence response', async () => {
    const listingTarget = toReportListingTarget({ id: 12, title: 'Campus Camera' });
    const call = buildSubmitReportCall(
      listingTarget,
      '  Misleading photos  ',
      '  Images do not match the item.  '
    );

    assert.equal(call.path, '/reports');
    assert.equal(call.method, 'POST');
    assert.equal(call.body.target_type, 'listing');
    assert.equal(call.body.target_id, 12);
    assert.equal(call.body.reason, 'Misleading photos');
    assert.equal(call.body.details, 'Images do not match the item.');
    assert.equal('reporter_id' in call.body, false);

    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'Misleading photos',
        details: 'Images do not match the item.',
        submitting: false,
        viewerId: 9,
      }),
      true
    );

    const result = await runReportSubmitFlow(
      listingTarget,
      '  Misleading photos  ',
      '  Images do not match the item.  ',
      async (body) => ({
        id: 55,
        reporter_id: 9,
        target_type: body.target_type,
        target_id: body.target_id,
        reason: body.reason,
        details: body.details,
        created_at: '2026-08-08T20:00:00.000Z',
      })
    );

    assert.equal(result.success, REPORT_SUCCESS_MESSAGE);
    assert.equal(result.success, 'Report submitted successfully.');
    assert.equal(result.reason, '');
    assert.equal(result.details, '');
    assert.equal(result.error, '');
  });

  test('TAC Test 3 — Submit incomplete report surfaces validation errors', () => {
    const messages = reportValidationMessages({ reason: '   ', details: '' });
    assert.equal(messages.reason, REPORT_INCOMPLETE_REASON_MESSAGE);
    assert.equal(messages.details, REPORT_INCOMPLETE_DETAILS_MESSAGE);

    const listingTarget = toReportListingTarget({ id: 12, title: 'Campus Camera' });
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: '   ',
        details: 'Has details',
        submitting: false,
        viewerId: 9,
      }),
      false
    );
    assert.equal(
      canSubmitReport({
        target: listingTarget,
        reason: 'Has reason',
        details: '   ',
        submitting: false,
        viewerId: 9,
      }),
      false
    );
  });

  test('entry targets: listing id, owner user id, conversation counterpart; self-target UX guard', () => {
    const listing = {
      id: 12,
      title: 'Campus Camera',
      owner: { id: 4, first_name: 'Owner', last_name: 'Student' },
    };

    const renterEntries = listingDetailReportEntries(listing, 9);
    assert.equal(renterEntries.listing && reportTargetId(renterEntries.listing), 12);
    assert.equal(renterEntries.owner && reportTargetId(renterEntries.owner), 4);

    // Owner cannot report own listing; self-user target remains blocked.
    const ownerEntries = listingDetailReportEntries(listing, 4);
    assert.equal(ownerEntries.listing, null);
    assert.equal(ownerEntries.owner, null);
    assert.equal(
      canReportTarget(4, toReportUserTarget(listing.owner!)),
      false
    );

    const counterpart = conversationReportEntry(
      { id: 4, first_name: 'Owner', last_name: 'Student' },
      { listingId: 12, listingTitle: 'Campus Camera' },
      9
    );
    assert.ok(counterpart);
    assert.equal(counterpart!.type, 'user');
    assert.equal(reportTargetId(counterpart!), 4);

    const selfConversation = conversationReportEntry(
      { id: 9, first_name: 'Me', last_name: 'Student' },
      { listingId: 12, listingTitle: 'Campus Camera' },
      9
    );
    assert.equal(selfConversation, null);
  });

  test('failure path preserves draft and never claims success; submitting blocks duplicates', async () => {
    const target = toReportUserTarget({
      id: 4,
      first_name: 'Owner',
      last_name: 'Student',
    });

    const failed = await runReportSubmitFlow(
      target,
      'Keep reason',
      'Keep details',
      async () => {
        throw new Error('Listing not found');
      }
    );
    assert.equal(failed.success, '');
    assert.equal(failed.error, 'Listing not found');
    assert.equal(failed.reason, 'Keep reason');
    assert.equal(failed.details, 'Keep details');

    assert.equal(
      canSubmitReport({
        target,
        reason: 'Spam',
        details: 'Still retryable after failure',
        submitting: false,
        viewerId: 9,
      }),
      true
    );
    assert.equal(
      canSubmitReport({
        target,
        reason: 'Spam',
        details: 'Blocked while in-flight',
        submitting: true,
        viewerId: 9,
      }),
      false
    );
  });

  test('TAC Test 4 — Admin views report remains PENDING US-23 (not claimed passed)', () => {
    assert.equal(US_20_TAC_TEST_4_STATUS, 'PENDING US-23');
    assert.match(US_20_TAC_TEST_4_REASON, /US-23/);
    assert.match(US_20_TAC_TEST_4_REASON, /moderation queue/i);
    // Student report helpers do not provide an admin moderation dashboard contract.
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        {},
        'moderationDashboardRoute'
      ),
      false
    );
  });
});
