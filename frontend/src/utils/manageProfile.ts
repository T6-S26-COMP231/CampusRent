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
 * Profile UI flow (US-21.2 AccountPage):
 *   View mode → current editable values + read-only account/verification
 *   Edit profile → editable fields become inputs; Save / Cancel
 *   Cancel → discard draft (applyCancelledProfileEdit)
 *   Save (UI-only until US-21.5) → validate → truthful not-connected notice
 *
 * Validation reuses registration name rules (required non-empty after trim).
 * No invented phone format/length rules — schema allows empty string.
 *
 * APIs / persistence / owner auth / feedback:
 *   US-21.3 GET/UPDATE profile, US-21.4 protected-field enforcement,
 *   US-21.5 integration, US-21.6 loading/success/error feedback.
 */

export const PROFILE_PAGE_PATH = '/account';
export const PROFILE_PAGE_ENTRY_LABEL = 'Account';
export const PROFILE_VIEW_HEADING = 'My profile';
export const PROFILE_EDIT_HEADING = 'Edit profile';
export const PROFILE_EDIT_ENTRY_LABEL = 'Edit profile';
export const PROFILE_SAVE_LABEL = 'Save changes';
export const PROFILE_SAVING_LABEL = 'Saving...';
export const PROFILE_CANCEL_LABEL = 'Cancel';
export const PROFILE_FIRST_NAME_LABEL = 'First name';
export const PROFILE_LAST_NAME_LABEL = 'Last name';
export const PROFILE_PHONE_LABEL = 'Phone';
export const PROFILE_PHONE_PLACEHOLDER = 'Optional contact phone';
export const PROFILE_EMAIL_LABEL = 'Email';
export const PROFILE_ROLE_LABEL = 'Role';
export const PROFILE_VERIFICATION_LABEL = 'Verification status';
export const PROFILE_ACCOUNT_STATUS_LABEL = 'Account status';
export const PROFILE_SUCCESS_MESSAGE = 'Profile saved successfully.';
export const PROFILE_NOT_CONNECTED_MESSAGE =
  'Profile saving is not connected yet.';
export const PROFILE_INCOMPLETE_FIRST_NAME_MESSAGE = 'First name is required.';
export const PROFILE_INCOMPLETE_LAST_NAME_MESSAGE = 'Last name is required.';
export const PROFILE_LOAD_ERROR_FALLBACK = 'Unable to load profile.';

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
 * US-21.2 — validate then apply the unconnected save path.
 * Invalid drafts stay in edit mode with field errors and no success claim.
 * Valid drafts produce an update body (editable fields only) and the
 * truthful not-connected notice — no persistence.
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
  const unconnected = applyUnconnectedProfileSave();
  return {
    mode: 'edit',
    draft: {
      first_name: body.first_name,
      last_name: body.last_name,
      phone: body.phone,
    },
    errors: { first_name: '', last_name: '', phone: '' },
    notice: unconnected.notice,
    success: unconnected.success,
    body,
  };
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
  return /saved successfully/i.test(message);
}

/** Prove verification is never treated as an editable field in design helpers. */
export function verificationStatusIsEditableInput(): boolean {
  return isEditableProfileField('verification_status');
}

export function profileSaveLabel(submitting: boolean): string {
  return submitting ? PROFILE_SAVING_LABEL : PROFILE_SAVE_LABEL;
}
