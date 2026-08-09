/**
 * US-21.2 — AccountPage profile view/edit UI contract helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EDITABLE_PROFILE_FIELDS,
  PROFILE_NOT_CONNECTED_MESSAGE,
  PROFILE_VIEW_HEADING,
  PROTECTED_PROFILE_FIELDS,
  applyCancelledProfileEdit,
  applyEnterProfileEdit,
  applyProfileFormSave,
  applyUnconnectedProfileSave,
  buildUpdateProfileBody,
  canSubmitProfileDraft,
  claimsProfileSavedSuccessfully,
  isEditableProfileField,
  isProtectedProfileField,
  profileEditInputFields,
  profileReadOnlyDisplayFields,
  profileUpdateBodyExcludesProtectedFields,
  toProfileEditDraft,
  toProfileView,
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

describe('US-21.2 profile interface and editable fields', () => {
  test('current profile renders personal and read-only account values', () => {
    const view = toProfileView(currentUser)!;
    assert.equal(PROFILE_VIEW_HEADING, 'My profile');
    assert.equal(view.personal.first_name, 'Ramika');
    assert.equal(view.personal.last_name, 'Student');
    assert.equal(view.personal.phone, '416-555-0100');
    assert.equal(view.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(view.readOnly.role, 'student');
    assert.equal(view.readOnly.status, 'active');
    assert.equal(view.readOnly.id, 9);
  });

  test('verification status renders as current read-only display', () => {
    const view = toProfileView(currentUser)!;
    assert.equal(view.readOnly.verification_status, 'verified');
    assert.equal(view.verificationLabel, verificationStatusLabel('verified'));
    assert.equal(verificationStatusIsEditableInput(), false);
    assert.ok(profileReadOnlyDisplayFields().includes('verification_status'));
  });

  test('edit mode exposes only approved editable inputs', () => {
    const view = toProfileView(currentUser)!;
    const entered = applyEnterProfileEdit(view);
    assert.equal(entered.mode, 'edit');
    assert.deepEqual(Object.keys(entered.draft).sort(), ['first_name', 'last_name', 'phone']);
    assert.deepEqual(profileEditInputFields(), ['first_name', 'last_name', 'phone']);
    assert.deepEqual(EDITABLE_PROFILE_FIELDS, profileEditInputFields());

    for (const field of profileEditInputFields()) {
      assert.equal(isEditableProfileField(field), true);
    }
    for (const field of [
      'email',
      'verification_status',
      'role',
      'status',
      'id',
      'created_at',
      'password',
      'password_hash',
    ]) {
      assert.equal(isEditableProfileField(field), false, field);
      assert.equal(isProtectedProfileField(field), true, field);
      assert.equal(field in entered.draft, false, field);
    }
  });

  test('blank name validation blocks save; optional phone allowed', () => {
    const invalid = applyProfileFormSave({
      first_name: '  ',
      last_name: '',
      phone: '',
    });
    assert.equal(invalid.mode, 'edit');
    assert.equal(invalid.body, null);
    assert.equal(invalid.success, '');
    assert.match(invalid.errors.first_name, /first name/i);
    assert.match(invalid.errors.last_name, /last name/i);
    assert.equal(invalid.errors.phone, '');

    assert.equal(
      canSubmitProfileDraft({
        first_name: 'Ramika',
        last_name: 'Student',
        phone: '',
      }),
      true
    );

    const optionalPhone = applyProfileFormSave({
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '',
    });
    assert.ok(optionalPhone.body);
    assert.equal(optionalPhone.body!.phone, '');
  });

  test('Cancel restores original authenticated values and leaves edit mode', () => {
    const view = toProfileView(currentUser)!;
    const entered = applyEnterProfileEdit(view);
    const dirty = {
      ...entered.draft,
      first_name: 'Changed',
      last_name: 'Name',
      phone: '000',
    };
    const cancelled = applyCancelledProfileEdit(view);
    assert.equal(cancelled.mode, 'view');
    assert.deepEqual(cancelled.draft, toProfileEditDraft(view));
    assert.notEqual(cancelled.draft.first_name, dirty.first_name);
    assert.equal(cancelled.draft.first_name, 'Ramika');
    assert.equal(cancelled.draft.last_name, 'Student');
    assert.equal(cancelled.draft.phone, '416-555-0100');
    assert.equal(cancelled.notice, '');
  });

  test('Save does not falsely claim persistence; protected fields never enter payload', () => {
    const view = toProfileView(currentUser)!;
    const result = applyProfileFormSave({
      first_name: '  Ramika  ',
      last_name: '  Student  ',
      phone: '  416-555-0199  ',
    });

    assert.equal(result.notice, PROFILE_NOT_CONNECTED_MESSAGE);
    assert.equal(result.notice, 'Profile saving is not connected yet.');
    assert.equal(result.success, '');
    assert.equal(claimsProfileSavedSuccessfully(result.notice), false);
    assert.equal(claimsProfileSavedSuccessfully(result.success), false);

    const unconnected = applyUnconnectedProfileSave();
    assert.equal(unconnected.success, '');

    assert.ok(result.body);
    assert.deepEqual(result.body, {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0199',
    });
    assert.equal(profileUpdateBodyExcludesProtectedFields(result.body), true);
    for (const field of PROTECTED_PROFILE_FIELDS) {
      assert.equal(field in result.body, false, field);
    }
    assert.deepEqual(buildUpdateProfileBody(toProfileEditDraft(view)), {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    });
  });
});
