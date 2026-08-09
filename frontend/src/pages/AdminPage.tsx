import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileQuestion, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import ActivityDashboard from '../components/ActivityDashboard';
import ModerationQueue from '../components/ModerationQueue';
import ModerationReportDetail from '../components/ModerationReportDetail';
import { api, User } from '../api/client';
import {
  MODERATION_ACTION_PROCESSING_LABEL,
  MODERATION_SECTION_LABEL,
  applyModerationActionSuccessToViews,
  findModerationReportView,
  mapAdminReportApiToView,
  mapAdminReportsApiToViews,
  moderationActionErrorMessage,
  moderationActionSuccessMessage,
  moderationQueueRowsFromViews,
  preserveSelectedReportId,
  type ModerationAction,
  type ModerationReportView,
} from '../utils/moderationQueue';
import {
  REQUEST_MORE_INFO_LABEL,
  buildVerificationActionBody,
  verificationActionSuccessMessage,
  verificationPatchPath,
  type VerificationAction,
} from '../utils/studentVerification';

/**
 * System Administration Team dashboard.
 * US-22 verification + US-23.6 moderation + US-24.6 activity monitoring API.
 */
export default function AdminPage() {
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [moderationViews, setModerationViews] = useState<ModerationReportView[]>([]);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [moderationError, setModerationError] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [moderationActing, setModerationActing] = useState(false);
  const [moderationActionMessage, setModerationActionMessage] = useState('');
  const [moderationActionError, setModerationActionError] = useState('');

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

  const loadReports = useCallback(async (preserveSelection = true) => {
    setModerationLoading(true);
    setModerationError('');
    try {
      const payloads = await api.getAdminReports();
      const views = mapAdminReportsApiToViews(payloads);
      setModerationViews(views);
      setSelectedReportId((current) =>
        preserveSelection ? preserveSelectedReportId(current, views) : null
      );
    } catch (err) {
      setModerationViews([]);
      setSelectedReportId(null);
      setModerationError(
        err instanceof Error ? err.message : 'Unable to load reports.'
      );
    } finally {
      setModerationLoading(false);
    }
  }, []);

  useEffect(loadUsers, []);
  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const verifyUser = async (userId: number, action: VerificationAction) => {
    setError('');
    setMessage('');
    try {
      await api.patch(verificationPatchPath(userId), buildVerificationActionBody(action));
      setMessage(verificationActionSuccessMessage(action));
      // request_more_info keeps the student pending — reload so they stay listed.
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update verification status');
    }
  };

  const handleSelectReport = async (reportId: number) => {
    setSelectedReportId(reportId);
    setModerationActionMessage('');
    setModerationActionError('');
    try {
      const detail = await api.getAdminReport(reportId);
      const mapped = mapAdminReportApiToView(detail);
      setModerationViews((current) => applyModerationActionSuccessToViews(current, mapped));
      setSelectedReportId(mapped.report.report_id);
    } catch (err) {
      // Keep list selection + list payload; surface detail refresh failure.
      setModerationActionError(moderationActionErrorMessage(err));
    }
  };

  const handleModerationAction = async (action: ModerationAction) => {
    if (selectedReportId == null || moderationActing) return;

    setModerationActing(true);
    setModerationActionError('');
    setModerationActionMessage(MODERATION_ACTION_PROCESSING_LABEL);

    try {
      const result = await api.performModerationAction(selectedReportId, action);
      const updated = mapAdminReportApiToView({
        report: result.report,
        target: result.target,
      });
      setModerationViews((current) => applyModerationActionSuccessToViews(current, updated));
      setSelectedReportId(updated.report.report_id);
      setModerationActionMessage(moderationActionSuccessMessage(action));

      // Refresh queue from server so status/target reflect persisted state.
      try {
        const payloads = await api.getAdminReports();
        const views = mapAdminReportsApiToViews(payloads);
        setModerationViews(views);
        setSelectedReportId(preserveSelectedReportId(updated.report.report_id, views));
      } catch {
        // Keep the action-response view if queue refresh fails.
      }
    } catch (err) {
      setModerationActionMessage('');
      setModerationActionError(moderationActionErrorMessage(err));
    } finally {
      setModerationActing(false);
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
              Verify student registrations, review reported users or listings, and monitor platform
              activity so CampusRent stays safe and trustworthy.
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
                <button
                  type="button"
                  onClick={() => verifyUser(student.id, 'approve')}
                  className="btn-primary"
                >
                  <UserCheck className="h-4 w-4" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => verifyUser(student.id, 'reject')}
                  className="btn-danger"
                >
                  <UserX className="h-4 w-4" /> Reject
                </button>
                <button
                  type="button"
                  onClick={() => verifyUser(student.id, 'request_more_info')}
                  className="btn-secondary"
                >
                  <FileQuestion className="h-4 w-4" /> {REQUEST_MORE_INFO_LABEL}
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
        </p>

        <div className="mt-6">
          <ModerationQueue
            rows={moderationRows}
            loading={moderationLoading}
            error={moderationError}
            selectedReportId={selectedReportId}
            onSelect={(reportId) => {
              void handleSelectReport(reportId);
            }}
          />
        </div>

        <ModerationReportDetail
          view={selectedView}
          onAction={handleModerationAction}
          acting={moderationActing}
          actionMessage={moderationActionMessage}
          actionError={moderationActionError}
        />
      </div>

      {/* US-24.6 — live platform activity from GET /api/admin/activity. */}
      <ActivityDashboard />
    </div>
  );
}
