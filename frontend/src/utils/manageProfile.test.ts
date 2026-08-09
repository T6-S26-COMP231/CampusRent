/**
 * US-21.1 — profile-view / profile-edit design helpers.
 * Pure logic only; no React DOM, APIs, or persistence.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EDITABLE_PROFILE_FIELDS,
  PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE,
  PROFILE_INCOMPLETE_LAST_NAME_MESSAGE,
  PROFILE_NOT_CONNECTED_MESSAGE,
  PROFILE_PAGE_PATH,
  PROFILE_SUCCESS_MESSAGE,
  PROFILE_VIEW_HEADING,
  PROFILE_WORKFLOW_STEPS,
  PROTECTED_PROFILE_FIELDS,
  applyCancelledProfileEdit,
  applyUnconnectedProfileSave,
  buildUpdateProfileBody,
  canSubmitProfileDraft,
  claimsProfileSavedSuccessfully,
  isEditableProfileField,
  isProtectedProfileField,
  profileUpdateBodyExcludesProtectedFields,
  profileValidationMessages,
  toProfileEditDraft,
  toProfileView,
  verificationStatusDescription,
  verificationStatusIsEditableInput,
  verificationStatusLabel,
} from './manageProfile';

const currentUser = {
  id: 9,
  email: 'ramika@mycentennialcollege.ca',
  first_name: 'Ramika',
  last_name: 'Student',
  phone: '416-555-0100',
  role: 'student' as const,
  verification_status: 'verified' as const,
  status: 'active' as const,
  created_at: '2026-08-01T12:00:00.000Z',
};

describe('US-21.1 profile-view and profile-edit form design', () => {
  test('editable fields are only approved personal User fields', () => {
    assert.deepEqual(EDITABLE_PROFILE_FIELDS, ['first_name', 'last_name', 'phone']);
    assert.equal(isEditableProfileField('first_name'), true);
    assert.equal(isEditableProfileField('last_name'), true);
    assert.equal(isEditableProfileField('phone'), true);
    assert.equal(isEditableProfileField('email'), false);
    assert.equal(isEditableProfileField('verification_status'), false);
    assert.equal(isEditableProfileField('role'), false);
    assert.equal(isEditableProfileField('status'), false);
    assert.equal(isEditableProfileField('password_hash'), false);
  });

  test('verification status is read-only and protected', () => {
    assert.equal(verificationStatusIsEditableInput(), false);
    assert.equal(isProtectedProfileField('verification_status'), true);
    assert.ok(PROTECTED_PROFILE_FIELDS.includes('verification_status'));
    assert.equal(verificationStatusLabel('verified'), 'Student account verified');
    assert.equal(verificationStatusLabel('pending'), 'Verification pending');
    assert.equal(verificationStatusLabel('rejected'), 'Verification rejected');
    assert.match(verificationStatusDescription('verified'), /verified students/i);
  });

  test('protected fields cannot enter the update payload', () => {
    const view = toProfileView(currentUser)!;
    const body = buildUpdateProfileBody(toProfileEditDraft(view));

    assert.deepEqual(body, {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    });
    assert.equal(profileUpdateBodyExcludesProtectedFields(body), true);
    assert.equal('verification_status' in body, false);
    assert.equal('email' in body, false);
    assert.equal('role' in body, false);
    assert.equal('status' in body, false);
    assert.equal('id' in body, false);
    assert.equal('password' in body, false);
    assert.equal('password_hash' in body, false);
    assert.equal(JSON.stringify(body).includes('verification_status'), false);
  });

  test('current profile maps correctly to view data including verification', () => {
    const view = toProfileView(currentUser);
    assert.ok(view);
    assert.equal(PROFILE_PAGE_PATH, '/account');
    assert.equal(PROFILE_VIEW_HEADING, 'My profile');
    assert.equal(view!.displayName, 'Ramika Student');
    assert.equal(view!.personal.first_name, 'Ramika');
    assert.equal(view!.personal.last_name, 'Student');
    assert.equal(view!.personal.phone, '416-555-0100');
    assert.equal(view!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(view!.readOnly.verification_status, 'verified');
    assert.equal(view!.verificationLabel, 'Student account verified');
    assert.equal(view!.readOnly.role, 'student');
    assert.equal(view!.readOnly.status, 'active');
    assert.equal(view!.readOnly.id, 9);
    assert.equal('password_hash' in view!, false);
    assert.equal('password' in view!.readOnly, false);
  });

  test('missing phone maps to empty optional value; names still required', () => {
    const view = toProfileView({
      ...currentUser,
      phone: undefined,
      verification_status: 'pending',
    });
    assert.ok(view);
    assert.equal(view!.personal.phone, '');
    assert.equal(view!.readOnly.verification_status, 'pending');
    assert.equal(view!.verificationLabel, 'Verification pending');
  });

  test('cancel/reset restores draft from view and leaves view mode', () => {
    const view = toProfileView(currentUser)!;
    const cancelled = applyCancelledProfileEdit(view);
    assert.equal(cancelled.mode, 'view');
    assert.deepEqual(cancelled.draft, {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    });
    assert.equal(cancelled.notice, '');
    assert.deepEqual(cancelled.errors, {
      first_name: '',
      last_name: '',
      phone: '',
    });
  });

  test('validation rejects blank names; phone may be empty; unconnected save never claims success', () => {
    const blank = profileValidationMessages({
      first_name: '  ',
      last_name: '',
      phone: '   ',
    });
    assert.equal(blank.first_name, PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE);
    assert.equal(blank.last_name, PROFILE_INCOMPLETE_LAST_NAME_MESSAGE);
    assert.equal(blank.phone, '');

    assert.equal(
      canSubmitProfileDraft({
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '',
      }),
      true
    );
    assert.equal(
      canSubmitProfileDraft(
        { first_name: 'Ramika', last_name: 'Student', phone: '' },
        { submitting: true }
      ),
      false
    );

    const body = buildUpdateProfileBody({
      first_name: '  Ramika  ',
      last_name: '  Student  ',
      phone: '  416-555-0100  ',
    });
    assert.deepEqual(body, {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    });

    const unconnected = applyUnconnectedProfileSave();
    assert.equal(unconnected.notice, PROFILE_NOT_CONNECTED_MESSAGE);
    assert.equal(unconnected.success, '');
    assert.equal(claimsProfileSavedSuccessfully(unconnected.notice), false);
    assert.equal(claimsProfileSavedSuccessfully(PROFILE_SUCCESS_MESSAGE), true);
  });

  test('workflow steps cover view, verification read-only, edit, validate, save/cancel', () => {
    assert.ok(PROFILE_WORKFLOW_STEPS.includes('view_current_profile'));
    assert.ok(PROFILE_WORKFLOW_STEPS.includes('view_verification_status_readonly'));
    assert.ok(PROFILE_WORKFLOW_STEPS.includes('enter_edit_mode'));
    assert.ok(PROFILE_WORKFLOW_STEPS.includes('validate_editable_fields'));
    assert.ok(PROFILE_WORKFLOW_STEPS.includes('save_or_cancel'));
  });
});
