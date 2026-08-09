import { BarChart3, FileText } from 'lucide-react';
import {
  ACTIVITY_NO_DATA_MESSAGE,
  ACTIVITY_REPORT_HEADING,
  activityReportResultView,
  activityReportSummaryTotalForDisplay,
  type ActivityReport,
} from '../utils/activityMetrics';
import ActivityMetricWidget from './ActivityMetricWidget';

export interface ActivityReportResultProps {
  report: ActivityReport;
}

/**
 * US-24.3 — reusable activity-report result presentation.
 * Renders a supplied ActivityReport only — does not generate reports.
 * Displays summary_total as provided (never recomputed from breakdown rows).
 */
export default function ActivityReportResult({ report }: ActivityReportResultProps) {
  const view = activityReportResultView(report);
  const summaryTotal = activityReportSummaryTotalForDisplay(report);

  if (view.show_no_data) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-center"
        role="status"
        aria-live="polite"
        data-testid="activity-report-result"
      >
        <BarChart3 className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">
          {view.no_data_message || ACTIVITY_NO_DATA_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5"
      data-testid="activity-report-result"
      aria-label={ACTIVITY_REPORT_HEADING}
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-campus-700" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Generated
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {view.generated_at}
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Selected filters
          </p>
          <p className="mt-1 text-sm text-slate-700">{view.filter_summary}</p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Summary total
          </p>
          <p
            className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums"
            data-testid="activity-report-summary-total"
          >
            {summaryTotal}
          </p>

          <div
            className="mt-5 grid gap-3 sm:grid-cols-2"
            aria-label="Report metric rows"
          >
            {view.metrics.map((row) => (
              <ActivityMetricWidget
                key={row.key}
                metricKey={row.key}
                label={row.label}
                count={row.count}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
