/**
 * US-21.6 — AccountPage profile loading / saving / success / error feedback.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE,
  PROFILE_INCOMPLETE_LAST_NAME_MESSAGE,
  PROFILE_LOAD_ERROR_FALLBACK,
  PROFILE_LOADING_LABEL,
  PROFILE_SAVING_LABEL,
  PROFILE_SUCCESS_MESSAGE,
  PROFILE_UPDATE_ERROR_FALLBACK,
  applyCancelledProfileEdit,
  applyEnterProfileEdit,
  applyProfileLoadFailure,
  applyProfileLoadPending,
  applyProfileLoadSuccess,
  applySuccessfulProfileSave,
  beginProfileSaveAttempt,
  canAttemptProfileSave,
  claimsProfileSavedSuccessfully,
  clearProfileActionFeedback,
  isProfileSaveDisabled,
  profileErrorMessage,
  profilePageUiStatus,
  profileProtectedFieldsStayReadOnly,
  profileSaveLabel,
  profileSuccessMessage,
  runProfileUpdateFlow,
  sanitizeProfileFeedbackMessage,
  toProfileView,
  type CurrentUserLike,
  type ProfileView,
} from './manageProfile';

const serverProfile: CurrentUserLike = {
  id: 9,
  email: 'ramika@mycentennialcollege.ca',
  first_name: 'Ramika',
  last_name: 'Student',
  phone: '416-555-0100',
  role: 'student',
  verification_status: 'verified',
  status: 'active',
  created_at: '2026-08-01T12:00:00.000Z',
};

function view(): ProfileView {
  return toProfileView(serverProfile)!;
}

describe('US-21.6 profile load feedback', () => {
  test('loading state while GET is pending; success removes loading; failure shows error without fabricating profile', () => {
    const pending = applyProfileLoadPending();
    assert.equal(pending.loading, true);
    assert.equal(pending.profile, null);
    assert.equal(pending.loadError, '');
    assert.equal(PROFILE_LOADING_LABEL, 'Loading profile...');
    assert.equal(
      profilePageUiStatus({
        loading: true,
        profile: null,
        loadError: '',
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'loading'
    );

    const loaded = applyProfileLoadSuccess(serverProfile);
    assert.equal(loaded.loading, false);
    assert.ok(loaded.profile);
    assert.equal(loaded.loadError, '');
    assert.equal(loaded.profile!.personal.first_name, 'Ramika');
    assert.equal(loaded.profile!.readOnly.verification_status, 'verified');
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: loaded.profile,
        loadError: '',
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'ready'
    );

    const failed = applyProfileLoadFailure(
      new Error('Account verification required\n    at Object.<anonymous>')
    );
    assert.equal(failed.loading, false);
    assert.equal(failed.profile, null);
    assert.equal(failed.loadError, 'Account verification required');
    assert.equal(failed.loadError.includes('at Object'), false);
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: null,
        loadError: failed.loadError,
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'load_error'
    );

    const generic = applyProfileLoadFailure({});
    assert.equal(generic.profile, null);
    assert.equal(generic.loadError, PROFILE_LOAD_ERROR_FALLBACK);
  });
});

describe('US-21.6 profile save loading and duplicate-submit prevention', () => {
  test('Save disabled while PATCH pending; saving indicator; duplicate Save cannot start second request', () => {
    const draft = {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    };

    assert.equal(profileSaveLabel(true), PROFILE_SAVING_LABEL);
    assert.equal(profileSaveLabel(true), 'Saving...');
    assert.equal(
      isProfileSaveDisabled({
        canEdit: true,
        saving: true,
        mode: 'edit',
        draft,
      }),
      true
    );
    assert.equal(
      canAttemptProfileSave({ canEdit: true, saving: true, mode: 'edit' }),
      false
    );

    const first = beginProfileSaveAttempt(false);
    assert.equal(first.allowed, true);
    assert.equal(first.saving, true);

    const duplicate = beginProfileSaveAttempt(true);
    assert.equal(duplicate.allowed, false);
    assert.equal(duplicate.saving, true);

    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: view(),
        loadError: '',
        mode: 'edit',
        saving: true,
        saveError: '',
        success: '',
      }),
      'saving'
    );
  });
});

describe('US-21.6 profile success feedback', () => {
  test('successful PATCH shows success, exits edit mode, uses server values, clears old errors', () => {
    assert.equal(profileSuccessMessage(), 'Profile updated successfully.');
    assert.equal(PROFILE_SUCCESS_MESSAGE, 'Profile updated successfully.');
    assert.equal(claimsProfileSavedSuccessfully(PROFILE_SUCCESS_MESSAGE), true);

    const saved = applySuccessfulProfileSave({
      ...serverProfile,
      first_name: 'Updated',
      last_name: 'Name',
      phone: '416-555-0199',
    });

    assert.equal(saved.mode, 'view');
    assert.equal(saved.success, PROFILE_SUCCESS_MESSAGE);
    assert.equal(saved.draft, null);
    assert.equal(saved.errors.first_name, '');
    assert.equal(saved.errors.last_name, '');
    assert.ok(saved.profile);
    assert.equal(saved.profile!.personal.first_name, 'Updated');
    assert.equal(saved.profile!.personal.last_name, 'Name');
    assert.equal(saved.profile!.personal.phone, '416-555-0199');
    assert.equal(saved.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(saved.profile!.readOnly.verification_status, 'verified');
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: saved.profile,
        loadError: '',
        mode: 'view',
        saving: false,
        saveError: '',
        success: saved.success,
      }),
      'success'
    );
  });
});

describe('US-21.6 profile failure feedback', () => {
  test('failed PATCH shows error, stays in edit mode, preserves draft, never claims success, retry possible', async () => {
    const draft = {
      first_name: 'Keep',
      last_name: 'Draft',
      phone: '416-555-0000',
    };

    const result = await runProfileUpdateFlow(draft, async () => {
      throw new Error('Network error\n    at fetch');
    });

    assert.equal(result.called, true);
    assert.equal(result.mode, 'edit');
    assert.equal(result.success, '');
    assert.equal(claimsProfileSavedSuccessfully(result.success), false);
    assert.equal(result.profile, null);
    assert.deepEqual(result.draft, draft);
    assert.equal(result.error, 'Network error');
    assert.equal(result.error.includes('at fetch'), false);
    assert.equal(
      canAttemptProfileSave({ canEdit: true, saving: false, mode: result.mode }),
      true
    );
    assert.equal(
      isProfileSaveDisabled({
        canEdit: true,
        saving: false,
        mode: 'edit',
        draft,
      }),
      false
    );
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: view(),
        loadError: '',
        mode: 'edit',
        saving: false,
        saveError: result.error,
        success: '',
      }),
      'save_error'
    );
  });
});

describe('US-21.6 profile validation feedback', () => {
  test('blank names show field errors; invalid draft never sends PATCH; cancel/edit clears stale validation', async () => {
    let called = 0;
    const invalid = await runProfileUpdateFlow(
      { first_name: '  ', last_name: '', phone: '' },
      async () => {
        called += 1;
        return serverProfile;
      }
    );

    assert.equal(called, 0);
    assert.equal(invalid.called, false);
    assert.equal(invalid.success, '');
    assert.equal(invalid.errors.first_name, PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE);
    assert.equal(invalid.errors.last_name, PROFILE_INCOMPLETE_LAST_NAME_MESSAGE);

    const entered = applyEnterProfileEdit(view());
    assert.equal(entered.errors.first_name, '');
    assert.equal(entered.errors.last_name, '');
    assert.equal(entered.notice, '');

    const cancelled = applyCancelledProfileEdit(view());
    assert.equal(cancelled.mode, 'view');
    assert.equal(cancelled.errors.first_name, '');
    assert.equal(cancelled.errors.last_name, '');

    const cleared = clearProfileActionFeedback();
    assert.equal(cleared.success, '');
    assert.equal(cleared.saveError, '');
  });
});

describe('US-21.6 protected display during feedback states', () => {
  test('verification status and email remain read-only across view/edit/error/success', () => {
    for (const status of [
      'loading',
      'ready',
      'load_error',
      'editing',
      'saving',
      'save_error',
      'success',
    ] as const) {
      assert.equal(profileProtectedFieldsStayReadOnly(status), true, status);
    }

    const ready = view();
    assert.equal(ready.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(ready.readOnly.verification_status, 'verified');
    assert.equal('email' in applyEnterProfileEdit(ready).draft, false);
    assert.equal('verification_status' in applyEnterProfileEdit(ready).draft, false);

    const failedSave = applySuccessfulProfileSave(serverProfile);
    assert.equal(failedSave.profile!.readOnly.verification_status, 'verified');
    assert.equal(failedSave.profile!.readOnly.email, serverProfile.email);

    assert.equal(
      sanitizeProfileFeedbackMessage('Boom\nstack'),
      'Boom'
    );
    assert.equal(profileErrorMessage({}), PROFILE_UPDATE_ERROR_FALLBACK);
  });
});
