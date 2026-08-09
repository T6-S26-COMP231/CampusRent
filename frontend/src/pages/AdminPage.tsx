import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import ModerationQueue from '../components/ModerationQueue';
import ModerationReportDetail from '../components/ModerationReportDetail';
import { api, User } from '../api/client';
import {
  MODERATION_SECTION_LABEL,
  findModerationReportView,
  moderationQueueRowsFromViews,
  type ModerationReportView,
} from '../utils/moderationQueue';

/**
 * System Administration Team dashboard.
 * US-22 verification + US-23.2 moderation queue / report-detail UI.
 *
 * Report list/detail data is owned by US-23.3 (#154). Until that endpoint
 * exists this page does not fabricate reports — the queue stays empty.
 */
export default function AdminPage() {
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // US-23.2 / #154 seam: real GET /admin/reports will populate these later.
  const [moderationViews] = useState<ModerationReportView[]>([]);
  const [moderationLoading] = useState(false);
  const [moderationError] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const moderationRows = useMemo(
    () => moderationQueueRowsFromViews(moderationViews),
    [moderationViews]
  );
  const selectedView = useMemo(
    () => findModerationReportView(moderationViews, selectedReportId),
    [moderationViews, selectedReportId]
  );

  const loadUsers = () => {
    setLoading(true);
    api
      .get<User[]>('/admin/verifications')
      .then(setPendingUsers)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to load pending accounts')
      )
      .finally(() => setLoading(false));
  };

  useEffect(loadUsers, []);

  const verifyUser = async (userId: number, action: 'approve' | 'reject') => {
    setError('');
    setMessage('');
    try {
      await api.patch(`/admin/verifications/${userId}`, { action });
      setMessage(
        action === 'approve'
          ? 'Student account verified successfully.'
          : 'Student account rejected.'
      );
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update verification status');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-campus-950 via-campus-800 to-campus-600 px-6 py-8 text-white shadow-card sm:px-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-campus-200">
              System administration
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold">Admin dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-campus-100">
              Verify student registrations and review reported users or listings so CampusRent stays
              safe and trustworthy.
            </p>
          </div>
        </div>
      </section>

      {message && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5" /> {message}
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Pending accounts</h2>
          <p className="mt-1 text-sm text-slate-500">
            {pendingUsers.length} account{pendingUsers.length === 1 ? '' : 's'} waiting for review
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 space-y-4">
          {[1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="card mt-5 py-14 text-center">
          <UserCheck className="mx-auto h-12 w-12 text-emerald-500" />
          <h3 className="mt-4 font-display text-xl font-bold text-slate-900">All caught up</h3>
          <p className="mt-2 text-sm text-slate-500">There are no pending student accounts.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {pendingUsers.map((student) => (
            <article
              key={student.id}
              className="card flex flex-col justify-between gap-5 sm:flex-row sm:items-center"
            >
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {student.first_name} {student.last_name}
                </h3>
                <p className="mt-1 text-sm font-medium text-campus-700">{student.email}</p>
                {student.created_at && (
                  <p className="mt-2 text-xs text-slate-400">
                    Registered {new Date(student.created_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => verifyUser(student.id, 'approve')} className="btn-primary">
                  <UserCheck className="h-4 w-4" /> Approve
                </button>
                <button onClick={() => verifyUser(student.id, 'reject')} className="btn-danger">
                  <UserX className="h-4 w-4" /> Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-campus-700">
          {MODERATION_SECTION_LABEL}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Reports submitted through CampusRent appear here for System Administration Team review.
          List and detail data will load from the admin reports API when it is available.
        </p>

        <div className="mt-6">
          <ModerationQueue
            rows={moderationRows}
            loading={moderationLoading}
            error={moderationError}
            selectedReportId={selectedReportId}
            onSelect={setSelectedReportId}
          />
        </div>

        <ModerationReportDetail view={selectedView} />
      </div>
    </div>
  );
}
