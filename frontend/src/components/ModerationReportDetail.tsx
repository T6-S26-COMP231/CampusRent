import { useEffect, useState } from 'react';
import {
  MODERATION_ACTIONS_HEADING,
  MODERATION_ACTION_PROCESSING_LABEL,
  MODERATION_CANCEL_CONFIRM_LABEL,
  MODERATION_CONFIRM_ACTION_LABEL,
  MODERATION_DETAIL_EMPTY_SELECTION,
  MODERATION_DETAIL_HEADING,
  attemptModerationActionUi,
  cancelModerationActionConfirm,
  formatModerationTimestamp,
  moderationActionButtonClass,
  moderationActionLabel,
  moderationActionsDisabledReason,
  moderationConfirmMessage,
  moderationStatusLabel,
  moderationTargetHeading,
  moderationTargetMissingMessage,
  visibleModerationActions,
  type ModerationAction,
  type ModerationReportView,
} from '../utils/moderationQueue';

interface Props {
  view: ModerationReportView | null;
  /** Real US-23.6 handler — only called after confirmation for destructive actions. */
  onAction?: (action: ModerationAction) => void | Promise<void>;
  acting?: boolean;
  actionMessage?: string;
  actionError?: string;
}

function actionClassName(action: ModerationAction): string {
  const kind = moderationActionButtonClass(action);
  if (kind === 'danger') return 'btn-danger';
  if (kind === 'primary') return 'btn-primary';
  return 'btn-secondary';
}

/**
 * US-23.2 / US-23.6 — report detail, target panel, and moderation actions.
 */
export default function ModerationReportDetail({
  view,
  onAction,
  acting = false,
  actionMessage = '',
  actionError = '',
}: Props) {
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setPendingAction(null);
    setNotice('');
  }, [view?.report.report_id]);

  if (!view) {
    return (
      <section className="card mt-6" aria-label={MODERATION_DETAIL_HEADING}>
        <h2 className="font-display text-xl font-bold text-slate-900">{MODERATION_DETAIL_HEADING}</h2>
        <p className="mt-2 text-sm text-slate-500">{MODERATION_DETAIL_EMPTY_SELECTION}</p>
      </section>
    );
  }

  const { report, target } = view;
  const actions = visibleModerationActions(report.target_type, report.status);
  const disabledReason = moderationActionsDisabledReason(report.status);
  const controlsDisabled = acting;

  const handleActionClick = (action: ModerationAction) => {
    if (controlsDisabled) return;
    setNotice('');
    const next = attemptModerationActionUi(action, { onAction });
    setPendingAction(next.pendingAction);
    setNotice(next.notice);
  };

  const handleConfirm = () => {
    if (!pendingAction || controlsDisabled) return;
    const next = attemptModerationActionUi(pendingAction, {
      confirmed: true,
      onAction,
    });
    setPendingAction(next.pendingAction);
    setNotice(next.notice);
  };

  const handleCancelConfirm = () => {
    if (controlsDisabled) return;
    const next = cancelModerationActionConfirm();
    setPendingAction(next.pendingAction);
    setNotice(next.notice);
  };

  return (
    <section className="mt-6 space-y-4" aria-label={MODERATION_DETAIL_HEADING}>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Report #{report.report_id}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
              {MODERATION_DETAIL_HEADING}
            </h2>
          </div>
          <span className="badge bg-campus-50 text-campus-700">
            {moderationStatusLabel(report.status)}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reporter</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{report.reporter_label}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Submitted</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">
              {formatModerationTimestamp(report.created_at)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reason</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{report.reason}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Supporting details
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {report.details}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3 className="font-display text-lg font-bold text-slate-900">
          {moderationTargetHeading(target)}
        </h3>

        {!target.exists ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {moderationTargetMissingMessage(target)}
          </p>
        ) : target.target_type === 'listing' ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Title</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{target.title}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Owner</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {target.owner_label || `User #${target.owner_id}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Category</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{target.category}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Availability
              </dt>
              <dd className="mt-1 text-sm font-medium capitalize text-slate-800">
                {target.availability}
              </dd>
            </div>
            {target.description_preview && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Description
                </dt>
                <dd className="mt-1 text-sm leading-6 text-slate-700">{target.description_preview}</dd>
              </div>
            )}
          </dl>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Name</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{target.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email</dt>
              <dd className="mt-1 text-sm font-medium text-campus-700">{target.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Verification
              </dt>
              <dd className="mt-1 text-sm font-medium capitalize text-slate-800">
                {target.verification_status}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Account status
              </dt>
              <dd className="mt-1 text-sm font-medium capitalize text-slate-800">
                {target.account_status}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="card">
        <h3 className="font-display text-lg font-bold text-slate-900">{MODERATION_ACTIONS_HEADING}</h3>
        {disabledReason ? (
          <p className="mt-3 text-sm text-slate-500">{disabledReason}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={actionClassName(action)}
                  disabled={controlsDisabled}
                  onClick={() => handleActionClick(action)}
                >
                  {moderationActionLabel(action)}
                </button>
              ))}
            </div>

            {pendingAction && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">{moderationConfirmMessage(pendingAction)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={controlsDisabled}
                    onClick={handleConfirm}
                  >
                    {MODERATION_CONFIRM_ACTION_LABEL}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={controlsDisabled}
                    onClick={handleCancelConfirm}
                  >
                    {MODERATION_CANCEL_CONFIRM_LABEL}
                  </button>
                </div>
              </div>
            )}

            {acting && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {actionMessage || MODERATION_ACTION_PROCESSING_LABEL}
              </div>
            )}

            {!acting && actionMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {actionMessage}
              </div>
            )}

            {!acting && actionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            {notice && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {notice}
              </div>
            )}
          </>
        )}

        {disabledReason && (actionMessage || actionError) && (
          <>
            {actionMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {actionMessage}
              </div>
            )}
            {actionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
