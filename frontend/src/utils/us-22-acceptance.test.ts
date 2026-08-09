/**
 * US-22 — frontend helper/source coverage for Verify student accounts.
 *
 * Limitation: no React DOM framework; AdminPage rendering is proven via
 * helper contracts + source wiring checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  REQUEST_MORE_INFO_ACTION,
  REQUEST_MORE_INFO_LABEL,
  buildVerificationActionBody,
  pendingVerificationActionLabels,
  remainsPendingAfterRequestMoreInfo,
  verificationActionSuccessMessage,
  verificationPatchPath,
} from './studentVerification';

const here = dirname(fileURLToPath(import.meta.url));
const adminSource = readFileSync(join(here, '../pages/AdminPage.tsx'), 'utf8');

describe('US-22 TAC frontend acceptance helpers', () => {
  test('pending student row exposes Approve, Reject, and Request More Information', () => {
    assert.deepEqual(pendingVerificationActionLabels(), [
      'Approve',
      'Reject',
      REQUEST_MORE_INFO_LABEL,
    ]);
    assert.match(adminSource, /Approve/);
    assert.match(adminSource, /Reject/);
    assert.match(adminSource, /REQUEST_MORE_INFO_LABEL/);
    assert.match(adminSource, /request_more_info/);
  });

  test('Request More Information calls the verification patch API with the correct action', () => {
    assert.deepEqual(buildVerificationActionBody(REQUEST_MORE_INFO_ACTION), {
      action: 'request_more_info',
    });
    assert.equal(verificationPatchPath(42), '/admin/verifications/42');
    assert.match(adminSource, /verificationPatchPath/);
    assert.match(adminSource, /buildVerificationActionBody/);
    assert.match(adminSource, /api\.patch/);
  });

  test('successful request-more-info preserves Pending status and keeps the student listed', () => {
    assert.equal(remainsPendingAfterRequestMoreInfo('pending'), true);
    assert.equal(remainsPendingAfterRequestMoreInfo('verified'), false);
    assert.equal(remainsPendingAfterRequestMoreInfo('rejected'), false);
    assert.match(
      verificationActionSuccessMessage('request_more_info'),
      /remains pending/i
    );
    // UI reloads pending list after every verification action.
    assert.match(adminSource, /loadUsers\(\)/);
  });

  test('Approve and Reject success messaging remains intact', () => {
    assert.match(verificationActionSuccessMessage('approve'), /verified successfully/i);
    assert.match(verificationActionSuccessMessage('reject'), /rejected/i);
    assert.match(adminSource, /verifyUser\(student\.id, 'approve'\)/);
    assert.match(adminSource, /verifyUser\(student\.id, 'reject'\)/);
  });
});
