/**
 * US-22 — administrator student-verification helpers.
 *
 * TAC:
 *   Test 1 — Review pending account
 *   Test 2 — Approve → verified
 *   Test 3 — Reject → rejected
 *   Test 4 — Request more information → remains pending
 */

export const VERIFICATION_ACTIONS = [
  'approve',
  'reject',
  'request_more_info',
] as const;

export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

export const REQUEST_MORE_INFO_ACTION = 'request_more_info' as const;

export const REQUEST_MORE_INFO_LABEL = 'Request More Information';

export function isVerificationAction(value: unknown): value is VerificationAction {
  return (
    typeof value === 'string' &&
    (VERIFICATION_ACTIONS as readonly string[]).includes(value)
  );
}

/** Pending-row controls required by US-22 TAC. */
export function pendingVerificationActionLabels(): string[] {
  return ['Approve', 'Reject', REQUEST_MORE_INFO_LABEL];
}

export function verificationActionSuccessMessage(action: VerificationAction): string {
  if (action === 'approve') return 'Student account verified successfully.';
  if (action === 'reject') return 'Student account rejected.';
  return 'Additional information requested. The student account remains pending.';
}

/** After request_more_info the student must still appear as pending. */
export function remainsPendingAfterRequestMoreInfo(
  verificationStatus: string | null | undefined
): boolean {
  return verificationStatus === 'pending';
}

export function buildVerificationActionBody(action: VerificationAction): {
  action: VerificationAction;
} {
  return { action };
}

export function verificationPatchPath(userId: number): string {
  return `/admin/verifications/${userId}`;
}
