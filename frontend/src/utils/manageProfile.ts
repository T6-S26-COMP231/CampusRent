/**
 * US-21.1 — profile-view and profile-edit form design.
 *
 * TAC: Registered Student Users manage personal profile information so account
 * details stay accurate. Verification status is visible but not editable.
 * Changes are validated before they are saved (persistence in later tasks).
 *
 * Entry surface (no new navigation — reuse existing student Account route):
 *
 *   AccountPage (/account) — already linked from Layout as “Account”.
 *   Iteration 1 page is verification-status focused; US-21.2 extends it into
 *   profile view + edit without inventing a second account app or nav item.
 *
 * Existing User fields (backend/src/models/User.ts + toPublicUser /auth/me):
 *   id, email, password_hash, first_name, last_name, phone,
 *   role, verification_status, status, created_at
 *
 * Editable personal fields (repository-supported only):
 *   - first_name — required personal name; set at registration; trim required
 *   - last_name  — required personal name; set at registration; trim required
 *   - phone      — stored personal contact (default ''); shown on listings/
 *                  requests contact cards; optional after trim (empty allowed)
 *
 * Protected / read-only (never editable inputs; never in update payload):
 *   - verification_status — TAC: visible, read-only
 *   - email — institutional identity from registration
 *   - role — security identity (student | admin)
 *   - status — account active/suspended (admin moderation)
 *   - id — internal identity
 *   - password_hash / password — never exposed or editable here
 *   - created_at — account metadata (optional display only)
 *
 * Profile UI flow (US-21.2 / US-21.5 / US-21.6 AccountPage):
 *   Load GET /api/profile → loading feedback → view mode with server values
 *   Edit profile → editable fields become inputs; Save / Cancel
 *   Cancel → discard draft (applyCancelledProfileEdit); no API call
 *   Save → validate → saving feedback → PATCH /api/profile
 *        → success/error feedback from server confirmation
 *
 * Validation reuses registration name rules (required non-empty after trim).
 * No invented phone format/length rules — schema allows empty string.
 *
 * APIs / persistence / owner auth / feedback:
 *   US-21.3 GET/UPDATE profile, US-21.4 protected-field enforcement,
 *   US-21.5 integration, US-21.6 loading/success/error polish (this feedback).
 */

export const PROFILE_PAGE_PATH = '/account';
export const PROFILE_PAGE_ENTRY_LABEL = 'Account';
export const PROFILE_VIEW_HEADING = 'My profile';
export const PROFILE_EDIT_HEADING = 'Edit profile';
export const PROFILE_EDIT_ENTRY_LABEL = 'Edit profile';
export const PROFILE_SAVE_LABEL = 'Save changes';
export const PROFILE_SAVING_LABEL = 'Saving...';
export const PROFILE_CANCEL_LABEL = 'Cancel';
export const PROFILE_RETRY_LOAD_LABEL = 'Try again';
export const PROFILE_LOADING_LABEL = 'Loading profile...';
export const PROFILE_FIRST_NAME_LABEL = 'First name';
export const PROFILE_LAST_NAME_LABEL = 'Last name';
export const PROFILE_PHONE_LABEL = 'Phone';
export const PROFILE_PHONE_PLACEHOLDER = 'Optional contact phone';
export const PROFILE_EMAIL_LABEL = 'Email';
export const PROFILE_ROLE_LABEL = 'Role';
export const PROFILE_VERIFICATION_LABEL = 'Verification status';
export const PROFILE_ACCOUNT_STATUS_LABEL = 'Account status';
/** Truthful success copy after a confirmed PATCH /api/profile response. */
export const PROFILE_SUCCESS_MESSAGE = 'Profile updated successfully.';
export const PROFILE_NOT_CONNECTED_MESSAGE =
  'Profile saving is not connected yet.';
export const PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE = 'First name is required.';
export const PROFILE_INCOMPLETE_LAST_NAME_MESSAGE = 'Last name is required.';
export const PROFILE_LOAD_ERROR_FALLBACK = 'Unable to load profile.';
export const PROFILE_UPDATE_ERROR_FALLBACK = 'Unable to update profile.';

/** Only fields a student may change through the profile form. */
export const EDITABLE_PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'phone',
] as const;

export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number];

/**
 * Identity / security / moderation fields — visible where appropriate,
 * never editable, never accepted from the client update body.
 */
export const PROTECTED_PROFILE_FIELDS = [
  'id',
  'email',
  'role',
  'verification_status',
  'status',
  'password_hash',
  'password',
  'created_at',
] as const;

