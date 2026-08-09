/**
 * US-21.7 — frontend helper coverage mapped to Team6 TAC manage-profile UX.
 *
 * TAC Test 1 — View profile → Current profile displayed
 * TAC Test 2 — Update profile → Changes saved successfully
 * TAC Test 3 — Submit invalid information → Validation error displayed
 * TAC Test 4 — View verification status → Current status displayed
 *
 * Broader detail remains in manageProfile.test.ts, manageProfile.ui.test.ts,
 * manageProfile.integration.test.ts, and manageProfile.feedback.test.ts.
 * This suite stays acceptance-focused.
 *
 * Limitation: no React DOM framework is installed; AccountPage rendering is
 * not exercised here. Display/load/save behavior is proven through the helper
 * contracts AccountPage uses (runProfileLoadFlow / runProfileUpdateFlow).
 *
 * Do NOT claim production Overall Result: PASSED — US-21.8 (#177) owns
 * merge/deploy/manual acceptance.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EDITABLE_PROFILE_FIELDS,
  PROFILE_EMAIL_LABEL,
  PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE,
  PROFILE_INCOMPLETE_LAST_NAME_MESSAGE,
  PROFILE_LOADING_LABEL,
  PROFILE_SAVING_LABEL,
  PROFILE_SUCCESS_MESSAGE,
  PROFILE_VERIFICATION_LABEL,
  PROFILE_VIEW_HEADING,
  applyEnterProfileEdit,
  applyProfileLoadFailure,
  applyProfileLoadPending,
  applyProfileLoadSuccess,
  beginProfileSaveAttempt,
  buildUpdateProfileCall,
  canAttemptProfileSave,
  claimsProfileSavedSuccessfully,
  isEditableProfileField,
  isProfileSaveDisabled,
  profileEditInputFields,
  profilePageUiStatus,
  profileProtectedFieldsStayReadOnly,
  profileSaveLabel,
  profileUpdateBodyExcludesProtectedFields,
  runProfileLoadFlow,
  runProfileUpdateFlow,
  toProfileView,
  verificationStatusIsEditableInput,
  type CurrentUserLike,
  type UpdateProfileBody,
} from './manageProfile';

/** Explicit marker — automated proof must not claim production acceptance. */
export const US_21_PRODUCTION_ACCEPTANCE_STATUS = 'PENDING US-21.8' as const;
export const US_21_PRODUCTION_ACCEPTANCE_REASON =
  'US-21.8 (#177) owns PR merge, deployment, and manual deployed acceptance before Overall Result: PASSED.';

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

