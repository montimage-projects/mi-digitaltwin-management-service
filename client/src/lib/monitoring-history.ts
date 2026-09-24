/**
 * Pure helpers for the monitoring dashboard (issue #25): the in-memory metrics
 * history behind the sparklines, the service/severity/time-range filters and
 * value formatting. History lives for the browser session only.
 */

import type {
  AlertMetric,
  AlertOperator,
  AlertSeverity,
  FiredAlert,
  MonitoringSnapshot,
  ServiceMetrics,
} from './monitoring';

export interface MetricPoint {
  /** Snapshot time, epoch ms. */
  t: number;
  cpuMillicores: number;
  memoryBytes: number;
}

/** Points per service key, oldest first. */
export type MetricHistory = Record<string, MetricPoint[]>;

/** The longest selectable time range; older points are dropped. */
export const HISTORY_MAX_AGE_MS = 60 * 60 * 1000;

export const TIME_RANGES = [
  { value: '5m', label: 'Last 5 minutes', ms: 5 * 60 * 1000 },
  { value: '15m', label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
  { value: '1h', label: 'Last hour', ms: HISTORY_MAX_AGE_MS },
] as const;

export type TimeRange = (typeof TIME_RANGES)[number]['value'];

export const ALL = 'all';

/**
 * Add a snapshot to the history. Only services with metrics get a point; a
 * repeated snapshot time is ignored, points older than the longest range are
 * dropped, and services absent from the snapshot (run closed) are forgotten.
 */
export function appendSnapshot(
  history: MetricHistory,
  snapshot: MonitoringSnapshot
): MetricHistory {
  const t = Date.parse(snapshot.collectedAt);
  if (Number.isNaN(t)) return history;
  const next: MetricHistory = {};
  for (const service of snapshot.services) {
    const previous = (history[service.key] ?? []).filter((p) => p.t > t - HISTORY_MAX_AGE_MS);
    const last = previous[previous.length - 1];
    if (!service.metricsAvailable || (last && last.t >= t)) {
      next[service.key] = previous;
      continue;
    }
    next[service.key] = [
      ...previous,
      { t, cpuMillicores: service.cpuMillicores, memoryBytes: service.memoryBytes },
    ];
  }
  return next;
}

/** Points within `rangeMs` of the newest point. */
export function pointsInRange(points: MetricPoint[], rangeMs: number): MetricPoint[] {
  const newest = points[points.length - 1];
  if (!newest) return [];
  return points.filter((p) => p.t >= newest.t - rangeMs);
}

export function rangeMs(range: TimeRange): number {
  return TIME_RANGES.find((r) => r.value === range)?.ms ?? HISTORY_MAX_AGE_MS;
}

export function filterServices(services: ServiceMetrics[], serviceKey: string): ServiceMetrics[] {
  return serviceKey === ALL ? services : services.filter((s) => s.key === serviceKey);
}

export function filterAlerts(
  alerts: FiredAlert[],
  filters: { serviceKey: string; severity: AlertSeverity | typeof ALL }
): FiredAlert[] {
  return alerts.filter(
    (a) =>
      (filters.serviceKey === ALL || a.serviceKey === filters.serviceKey) &&
      (filters.severity === ALL || a.severity === filters.severity)
  );
}

export function formatCpu(millicores: number): string {
  return millicores >= 1000
    ? `${(millicores / 1000).toFixed(2)} cores`
    : `${Math.round(millicores)}m`;
}

export function formatMemory(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(1)} MiB`;
}

export const METRIC_LABELS: Record<AlertMetric, string> = {
  cpu_millicores: 'CPU (millicores)',
  memory_mib: 'Memory (MiB)',
};

export const OPERATOR_LABELS: Record<AlertOperator, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

export const SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];

/** Alert value in the rule's own unit. */
export function formatAlertValue(metric: AlertMetric, value: number): string {
  return metric === 'cpu_millicores' ? `${Math.round(value)}m` : `${value} MiB`;
}
