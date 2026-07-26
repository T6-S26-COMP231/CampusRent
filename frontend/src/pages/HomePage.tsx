import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  PackagePlus,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { user, isVerified, isAdmin } = useAuth();

  const primaryAction = isAdmin
    ? { to: '/admin', label: 'Open Verification Dashboard' }
    : isVerified
      ? { to: '/browse', label: 'Browse Items' }
      : user
        ? { to: '/account', label: 'View Verification Status' }
        : { to: '/register', label: 'Register with School Email' };

  const secondaryAction = isVerified
    ? { to: '/listings/new', label: 'Create a Listing' }
    : user
      ? null
      : { to: '/login', label: 'Sign In' };

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-campus-900 via-campus-800 to-campus-700 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1zbnM9Imh0dHA6Ly93d3cub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbC1vcGFjaXR5PSIwLjAzIj48cGF0aCBkPSJNMzYgMzRoNHYyaC00em0wLTRoNHYyaC00em0wLTRoNHYyaC00em0wLTRoNHYyaC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
              <BookOpen className="h-4 w-4" /> CampusRent · Iteration 1
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
              Rent what you need.
              <span className="block text-campus-200">Share what you have.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-campus-100/90">
              A verified student-to-student platform for listing items, finding rentals,
              submitting requests, and approving incoming requests within the campus community.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to={primaryAction.to} className="btn-primary !bg-white !text-campus-800 hover:!bg-campus-50">
                {primaryAction.label} <ArrowRight className="h-4 w-4" />
              </Link>
              {secondaryAction && (
                <Link
                  to={secondaryAction.to}
                  className="btn-secondary !border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
                >
                  {secondaryAction.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Verified student access',
              description:
                'Students register with an institutional email and wait for a System Administration Team member to approve or reject the account.',
            },
            {
              icon: PackagePlus,
              title: 'Student-owned listings',
              description:
                'Verified students can create, edit, remove, and update only the listings they own. Administrators cannot post items.',
            },
            {
              icon: ClipboardCheck,
              title: 'Rental request approval',
              description:
                'Verified students can request available items, and listing owners can review and approve incoming requests.',
            },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="card text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-campus-50 text-campus-600">
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-campus-50/50 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-campus-900">Iteration 1 workflow</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              'Register with an institutional email',
              'Administrator verifies the student',
              'Verified student lists or finds an item',
              'Rental request is submitted and approved',
            ].map((step, index) => (
              <div key={step} className="relative">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-campus-600 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{step}</p>
                {index === 3 && <CheckCircle2 className="mx-auto mt-3 h-5 w-5 text-emerald-500" />}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