describe('US-21 TAC frontend acceptance helpers', () => {
  test('TAC Test 1 — View profile: current profile displayed', async () => {
    const pending = applyProfileLoadPending();
    assert.equal(pending.loading, true);
    assert.equal(pending.profile, null);
    assert.equal(PROFILE_LOADING_LABEL, 'Loading profile...');
    assert.equal(PROFILE_VIEW_HEADING, 'My profile');

    const loaded = await runProfileLoadFlow(async () => serverProfile);
    assert.equal(loaded.error, '');
    assert.ok(loaded.profile);
    assert.equal(loaded.profile!.personal.first_name, 'Ramika');
    assert.equal(loaded.profile!.personal.last_name, 'Student');
    assert.equal(loaded.profile!.personal.phone, '416-555-0100');
    assert.equal(loaded.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(loaded.profile!.readOnly.verification_status, 'verified');
    assert.equal(loaded.profile!.verificationLabel, 'Student account verified');
    assert.equal(PROFILE_EMAIL_LABEL, 'Email');
    assert.equal('password_hash' in loaded.profile!, false);

    const successLoad = applyProfileLoadSuccess(serverProfile);
    assert.equal(successLoad.loading, false);
    assert.ok(successLoad.profile);
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: successLoad.profile,
        loadError: '',
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'ready'
    );
    assert.equal(US_21_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-21.8');
  });

  test('TAC Test 2 — Update profile: changes saved successfully', async () => {
    let submitted: UpdateProfileBody | null = null;
    let callCount = 0;

    const result = await runProfileUpdateFlow(
      {
        first_name: '  Updated  ',
        last_name: '  Student  ',
        phone: '  555-1234  ',
      },
      async (body) => {
        callCount += 1;
        submitted = body;
        return {
          ...serverProfile,
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
        };
      }
    );

    assert.equal(callCount, 1);
    assert.ok(submitted);
    assert.deepEqual(submitted, {
      first_name: 'Updated',
      last_name: 'Student',
      phone: '555-1234',
    });
    assert.equal(Object.keys(submitted!).sort().join(','), 'first_name,last_name,phone');
    assert.equal(profileUpdateBodyExcludesProtectedFields(submitted!), true);

    const call = buildUpdateProfileCall({
      first_name: 'Updated',
      last_name: 'Student',
      phone: '555-1234',
    });
    assert.equal(call.path, '/profile');
    assert.equal(call.method, 'PATCH');

    assert.equal(result.mode, 'view');
    assert.equal(result.success, PROFILE_SUCCESS_MESSAGE);
    assert.equal(result.success, 'Profile updated successfully.');
    assert.equal(claimsProfileSavedSuccessfully(result.success), true);
    assert.equal(result.error, '');
    assert.ok(result.profile);
    assert.equal(result.profile!.personal.first_name, 'Updated');
    assert.equal(result.profile!.personal.last_name, 'Student');
    assert.equal(result.profile!.personal.phone, '555-1234');
    assert.equal(result.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(result.profile!.readOnly.verification_status, 'verified');
  });

  test('TAC Test 3 — Invalid information: validation error displayed; PATCH not sent', async () => {
    let called = false;
    const invalid = await runProfileUpdateFlow(
      { first_name: '  ', last_name: '', phone: '416-555-0000' },
      async () => {
        called = true;
        return serverProfile;
      }
    );

    assert.equal(called, false);
    assert.equal(invalid.called, false);
    assert.equal(invalid.success, '');
    assert.equal(claimsProfileSavedSuccessfully(invalid.success), false);
    assert.equal(invalid.errors.first_name, PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE);
    assert.equal(invalid.errors.last_name, PROFILE_INCOMPLETE_LAST_NAME_MESSAGE);
    assert.equal(invalid.mode, 'edit');

    // User can correct the form and retry.
    assert.equal(
      canAttemptProfileSave({ canEdit: true, saving: false, mode: 'edit' }),
      true
    );
    assert.equal(
      isProfileSaveDisabled({
        canEdit: true,
        saving: false,
        mode: 'edit',
        draft: { first_name: 'Fixed', last_name: 'Name', phone: '' },
      }),
      false
    );
  });

  test('TAC Test 4 — View verification status: current status displayed read-only', async () => {
    const view = toProfileView(serverProfile)!;
    assert.equal(view.readOnly.verification_status, 'verified');
    assert.equal(view.verificationLabel, 'Student account verified');
    assert.equal(PROFILE_VERIFICATION_LABEL, 'Verification status');
    assert.equal(verificationStatusIsEditableInput(), false);
    assert.equal(isEditableProfileField('verification_status'), false);
    assert.equal(isEditableProfileField('email'), false);
    assert.deepEqual(profileEditInputFields(), [...EDITABLE_PROFILE_FIELDS]);
    assert.equal(profileEditInputFields().includes('verification_status' as never), false);
    assert.equal(profileEditInputFields().includes('email' as never), false);

    const entered = applyEnterProfileEdit(view);
    assert.equal('verification_status' in entered.draft, false);
    assert.equal('email' in entered.draft, false);
    assert.equal('role' in entered.draft, false);
    assert.equal('status' in entered.draft, false);
    assert.equal('id' in entered.draft, false);

    const updateCall = buildUpdateProfileCall(entered.draft);
    assert.equal('verification_status' in updateCall.body, false);
    assert.equal('email' in updateCall.body, false);
    assert.equal('role' in updateCall.body, false);
    assert.equal('status' in updateCall.body, false);
    assert.equal('id' in updateCall.body, false);
    assert.equal(JSON.stringify(updateCall.body).includes('verification_status'), false);
    assert.equal(JSON.stringify(updateCall.body).includes('email'), false);

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

    assert.equal(US_21_PRODUCTION_ACCEPTANCE_STATUS, 'PENDING US-21.8');
    assert.match(US_21_PRODUCTION_ACCEPTANCE_REASON, /US-21\.8/);
  });
});

describe('US-21.7 frontend error/loading regression (acceptance)', () => {
  test('GET loading/error, PATCH Saving..., duplicate submit, failure preserves draft', async () => {
    const pending = applyProfileLoadPending();
    assert.equal(
      profilePageUiStatus({
        loading: pending.loading,
        profile: pending.profile,
        loadError: '',
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'loading'
    );

    const failedLoad = applyProfileLoadFailure(new Error('Unable to reach profile service'));
    assert.equal(failedLoad.profile, null);
    assert.match(failedLoad.loadError, /Unable to reach profile service/);
    assert.equal(
      profilePageUiStatus({
        loading: false,
        profile: null,
        loadError: failedLoad.loadError,
        mode: 'view',
        saving: false,
        saveError: '',
        success: '',
      }),
      'load_error'
    );

    assert.equal(profileSaveLabel(true), PROFILE_SAVING_LABEL);
    assert.equal(beginProfileSaveAttempt(false).allowed, true);
    assert.equal(beginProfileSaveAttempt(true).allowed, false);
    assert.equal(
      isProfileSaveDisabled({
        canEdit: true,
        saving: true,
        mode: 'edit',
        draft: { first_name: 'A', last_name: 'B', phone: '' },
      }),
      true
    );

    const draft = {
      first_name: 'Keep',
      last_name: 'Draft',
      phone: '416-555-0000',
    };
    const failedSave = await runProfileUpdateFlow(draft, async () => {
      throw new Error('Request failed with status 500');
    });
    assert.equal(failedSave.mode, 'edit');
    assert.equal(failedSave.success, '');
    assert.equal(claimsProfileSavedSuccessfully(failedSave.success), false);
    assert.deepEqual(failedSave.draft, draft);
    assert.match(failedSave.error, /500/);
    assert.equal(
      canAttemptProfileSave({ canEdit: true, saving: false, mode: 'edit' }),
      true
    );
  });
});
