import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  PROFILE_ACCOUNT_STATUS_LABEL,
  PROFILE_CANCEL_LABEL,
  PROFILE_EDIT_ENTRY_LABEL,
  PROFILE_EDIT_HEADING,
  PROFILE_EMAIL_LABEL,
  PROFILE_FIRST_NAME_LABEL,
  PROFILE_LAST_NAME_LABEL,
  PROFILE_PHONE_LABEL,
  PROFILE_PHONE_PLACEHOLDER,
  PROFILE_ROLE_LABEL,
  PROFILE_SAVE_LABEL,
  PROFILE_VERIFICATION_LABEL,
  PROFILE_VIEW_HEADING,
  applyCancelledProfileEdit,
  applyEnterProfileEdit,
  applyProfileFormSave,
  canSubmitProfileDraft,
  profileRoleLabel,
  toProfileView,
  type ProfileEditDraft,
  type ProfileFieldErrors,
  type ProfileMode,
  type ProfileVerificationStatus,
} from '../utils/manageProfile';

const verificationPanelStyles: Record<
  ProfileVerificationStatus,
  { icon: typeof Clock3; className: string }
> = {
  pending: {
    icon: Clock3,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  verified: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  rejected: {
    icon: ShieldAlert,
    className: 'border-red-200 bg-red-50 text-red-800',
  },
};

function emptyErrors(): ProfileFieldErrors {
  return { first_name: '', last_name: '', phone: '' };
}

export default function AccountPage() {
  const { user, isAdmin } = useAuth();
  const [mode, setMode] = useState<ProfileMode>('view');
  const [draft, setDraft] = useState<ProfileEditDraft | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>(emptyErrors);
  const [notice, setNotice] = useState('');

  const profile = useMemo(() => (user && !isAdmin ? toProfileView(user) : null), [user, isAdmin]);

  if (!user) return null;

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
            System administration
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">
            Administrator account
          </h1>
          <p className="mt-2 text-slate-500">
            Administrators verify student registrations and moderate reports. They do not use
            registered-student profile editing.
          </p>
        </div>

        <section className="card overflow-hidden !p-0">
          <div className="border-b border-slate-100 bg-gradient-to-r from-campus-950 to-campus-700 px-6 py-7 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {user.first_name} {user.last_name}
                </h2>
                <p className="text-sm text-campus-100">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-campus-200 bg-campus-50 p-5 text-campus-900">
              <h3 className="font-semibold">System Administration Team access</h3>
              <p className="mt-1 text-sm leading-6">
                Review pending student verifications and open reports from the admin dashboard.
              </p>
            </div>
            <Link to="/admin" className="btn-primary mt-6 w-full">
              Open Verification Dashboard
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!profile) return null;

  const verificationStyle = verificationPanelStyles[profile.readOnly.verification_status];
  const VerificationIcon = verificationStyle.icon;
  const activeDraft = draft ?? {
    first_name: profile.personal.first_name,
    last_name: profile.personal.last_name,
    phone: profile.personal.phone,
  };
  const saveEnabled = canSubmitProfileDraft(activeDraft, { mode });

  const enterEdit = () => {
    const next = applyEnterProfileEdit(profile);
    setMode(next.mode);
    setDraft(next.draft);
    setErrors(next.errors);
    setNotice(next.notice);
  };

  const cancelEdit = () => {
    const next = applyCancelledProfileEdit(profile);
    setMode(next.mode);
    setDraft(next.draft);
    setErrors(next.errors);
    setNotice(next.notice);
  };

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const result = applyProfileFormSave(activeDraft);
    setMode(result.mode);
    setDraft(result.draft);
    setErrors(result.errors);
    setNotice(result.notice);
    // US-21.3 / US-21.5 own persistence — never claim a successful save here.
  };

  const updateDraft = (field: keyof ProfileEditDraft, value: string) => {
    setDraft((prev) => ({
      first_name: prev?.first_name ?? profile.personal.first_name,
      last_name: prev?.last_name ?? profile.personal.last_name,
      phone: prev?.phone ?? profile.personal.phone,
      [field]: value,
    }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setNotice('');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">
          Registered student account
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">
          {mode === 'edit' ? PROFILE_EDIT_HEADING : PROFILE_VIEW_HEADING}
        </h1>
        <p className="mt-2 text-slate-500">
          Keep your personal details up to date. Verification status is shown for reference and
          cannot be changed here.
        </p>
      </div>

      <section className="card overflow-hidden !p-0" aria-label={PROFILE_VIEW_HEADING}>
        <div className="border-b border-slate-100 bg-gradient-to-r from-campus-950 to-campus-700 px-6 py-7 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <UserRound className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">{profile.displayName}</h2>
                <p className="text-sm text-campus-100">{profile.readOnly.email}</p>
              </div>
            </div>
            <StatusBadge status={profile.readOnly.verification_status} />
          </div>
        </div>

        <div className="p-6">
          <div className={`rounded-2xl border p-5 ${verificationStyle.className}`}>
            <div className="flex items-start gap-3">
              <VerificationIcon className="mt-0.5 h-6 w-6 shrink-0" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{profile.verificationLabel}</h3>
                  <StatusBadge status={profile.readOnly.verification_status} />
                </div>
                <p className="mt-1 text-sm leading-6">{profile.verificationDescription}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wider opacity-80">
                  {PROFILE_VERIFICATION_LABEL} — read-only
                </p>
              </div>
            </div>
          </div>

          {notice && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {notice}
            </div>
          )}

          {mode === 'view' ? (
            <>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_FIRST_NAME_LABEL}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {profile.personal.first_name || '—'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_LAST_NAME_LABEL}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {profile.personal.last_name || '—'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_PHONE_LABEL}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {profile.personal.phone || '—'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_EMAIL_LABEL}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">{profile.readOnly.email}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_ROLE_LABEL}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {profileRoleLabel(profile.readOnly.role)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_ACCOUNT_STATUS_LABEL}
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge status={profile.readOnly.status} />
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary" onClick={enterEdit}>
                  <Pencil className="h-4 w-4" />
                  {PROFILE_EDIT_ENTRY_LABEL}
                </button>
                {profile.readOnly.verification_status === 'verified' && (
                  <Link to="/browse" className="btn-secondary">
                    Continue to Listings
                  </Link>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="mt-6 space-y-4" aria-label={PROFILE_EDIT_HEADING}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="profile-first-name">
                    {PROFILE_FIRST_NAME_LABEL}
                  </label>
                  <input
                    id="profile-first-name"
                    name="first_name"
                    className="input-field"
                    value={activeDraft.first_name}
                    onChange={(event) => updateDraft('first_name', event.target.value)}
                    autoComplete="given-name"
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.first_name}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="profile-last-name">
                    {PROFILE_LAST_NAME_LABEL}
                  </label>
                  <input
                    id="profile-last-name"
                    name="last_name"
                    className="input-field"
                    value={activeDraft.last_name}
                    onChange={(event) => updateDraft('last_name', event.target.value)}
                    autoComplete="family-name"
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-xs font-medium text-red-600">{errors.last_name}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="profile-phone">
                  {PROFILE_PHONE_LABEL}
                </label>
                <input
                  id="profile-phone"
                  name="phone"
                  className="input-field"
                  value={activeDraft.phone}
                  onChange={(event) => updateDraft('phone', event.target.value)}
                  placeholder={PROFILE_PHONE_PLACEHOLDER}
                  autoComplete="tel"
                />
              </div>

              {/* Protected fields remain display-only in edit mode — never inputs. */}
              <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_EMAIL_LABEL}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">{profile.readOnly.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {PROFILE_VERIFICATION_LABEL}
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge status={profile.readOnly.verification_status} />
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary" onClick={cancelEdit}>
                  {PROFILE_CANCEL_LABEL}
                </button>
                <button type="submit" className="btn-primary" disabled={!saveEnabled}>
                  {PROFILE_SAVE_LABEL}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