export type ProtectedProfileField = (typeof PROTECTED_PROFILE_FIELDS)[number];

export type ProfileVerificationStatus = 'pending' | 'verified' | 'rejected';
export type ProfileAccountStatus = 'active' | 'suspended';
export type ProfileRole = 'student' | 'admin';

/** Current-user shape available from AuthContext / GET /auth/me today. */
export type CurrentUserLike = {
  id: number | string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: ProfileRole | string;
  verification_status: ProfileVerificationStatus | string;
  status?: ProfileAccountStatus | string;
  created_at?: string;
};

/** Read-only account facts shown beside editable personal data. */
export interface ProfileReadOnlyInfo {
  id: number;
  email: string;
  role: ProfileRole;
  verification_status: ProfileVerificationStatus;
  status: ProfileAccountStatus;
  created_at?: string;
}

/** Editable personal values for view and draft. */
export interface ProfilePersonalInfo {
  first_name: string;
  last_name: string;
  phone: string;
}

/** Full profile view contract for AccountPage (US-21.2). */
export interface ProfileView {
  personal: ProfilePersonalInfo;
  readOnly: ProfileReadOnlyInfo;
  displayName: string;
  verificationLabel: string;
  verificationDescription: string;
}

/** Draft while editing — only editable personal fields. */
export interface ProfileEditDraft {
  first_name: string;
  last_name: string;
  phone: string;
}

/** Conceptual later UPDATE body — editable fields only. */
export interface UpdateProfileBody {
  first_name: string;
  last_name: string;
  phone: string;
}

export type ProfileMode = 'view' | 'edit';

export interface ProfileFieldErrors {
  first_name: string;
  last_name: string;
  phone: string;
}

export const PROFILE_WORKFLOW_STEPS = [
  'open_account_profile',
  'view_current_profile',
  'view_verification_status_readonly',
  'enter_edit_mode',
  'validate_editable_fields',
  'save_or_cancel',
  'display_updated_profile',
] as const;

export type ProfileWorkflowStep = (typeof PROFILE_WORKFLOW_STEPS)[number];

const VERIFICATION_DISPLAY: Record<
  ProfileVerificationStatus,
  { label: string; description: string }
> = {
  pending: {
    label: 'Verification pending',
    description:
      'A System Administration Team member must verify your student account before registered-student rental features become available.',
  },
  verified: {
    label: 'Student account verified',
    description:
      'Your Registered Student User account can use CampusRent rental features available to verified students.',
  },
  rejected: {
    label: 'Verification rejected',
    description:
      'The System Administration Team did not approve this registration. Contact the project team for assistance.',
  },
};

export function isEditableProfileField(field: string): field is EditableProfileField {
  return (EDITABLE_PROFILE_FIELDS as readonly string[]).includes(field);
}

export function isProtectedProfileField(field: string): field is ProtectedProfileField {
  return (PROTECTED_PROFILE_FIELDS as readonly string[]).includes(field);
}

export function normalizeProfileName(raw: string): string {
  return raw.trim();
}

/** Phone is optional — trim only; empty string remains valid. */
export function normalizeProfilePhone(raw: string): string {
  return raw.trim();
}

export function isBlankProfileName(raw: string): boolean {
  return normalizeProfileName(raw).length === 0;
}

export function verificationStatusLabel(
  status: ProfileVerificationStatus | string | undefined | null
): string {
  if (status === 'pending' || status === 'verified' || status === 'rejected') {
    return VERIFICATION_DISPLAY[status].label;
  }
  return 'Verification status unavailable';
}

export function verificationStatusDescription(
  status: ProfileVerificationStatus | string | undefined | null
): string {
  if (status === 'pending' || status === 'verified' || status === 'rejected') {
    return VERIFICATION_DISPLAY[status].description;
  }
  return 'Verification status is managed by the System Administration Team.';
}

export function profileRoleLabel(role: ProfileRole | string | undefined | null): string {
  if (role === 'admin') return 'System Administration Team';
  if (role === 'student') return 'Registered Student User';
  return 'CampusRent user';
}

