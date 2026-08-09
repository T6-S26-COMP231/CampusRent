/**
 * US-21.5 — AccountPage profile ↔ GET/PATCH /api/profile integration helpers.
 * Pure logic only; no React DOM framework.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  PROFILE_SUCCESS_MESSAGE,
  applyCancelledProfileEdit,
  buildGetProfileCall,
  buildUpdateProfileCall,
  canSubmitProfileDraft,
  claimsProfileSavedSuccessfully,
  profileUpdateBodyExcludesProtectedFields,
  runProfileLoadFlow,
  runProfileUpdateFlow,
  toProfileView,
  type CurrentUserLike,
  type UpdateProfileBody,
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

describe('US-21.5 profile API client descriptors', () => {
  test('getProfile and updateProfile call correct endpoints; body has editable fields only', () => {
    const getCall = buildGetProfileCall();
    assert.equal(getCall.path, '/profile');
    assert.equal(getCall.method, 'GET');

    const updateCall = buildUpdateProfileCall({
      first_name: '  Updated  ',
      last_name: '  Name  ',
      phone: '  416-555-0111  ',
    });
    assert.equal(updateCall.path, '/profile');
    assert.equal(updateCall.method, 'PATCH');
    assert.deepEqual(updateCall.body, {
      first_name: 'Updated',
      last_name: 'Name',
      phone: '416-555-0111',
    });
    assert.equal(profileUpdateBodyExcludesProtectedFields(updateCall.body), true);
    assert.equal('email' in updateCall.body, false);
    assert.equal('verification_status' in updateCall.body, false);
    assert.equal('role' in updateCall.body, false);
    assert.equal('status' in updateCall.body, false);
    assert.equal('id' in updateCall.body, false);
    assert.equal('password' in updateCall.body, false);
    assert.equal('password_hash' in updateCall.body, false);
    assert.equal(JSON.stringify(updateCall.body).includes('verification_status'), false);
    assert.equal(JSON.stringify(updateCall.body).includes('email'), false);
  });
});

describe('US-21.5 profile load integration', () => {
  test('server profile renders personal fields, email, and verification_status without fabrication', async () => {
    const loaded = await runProfileLoadFlow(async () => serverProfile);
    assert.ok(loaded.profile);
    assert.equal(loaded.error, '');
    assert.equal(loaded.profile!.personal.first_name, 'Ramika');
    assert.equal(loaded.profile!.personal.last_name, 'Student');
    assert.equal(loaded.profile!.personal.phone, '416-555-0100');
    assert.equal(loaded.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(loaded.profile!.readOnly.verification_status, 'verified');
    assert.equal(loaded.profile!.verificationLabel, 'Student account verified');
    assert.equal('password_hash' in loaded.profile!, false);

    const failed = await runProfileLoadFlow(async () => {
      throw new Error('Account verification required');
    });
    assert.equal(failed.profile, null);
    assert.match(failed.error, /verification required/i);
  });
});

describe('US-21.5 profile update integration', () => {
  test('valid edit calls updateProfile; server values replace view; edit mode closes', async () => {
    let submitted: UpdateProfileBody | null = null;
    const result = await runProfileUpdateFlow(
      {
        first_name: '  Updated  ',
        last_name: '  Student  ',
        phone: '  416-555-0199  ',
      },
      async (body) => {
        submitted = body;
        return {
          ...serverProfile,
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
        };
      }
    );

    assert.equal(result.called, true);
    assert.ok(submitted);
    assert.deepEqual(submitted, {
      first_name: 'Updated',
      last_name: 'Student',
      phone: '416-555-0199',
    });
    assert.equal(profileUpdateBodyExcludesProtectedFields(submitted!), true);
    assert.equal(result.mode, 'view');
    assert.equal(result.success, PROFILE_SUCCESS_MESSAGE);
    assert.equal(result.success, 'Profile updated successfully.');
    assert.equal(claimsProfileSavedSuccessfully(result.success), true);
    assert.equal(result.error, '');
    assert.ok(result.profile);
    assert.equal(result.profile!.personal.first_name, 'Updated');
    assert.equal(result.profile!.personal.phone, '416-555-0199');
    assert.equal(result.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
    assert.equal(result.profile!.readOnly.verification_status, 'verified');
    assert.equal(result.profile!.readOnly.role, 'student');
  });

  test('invalid local draft does not call PATCH; Cancel does not call PATCH', async () => {
    let called = false;
    const invalid = await runProfileUpdateFlow(
      { first_name: '  ', last_name: '', phone: '' },
      async (body) => {
        called = true;
        return { ...serverProfile, ...body };
      }
    );
    assert.equal(called, false);
    assert.equal(invalid.called, false);
    assert.equal(invalid.body, null);
    assert.equal(invalid.success, '');
    assert.match(invalid.errors.first_name, /first name/i);

    const view = toProfileView(serverProfile)!;
    assert.equal(
      canSubmitProfileDraft(
        { first_name: 'Ramika', last_name: 'Student', phone: '' },
        { mode: 'view' }
      ),
      false
    );
    const cancelled = applyCancelledProfileEdit(view);
    assert.equal(cancelled.mode, 'view');
    assert.deepEqual(cancelled.draft, {
      first_name: 'Ramika',
      last_name: 'Student',
      phone: '416-555-0100',
    });
  });

  test('failed PATCH does not claim success and preserves unsaved draft', async () => {
    const result = await runProfileUpdateFlow(
      {
        first_name: 'Keep',
        last_name: 'Draft',
        phone: '416-555-0000',
      },
      async () => {
        throw new Error('Cannot update protected field(s): verification_status');
      }
    );

    assert.equal(result.called, true);
    assert.equal(result.mode, 'edit');
    assert.equal(result.success, '');
    assert.equal(claimsProfileSavedSuccessfully(result.success), false);
    assert.equal(result.profile, null);
    assert.equal(result.draft.first_name, 'Keep');
    assert.equal(result.draft.last_name, 'Draft');
    assert.equal(result.draft.phone, '416-555-0000');
    assert.match(result.error, /protected field/i);
  });

  test('protected fields never enter update body even when server returns them', async () => {
    const result = await runProfileUpdateFlow(
      { first_name: 'A', last_name: 'B', phone: '' },
      async (body) => {
        assert.equal('verification_status' in body, false);
        assert.equal('email' in body, false);
        assert.equal('role' in body, false);
        assert.equal('status' in body, false);
        assert.equal('id' in body, false);
        return {
          ...serverProfile,
          first_name: body.first_name,
          last_name: body.last_name,
          phone: body.phone,
          verification_status: 'verified',
          email: 'ramika@mycentennialcollege.ca',
        };
      }
    );
    assert.equal(result.success, PROFILE_SUCCESS_MESSAGE);
    assert.equal(result.profile!.readOnly.verification_status, 'verified');
    assert.equal(result.profile!.readOnly.email, 'ramika@mycentennialcollege.ca');
  });
});
