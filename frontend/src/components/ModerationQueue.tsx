import { Flag, LoaderCircle } from 'lucide-react';
import {
  MODERATION_QUEUE_EMPTY_MESSAGE,
  MODERATION_QUEUE_HEADING,
  MODERATION_QUEUE_LOADING_LABEL,
  formatModerationTimestamp,
  moderationQueueUiStatus,
  moderationStatusLabel,
  type ModerationQueueRow,
} from '../utils/moderationQueue';

interface Props {
  rows: ModerationQueueRow[];
  loading?: boolean;
  error?: string;
  selectedReportId?: number | null;
  onSelect: (reportId: number) => void;
}

/**
 * US-23.2 — administrator moderation queue list.
 * Renders only the rows provided by the parent (no fabricated reports).
 */
export default function ModerationQueue({
  rows,
  loading = false,
  error = '',
  selectedReportId = null,
  onSelect,
}: Props) {
  const status = moderationQueueUiStatus(loading, error, rows.length);

  return (
    <section aria-label={MODERATION_QUEUE_HEADING}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">{MODERATION_QUEUE_HEADING}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {status === 'populated'
              ? `${rows.length} report${rows.length === 1 ? '' : 's'} in the queue`
              : 'Review reports submitted by registered students'}
          </p>
        </div>
      </div>

      {status === 'loading' && (
        <div className="mt-5 space-y-4" aria-busy="true" aria-label={MODERATION_QUEUE_LOADING_LABEL}>
          {[1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          ))}
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" /> {MODERATION_QUEUE_LOADING_LABEL}
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {status === 'empty' && (
        <div className="card mt-5 py-14 text-center">
          <Flag className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 font-display text-xl font-bold text-slate-900">No reports yet</h3>
          <p className="mt-2 text-sm text-slate-500">{MODERATION_QUEUE_EMPTY_MESSAGE}</p>
        </div>
      )}

      {status === 'populated' && (
        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const selected = selectedReportId === row.report_id;
            return (
              <button
                key={row.report_id}
                type="button"
                onClick={() => onSelect(row.report_id)}
                className={`card w-full text-left transition hover:-translate-y-0.5 hover:shadow-card-hover ${
                  selected ? 'ring-2 ring-campus-500' : ''
                }`}
                aria-pressed={selected}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Report #{row.report_id} · {row.target_type}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
                      {row.target_label}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Reporter: {row.reporter_label}
                    </p>
                  </div>
                  <span className="badge bg-campus-50 text-campus-700">
                    {moderationStatusLabel(row.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-800">{row.reason}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Submitted {formatModerationTimestamp(row.created_at)}
                  {!row.target_exists ? ' · Target unavailable' : ''}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