export function toPositiveProfileId(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

/**
 * Map authenticated current-user data into the profile view contract.
 * Never copies password/password_hash into the view.
 */
export function toProfileView(user: CurrentUserLike): ProfileView | null {
  const id = toPositiveProfileId(user.id);
  if (id == null) return null;

  const first = typeof user.first_name === 'string' ? user.first_name : '';
  const last = typeof user.last_name === 'string' ? user.last_name : '';
  const phone = typeof user.phone === 'string' ? user.phone : '';
  const verification =
    user.verification_status === 'pending' ||
    user.verification_status === 'verified' ||
    user.verification_status === 'rejected'
      ? user.verification_status
      : 'pending';
  const role = user.role === 'admin' ? 'admin' : 'student';
  const status = user.status === 'suspended' ? 'suspended' : 'active';

  return {
    personal: {
      first_name: first,
      last_name: last,
      phone,
    },
    readOnly: {
      id,
      email: user.email,
      role,
      verification_status: verification,
      status,
      created_at: user.created_at,
    },
    displayName: `${first} ${last}`.trim() || user.email,
    verificationLabel: verificationStatusLabel(verification),
    verificationDescription: verificationStatusDescription(verification),
  };
}

export function toProfileEditDraft(view: ProfileView): ProfileEditDraft {
  return {
    first_name: view.personal.first_name,
    last_name: view.personal.last_name,
    phone: view.personal.phone,
  };
}

export function profileValidationMessages(
  draft: ProfileEditDraft
): ProfileFieldErrors {
  return {
    first_name: isBlankProfileName(draft.first_name)
      ? PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE
      : '',
    last_name: isBlankProfileName(draft.last_name)
      ? PROFILE_INCOMPLETE_LAST_NAME_MESSAGE
      : '',
    // Optional field — no invented format rules in US-21.1.
    phone: '',
  };
}

export function canSubmitProfileDraft(
  draft: ProfileEditDraft,
  options: { submitting?: boolean; mode?: ProfileMode } = {}
): boolean {
  if (options.submitting) return false;
  if (options.mode === 'view') return false;
  const messages = profileValidationMessages(draft);
  return !messages.first_name && !messages.last_name && !messages.phone;
}

/** Pure update descriptor — editable fields only. */
export function buildUpdateProfileBody(draft: ProfileEditDraft): UpdateProfileBody {
  return {
    first_name: normalizeProfileName(draft.first_name),
    last_name: normalizeProfileName(draft.last_name),
    phone: normalizeProfilePhone(draft.phone),
  };
}

export function profileUpdateBodyExcludesProtectedFields(
  body: UpdateProfileBody
): boolean {
  const keys = Object.keys(body);
  return (
    keys.length === EDITABLE_PROFILE_FIELDS.length &&
    EDITABLE_PROFILE_FIELDS.every((field) => keys.includes(field)) &&
    PROTECTED_PROFILE_FIELDS.every((field) => !(field in body))
  );
}

/** Enter edit mode from the current profile view. */
export function applyEnterProfileEdit(view: ProfileView): {
  mode: ProfileMode;
  draft: ProfileEditDraft;
  errors: ProfileFieldErrors;
  notice: string;
} {
  return {
    mode: 'edit',
    draft: toProfileEditDraft(view),
    errors: { first_name: '', last_name: '', phone: '' },
    notice: '',
  };
}

/** Cancel edit — restore draft from the last viewed profile values. */
export function applyCancelledProfileEdit(view: ProfileView): {
  mode: ProfileMode;
  draft: ProfileEditDraft;
  errors: ProfileFieldErrors;
  notice: string;
} {
  return {
    mode: 'view',
    draft: toProfileEditDraft(view),
    errors: { first_name: '', last_name: '', phone: '' },
    notice: '',
  };
}

/**
 * UI-only save path before US-21.5 API wiring.
 * Never claims the profile was saved on the server.
 */
export function applyUnconnectedProfileSave(): {
  notice: string;
  success: string;
} {
  return {
    notice: PROFILE_NOT_CONNECTED_MESSAGE,
    success: '',
  };
}

/**
 * Validate draft before API save.
 * Invalid drafts stay in edit mode with field errors and no body.
 */
export function applyProfileFormSave(draft: ProfileEditDraft): {
  mode: ProfileMode;
  draft: ProfileEditDraft;
  errors: ProfileFieldErrors;
  notice: string;
  success: string;
  body: UpdateProfileBody | null;
} {
  const errors = profileValidationMessages(draft);
  if (errors.first_name || errors.last_name || errors.phone) {
    return {
      mode: 'edit',
      draft,
      errors,
      notice: '',
      success: '',
      body: null,
    };
  }

  const body = buildUpdateProfileBody(draft);
  return {
    mode: 'edit',
    draft: {
      first_name: body.first_name,
      last_name: body.last_name,
      phone: body.phone,
    },
    errors: { first_name: '', last_name: '', phone: '' },
    notice: '',
    success: '',
    body,
  };
}

/** US-21.5 — GET /api/profile call descriptor. */
export function buildGetProfileCall(): { path: string; method: 'GET' } {
  return { path: '/profile', method: 'GET' };
}

/** US-21.5 — PATCH /api/profile call descriptor (editable fields only). */
export function buildUpdateProfileCall(
  draft: ProfileEditDraft
): { path: string; method: 'PATCH'; body: UpdateProfileBody } {
  return {
    path: '/profile',
    method: 'PATCH',
    body: buildUpdateProfileBody(draft),
  };
}

/**
 * Safe user-facing API/error text — first line only; never stack traces.
 */
export function sanitizeProfileFeedbackMessage(
  message: string,
  fallback = PROFILE_UPDATE_ERROR_FALLBACK
): string {
  const firstLine = message.split(/\r?\n/)[0]?.trim() ?? '';
  return firstLine || fallback;
}

export function profileErrorMessage(
  error: unknown,
  fallback = PROFILE_UPDATE_ERROR_FALLBACK
): string {
  if (error instanceof Error && error.message.trim()) {
    return sanitizeProfileFeedbackMessage(error.message, fallback);
  }
  if (typeof error === 'string' && error.trim()) {
    return sanitizeProfileFeedbackMessage(error, fallback);
  }
  return fallback;
}

export function applySuccessfulProfileSave(serverUser: CurrentUserLike): {
  mode: ProfileMode;
  profile: ProfileView | null;
  draft: ProfileEditDraft | null;
  errors: ProfileFieldErrors;
  notice: string;
  success: string;
} {
  const profile = toProfileView(serverUser);
  return {
    mode: 'view',
    profile,
    draft: null,
    errors: { first_name: '', last_name: '', phone: '' },
    notice: '',
    success: PROFILE_SUCCESS_MESSAGE,
  };
}

export function applyFailedProfileSave(
  draft: ProfileEditDraft,
  error: unknown
): {
  mode: ProfileMode;
  draft: ProfileEditDraft;
  errors: ProfileFieldErrors;
  error: string;
  success: string;
} {
  return {
    mode: 'edit',
    draft,
    errors: { first_name: '', last_name: '', phone: '' },
    error: profileErrorMessage(error),
    success: '',
  };
}

/**
 * Pure load helper for AccountPage / tests.
 * Maps server User into ProfileView; never fabricates personal fields.
 */
export async function runProfileLoadFlow(
  load: () => Promise<CurrentUserLike>
): Promise<{
  profile: ProfileView | null;
  error: string;
}> {
  try {
    const user = await load();
    const profile = toProfileView(user);
    if (!profile) {
      return { profile: null, error: PROFILE_LOAD_ERROR_FALLBACK };
    }
    return { profile, error: '' };
  } catch (error) {
    return {
      profile: null,
      error: profileErrorMessage(error, PROFILE_LOAD_ERROR_FALLBACK),
    };
  }
}

/**
 * Pure update helper for AccountPage / tests.
 * Invalid drafts never call update. Failures preserve draft and do not claim success.
 */
export async function runProfileUpdateFlow(
  draft: ProfileEditDraft,
  update: (body: UpdateProfileBody) => Promise<CurrentUserLike>
): Promise<{
  mode: ProfileMode;
  profile: ProfileView | null;
  draft: ProfileEditDraft;
  errors: ProfileFieldErrors;
  success: string;
  error: string;
  body: UpdateProfileBody | null;
  called: boolean;
}> {
  const prepared = applyProfileFormSave(draft);
  if (!prepared.body) {
    return {
      mode: 'edit',
      profile: null,
      draft: prepared.draft,
      errors: prepared.errors,
      success: '',
      error: '',
      body: null,
      called: false,
    };
  }

  try {
    const serverUser = await update(prepared.body);
    const saved = applySuccessfulProfileSave(serverUser);
    return {
      mode: saved.mode,
      profile: saved.profile,
      draft: saved.draft ?? prepared.draft,
      errors: saved.errors,
      success: saved.success,
      error: '',
      body: prepared.body,
      called: true,
    };
  } catch (error) {
    return {
      mode: 'edit',
      profile: null,
      // Keep the caller's unsaved draft (not only the trimmed body).
      draft,
      errors: { first_name: '', last_name: '', phone: '' },
      success: '',
      error: profileErrorMessage(error),
      body: prepared.body,
      called: true,
    };
  }
}

/** Field names the AccountPage edit form may render as inputs. */
export function profileEditInputFields(): EditableProfileField[] {
  return [...EDITABLE_PROFILE_FIELDS];
}

/** Read-only labels shown on AccountPage (never inputs). */
export function profileReadOnlyDisplayFields(): ProtectedProfileField[] {
  return ['email', 'verification_status', 'role', 'status', 'id', 'created_at'];
}

export function claimsProfileSavedSuccessfully(message: string): boolean {
  return /(?:saved|updated) successfully/i.test(message);
}

/** Prove verification is never treated as an editable field in design helpers. */
export function verificationStatusIsEditableInput(): boolean {
  return isEditableProfileField('verification_status');
}

export function profileSaveLabel(submitting: boolean): string {
  return submitting ? PROFILE_SAVING_LABEL : PROFILE_SAVE_LABEL;
}

/** US-21.6 — page-level feedback status for AccountPage. */
export type ProfilePageUiStatus =
  | 'loading'
  | 'ready'
  | 'load_error'
  | 'editing'
  | 'saving'
  | 'save_error'
  | 'success';

export function profilePageUiStatus(state: {
  loading: boolean;
  profile: ProfileView | null;
  loadError: string;
  mode: ProfileMode;
  saving: boolean;
  saveError: string;
  success: string;
}): ProfilePageUiStatus {
  if (state.loading && !state.profile) return 'loading';
  if (!state.profile) return 'load_error';
  if (state.saving) return 'saving';
  if (state.mode === 'edit' && state.saveError) return 'save_error';
  if (state.mode === 'view' && state.success) return 'success';
  if (state.mode === 'edit') return 'editing';
  return 'ready';
}

/** Start GET /api/profile — clear prior profile so stale data is not shown as confirmed. */
export function applyProfileLoadPending(): {
  loading: boolean;
  profile: null;
  loadError: string;
  success: string;
  saveError: string;
  mode: ProfileMode;
} {
  return {
    loading: true,
    profile: null,
    loadError: '',
    success: '',
    saveError: '',
    mode: 'view',
  };
}

export function applyProfileLoadSuccess(serverUser: CurrentUserLike): {
  loading: boolean;
  profile: ProfileView | null;
  loadError: string;
} {
  return {
    loading: false,
    profile: toProfileView(serverUser),
    loadError: '',
  };
}

/** Failed GET — no fabricated profile values. */
export function applyProfileLoadFailure(error: unknown): {
  loading: boolean;
  profile: null;
  loadError: string;
} {
  return {
    loading: false,
    profile: null,
    loadError: profileErrorMessage(error, PROFILE_LOAD_ERROR_FALLBACK),
  };
}

/**
 * Gate a PATCH attempt. When already saving, reject so duplicate clicks
 * cannot start a second request.
 */
export function beginProfileSaveAttempt(alreadySaving: boolean): {
  allowed: boolean;
  saving: boolean;
} {
  if (alreadySaving) {
    return { allowed: false, saving: true };
  }
  return { allowed: true, saving: true };
}

export function canAttemptProfileSave(options: {
  canEdit: boolean;
  saving: boolean;
  mode: ProfileMode;
}): boolean {
  return options.canEdit && !options.saving && options.mode === 'edit';
}

export function isProfileSaveDisabled(options: {
  canEdit: boolean;
  saving: boolean;
  mode: ProfileMode;
  draft: ProfileEditDraft;
}): boolean {
  if (!canAttemptProfileSave(options)) return true;
  return !canSubmitProfileDraft(options.draft, {
    mode: options.mode,
    submitting: options.saving,
  });
}

/** Clear stale success/API banners when the user edits, cancels, or retries. */
export function clearProfileActionFeedback(): {
  success: string;
  saveError: string;
} {
  return { success: '', saveError: '' };
}

export function profileFieldErrorId(field: EditableProfileField): string {
  return `profile-${field}-error`;
}

export function profileSuccessMessage(): string {
  return PROFILE_SUCCESS_MESSAGE;
}

/**
 * Protected identity display remains read-only across all feedback states.
 * Never becomes an input just because load/save feedback is active.
 */
export function profileProtectedFieldsStayReadOnly(
  status: ProfilePageUiStatus
): boolean {
  void status;
  return (
    !isEditableProfileField('email') &&
    !isEditableProfileField('verification_status') &&
    !verificationStatusIsEditableInput()
  );
}
