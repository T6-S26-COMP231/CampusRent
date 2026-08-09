import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import {
  CANCEL_REPORT_LABEL,
  REPORT_DETAILS_LABEL,
  REPORT_DETAILS_PLACEHOLDER,
  REPORT_REASON_LABEL,
  REPORT_REASON_PLACEHOLDER,
  applyCancelledReportForm,
  applyFailedReportSubmit,
  applySuccessfulReportSubmit,
  buildSubmitReportBody,
  canSubmitReport,
  reportErrorMessage,
  reportFormHeading,
  reportSubmitLabel,
  reportTargetSummary,
  reportValidationMessages,
  type ReportTarget,
} from '../utils/reportContent';

interface Props {
  target: ReportTarget;
  viewerId: number | string | undefined;
  onCancel: () => void;
  /** Optional hook after a real successful POST /api/reports. */
  onSubmitted?: () => void;
}

/**
 * US-20.2 / US-20.6 — report-user / report-listing form wired to POST /api/reports.
 * Target ids come from the `target` prop only (trusted page context).
 * Reporter identity is never sent from the client.
 */
export default function ReportContentForm({
  target,
  viewerId,
  onCancel,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [detailsError, setDetailsError] = useState('');

  const submitEnabled = canSubmitReport({
    target,
    reason,
    details,
    submitting,
    viewerId,
  });

  const handleCancel = () => {
    const cleared = applyCancelledReportForm();
    setReason(cleared.reason);
    setDetails(cleared.details);
    setError(cleared.error);
    setSuccess(cleared.success);
    setReasonError('');
    setDetailsError('');
    onCancel();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const messages = reportValidationMessages({ reason, details });
    setReasonError(messages.reason);
    setDetailsError(messages.details);

    if (
      !canSubmitReport({
        target,
        reason,
        details,
        submitting,
        viewerId,
      })
    ) {
      return;
    }

    // Body is built from trusted `target` prop — never from editable target fields.
    // Never include reporter_id.
    const body = buildSubmitReportBody(target, reason, details);
    setSubmitting(true);
    try {
      await api.submitReport(body);
      const applied = applySuccessfulReportSubmit();
      setReason(applied.reason);
      setDetails(applied.details);
      setError(applied.error);
      setSuccess(applied.success);
      setReasonError('');
      setDetailsError('');
      onSubmitted?.();
    } catch (err) {
      const failed = applyFailedReportSubmit(reason, details, err);
      setReason(failed.reason);
      setDetails(failed.details);
      setError(failed.error || reportErrorMessage(err));
      setSuccess(failed.success);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      aria-label={reportFormHeading(target.type)}
    >
      <div>
        <h3 className="font-display text-lg font-bold text-slate-950">
          {reportFormHeading(target.type)}
        </h3>
        <p className="mt-1 text-sm font-medium text-slate-600">{reportTargetSummary(target)}</p>
        <p className="mt-1 text-xs text-slate-400">
          Reports are reviewed by the System Administration Team.
        </p>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          {REPORT_REASON_LABEL}
        </label>
        <input
          type="text"
          className="input-field"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError('');
            setError('');
            if (success) setSuccess('');
          }}
          placeholder={REPORT_REASON_PLACEHOLDER}
          disabled={submitting}
          autoComplete="off"
        />
        {reasonError && <p className="mt-1 text-xs font-medium text-red-600">{reasonError}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          {REPORT_DETAILS_LABEL}
        </label>
        <textarea
          className="input-field min-h-[7rem] resize-y"
          value={details}
          onChange={(event) => {
            setDetails(event.target.value);
            setDetailsError('');
            setError('');
            if (success) setSuccess('');
          }}
          placeholder={REPORT_DETAILS_PLACEHOLDER}
          disabled={submitting}
        />
        {detailsError && (
          <p className="mt-1 text-xs font-medium text-red-600">{detailsError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleCancel}
          disabled={submitting}
        >
          {CANCEL_REPORT_LABEL}
        </button>
        <button type="submit" className="btn-primary" disabled={!submitEnabled}>
          {reportSubmitLabel(submitting)}
        </button>
      </div>
    </form>
  );
}
