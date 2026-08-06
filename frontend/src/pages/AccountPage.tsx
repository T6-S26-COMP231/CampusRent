import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const studentStatusConfig = {
  pending: {
    title: 'Verification pending',
    description:
      'A System Administration Team member must verify your student account before registered-student rental features become available.',
    icon: Clock3,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  verified: {
    title: 'Student account verified',
    description:
      'Your Registered Student User account can browse listings, create and manage your own listings, submit requests, and approve or decline requests for items you own.',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  rejected: {
    title: 'Verification rejected',
    description:
      'The System Administration Team did not approve this registration. Contact the project team for assistance.',
    icon: ShieldAlert,
    className: 'border-red-200 bg-red-50 text-red-800',
  },
};

export default function AccountPage() {
  const { user, isAdmin } = useAuth();
  if (!user) return null;

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">System administration</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Administrator account</h1>
          <p className="mt-2 text-slate-500">
            During Iteration 1, administrators verify student registrations. They do not create listings or use registered-student rental functions.
          </p>
        </div>

        <section className="card overflow-hidden !p-0">
          <div className="border-b border-slate-100 bg-gradient-to-r from-campus-950 to-campus-700 px-6 py-7 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">{user.first_name} {user.last_name}</h2>
                <p className="text-sm text-campus-100">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-campus-200 bg-campus-50 p-5 text-campus-900">
              <h3 className="font-semibold">System Administration Team access</h3>
              <p className="mt-1 text-sm leading-6">
                Your Iteration 1 responsibility is to review Pending Verification accounts and approve or reject eligible students.
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

  const config = studentStatusConfig[user.verification_status];
  const Icon = config.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Registered student account</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Student verification status</h1>
        <p className="mt-2 text-slate-500">
          This read-only page supports the Iteration 1 registration and student-verification workflow.
        </p>
      </div>

      <section className="card overflow-hidden !p-0">
        <div className="border-b border-slate-100 bg-gradient-to-r from-campus-950 to-campus-700 px-6 py-7 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">{user.first_name} {user.last_name}</h2>
              <p className="text-sm text-campus-100">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className={`rounded-2xl border p-5 ${config.className}`}>
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-6 w-6 shrink-0" />
              <div>
                <h3 className="font-semibold">{config.title}</h3>
                <p className="mt-1 text-sm leading-6">{config.description}</p>
              </div>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Role</dt>
              <dd className="mt-1 font-semibold text-slate-800">Registered Student User</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Verification</dt>
              <dd className="mt-1 font-semibold capitalize text-slate-800">{user.verification_status}</dd>
            </div>
          </dl>

          {user.verification_status === 'verified' && (
            <Link to="/browse" className="btn-primary mt-6 w-full">Continue to Listings</Link>
          )}
        </div>
      </section>
    </div>
  );
}
