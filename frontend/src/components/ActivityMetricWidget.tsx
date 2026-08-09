import {
  activityMetricWidgetView,
  type ActivityMetricKey,
} from '../utils/activityMetrics';

export interface ActivityMetricWidgetProps {
  metricKey: ActivityMetricKey;
  label: string;
  count: number;
}

/**
 * US-24.3 — reusable activity statistic card.
 * Displays only the supplied label/count; never fabricates values.
 */
export default function ActivityMetricWidget({
  metricKey,
  label,
  count,
}: ActivityMetricWidgetProps) {
  const view = activityMetricWidgetView({
    key: metricKey,
    label,
    count,
  });

  return (
    <article
      className="card !p-4"
      data-testid={`activity-metric-widget-${view.key}`}
      aria-label={`${view.label}: ${view.countText}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {view.label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
        {view.countText}
      </p>
    </article>
  );
}
