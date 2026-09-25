/**
 * Execution report service (issue #26).
 *
 * Closes a scenario run with a durable report: at teardown (before the
 * namespace — and with it every pod log and event — is deleted) and when the
 * deploy itself fails. The report carries the outcome, timings, final
 * per-service/container status, derived key metrics and the capped tail of
 * the logs, namespace events and probe security alerts, and can be rendered
 * as JSON, Markdown or a self-contained HTML page.
 *
 * Log lines, events and alerts are attacker-controlled text (the scenarios
 * run attack tooling), so every renderer escapes everything it prints and
 * the HTML page carries no script. The report is built from an explicit
 * field whitelist — infrastructure documents (and their credentials) are
 * never an input.
 */

import type { Types } from 'mongoose';
import {
  collectNewNamespaceEvents,
  collectNewPodLogs,
  getDeploymentStatus,
  type DeploymentServiceStatus,
  type K8sClients,
  type NamespaceEventEntry,
  type PodLogLine,
} from './kubernetesDeploy.js';
import { parseSecurityAlert, type SecurityAlertEvent } from './scenarioSSE.js';
import {
  ExecutionReport,
  type ExecutionOutcome,
  type IReportAlert,
  type IReportCount,
  type IReportEvent,
  type IReportLogLine,
  type IReportMetrics,
  type IReportOmitted,
  type IReportServiceStatus,
  type IReportStatusCounts,
  type IReportTraffic,
  type ReportDeployStatus,
} from '../models/ExecutionReport.js';
import { logger } from '../utils/logger.js';
import { collectTraffic, type ApiGet } from './observability.js';

/** Most recent log lines kept in a report. */
export const MAX_LOG_LINES = 2000;
/** Most recent error-looking log lines kept in their own section. */
export const MAX_ERROR_LOG_LINES = 200;
/** Most recent namespace events kept in a report. */
export const MAX_EVENTS = 500;
/** Most recent security alerts kept in a report. */
export const MAX_ALERTS = 200;
/** Per-line / per-message cap, in UTF-8 bytes. */
export const MAX_TEXT_BYTES = 4096;
/** Cap for identifiers (service, pod, container, reason, verdict…), in UTF-8 bytes. */
export const MAX_NAME_BYTES = 256;
/** Entries kept in each `{ name, count }` breakdown. */
export const MAX_COUNT_ENTRIES = 20;
/** Hard ceiling on the cluster reads done while closing a run. */
export const CAPTURE_TIMEOUT_MS = 10_000;

/**
 * Aggregate byte budgets per artifact kind (~8MB in total), so a report stays
 * well under MongoDB's 16MB document limit however wide the lines are.
 */
export const ARTIFACT_BYTE_BUDGET = {
  logs: 5 * 1024 * 1024,
  errorLogs: 512 * 1024,
  events: 1536 * 1024,
  alerts: 1024 * 1024,
} as const;

/** Log lines that look like errors — counted and listed separately. */
const ERROR_LINE_RE =
  /\b(error|err|fatal|panic|exception|critical|fail|failed|failure|crash|crashed|traceback)\b/i;

const TRUNCATION_MARK = '… [truncated]';

/** Why a provisional report carries no captured artifacts. */
function provisionalNotice(status: string): string {
  return status === 'completed' || status === 'failed'
    ? 'no report was captured when this run closed; it is built from the execution record only'
    : 'this run has not been closed yet; no logs, events or alerts were captured';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal read-only view of the embedded execution a report is built from. */
export interface ReportExecutionView {
  _id?: Types.ObjectId | string;
  executedAt: Date | string;
  executedBy?: string;
  status: string;
  namespace?: string;
  deployedServices?: { name?: string; status?: string }[];
  conclusion?: { text?: string } | null;
  completedAt?: Date | string | null;
  durationMs?: number | null;
  outcome?: ExecutionOutcome | null;
  /** The namespace runs the observability stack (issue #25). */
  observability?: boolean | null;
}

/** Minimal read-only view of the owning scenario. */
export interface ReportScenarioView {
  _id: Types.ObjectId | string;
  title?: string;
}

/** Raw cluster artifacts gathered while closing a run. */
export interface CapturedArtifacts {
  /** Final workload statuses, or null when they could not be read. */
  services: DeploymentServiceStatus[] | null;
  /** Sum of container restart counts across the run's pods. */
  restarts: number;
  logs: PodLogLine[];
  events: NamespaceEventEntry[];
  /** Health/traffic per deployed component; undefined when not collected. */
  traffic?: IReportTraffic[];
  /** One entry per capture step that failed (or the timeout). */
  captureErrors: string[];
}

/** The report as served by the API (JSON) and fed to the renderers. */
export interface ExecutionReportData {
  scenarioId: string;
  executionId: string;
  scenarioTitle: string;
  executedBy: string;
  namespace?: string;
  /** Current status of the embedded execution. */
  status: string;
  outcome: ExecutionOutcome;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  services: IReportServiceStatus[];
  metrics: IReportMetrics;
  logs: IReportLogLine[];
  errorLogs: IReportLogLine[];
  events: IReportEvent[];
  alerts: IReportAlert[];
  /** Per-component health and traffic, when the run had the observability stack. */
  traffic?: IReportTraffic[];
  omitted: IReportOmitted;
  /** True when part of the capture failed — see `captureErrors`. */
  partial: boolean;
  captureErrors: string[];
  error?: string;
  conclusion?: string;
  /** True when no report was stored yet and this one was built on the fly. */
  provisional: boolean;
  generatedAt: Date;
}

/** Run-close stamps written onto the embedded execution. */
export interface RunCloseSummary {
  completedAt: Date;
  durationMs: number;
  outcome: ExecutionOutcome;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Cap a string at `maxBytes` UTF-8 bytes, marking the cut. */
export function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const room = Math.max(0, maxBytes - Buffer.byteLength(TRUNCATION_MARK, 'utf8'));
  // Slicing mid-sequence decodes to U+FFFD — drop that partial character.
  const cut = Buffer.from(text, 'utf8').subarray(0, room).toString('utf8').replace(/�$/, '');
  return cut + TRUNCATION_MARK;
}

function capName(value: string | undefined): string | undefined {
  return value === undefined ? undefined : truncateBytes(String(value), MAX_NAME_BYTES);
}

function errorMessage(err: unknown): string {
  return truncateBytes(err instanceof Error ? err.message : String(err), MAX_TEXT_BYTES);
}

/**
 * Keep the most recent entries of `items` within both a count and a byte
 * budget. `cap` shrinks each entry's fields first; the byte cost is measured
 * on the capped entry. Returns the kept entries in their original order plus
 * the number dropped.
 */
export function takeTail<T, U>(
  items: T[],
  maxCount: number,
  maxBytes: number,
  cap: (item: T) => U
): { kept: U[]; omitted: number } {
  const kept: U[] = [];
  let bytes = 0;
  for (let i = items.length - 1; i >= 0 && kept.length < maxCount; i--) {
    const capped = cap(items[i]);
    const size = Buffer.byteLength(JSON.stringify(capped), 'utf8');
    if (bytes + size > maxBytes) break;
    bytes += size;
    kept.push(capped);
  }
  kept.reverse();
  return { kept, omitted: items.length - kept.length };
}

function capLogLine(entry: PodLogLine): IReportLogLine {
  return {
    service: capName(entry.name) ?? '',
    pod: capName(entry.pod) ?? '',
    ...(entry.container ? { container: capName(entry.container) } : {}),
    line: truncateBytes(entry.line ?? '', MAX_TEXT_BYTES),
  };
}

function capEvent(entry: NamespaceEventEntry): IReportEvent {
  return {
    reason: capName(entry.reason),
    message: entry.message === undefined ? undefined : truncateBytes(entry.message, MAX_TEXT_BYTES),
    objectKind: capName(entry.objectKind),
    objectName: capName(entry.objectName),
    type: capName(entry.type),
    count: entry.count,
    timestamp: capName(entry.timestamp),
  };
}

function capAlert(alert: SecurityAlertEvent): IReportAlert {
  return {
    service: capName(alert.service) ?? '',
    pod: capName(alert.pod) ?? '',
    ...(alert.container ? { container: capName(alert.container) } : {}),
    timestamp: capName(alert.timestamp),
    verdict: capName(alert.verdict),
    attacker: capName(alert.attacker),
    line: truncateBytes(alert.line ?? '', MAX_TEXT_BYTES),
  };
}

const DEPLOY_STATUSES: ReportDeployStatus[] = ['pending', 'running', 'completed', 'failed'];

function toDeployStatus(value: string | undefined): ReportDeployStatus {
  return DEPLOY_STATUSES.includes(value as ReportDeployStatus)
    ? (value as ReportDeployStatus)
    : 'pending';
}

function statusCounts(statuses: ReportDeployStatus[]): IReportStatusCounts {
  const counts: IReportStatusCounts = { pending: 0, running: 0, completed: 0, failed: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

/** Count occurrences of each (capped) name, highest first, top N. */
export function topCounts(values: (string | undefined)[]): IReportCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    const name = truncateBytes(value, MAX_NAME_BYTES);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_COUNT_ENTRIES);
}

/** True when a log line reads like an error (error, fatal, panic, …). */
export function isErrorLine(line: string): boolean {
  return ERROR_LINE_RE.test(line);
}

/** Derive the report's key metrics from the full (uncapped) artifacts. */
export function deriveMetrics(input: {
  services: IReportServiceStatus[];
  restarts: number;
  logs: PodLogLine[];
  events: NamespaceEventEntry[];
  alerts: SecurityAlertEvent[];
}): IReportMetrics {
  const containers = input.services.flatMap((s) => s.containers);
  return {
    services: {
      total: input.services.length,
      byStatus: statusCounts(input.services.map((s) => s.status)),
    },
    containers: {
      total: containers.length,
      byStatus: statusCounts(containers.map((c) => c.status)),
      restarts: input.restarts,
    },
    logs: {
      lines: input.logs.length,
      errorLines: input.logs.filter((l) => isErrorLine(l.line ?? '')).length,
    },
    events: {
      total: input.events.length,
      warnings: input.events.filter((e) => e.type === 'Warning').length,
      byReason: topCounts(input.events.map((e) => e.reason)),
    },
    alerts: {
      total: input.alerts.length,
      uniqueAttackers: new Set(input.alerts.map((a) => a.attacker).filter(Boolean)).size,
      byVerdict: topCounts(input.alerts.map((a) => a.verdict)),
    },
  };
}

/**
 * Overall verdict of a run. A failed deploy, or any failed workload or
 * container, is `failed`; a run whose final state could not be fully
 * observed (no cluster snapshot, a capture error, never left `pending`, or
 * workloads still pending) is `partial`; otherwise `passed`.
 */
export function computeOutcome(input: {
  priorStatus: string;
  services: IReportServiceStatus[];
  captured: boolean;
  partial: boolean;
}): ExecutionOutcome {
  if (input.priorStatus === 'failed') return 'failed';
  if (
    input.services.some(
      (s) => s.status === 'failed' || s.containers.some((c) => c.status === 'failed')
    )
  ) {
    return 'failed';
  }
  if (
    !input.captured ||
    input.partial ||
    input.priorStatus === 'pending' ||
    input.services.length === 0 ||
    input.services.some((s) => s.status === 'pending')
  ) {
    return 'partial';
  }
  return 'passed';
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Dedupe service rows by name — sidecar rows share their host's name. */
function uniqueByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.name)) return false;
    seen.add(row.name);
    return true;
  });
}

/** Input to {@link buildReport}. */
export interface ReportInput {
  scenario: ReportScenarioView;
  execution: ReportExecutionView;
  /** When the run closed; undefined for a still-open run. */
  completedAt?: Date;
  /** Cluster snapshot, or null when none was (or could be) taken. */
  artifacts: CapturedArtifacts | null;
  /** Deploy error message carried by the run, if any. */
  error?: string;
  /** Force the verdict (e.g. `failed` on a deploy failure). */
  outcome?: ExecutionOutcome;
  provisional?: boolean;
}

/**
 * Build a report from an explicit whitelist of execution fields plus the
 * captured artifacts. Pure: no I/O. Caps every artifact by count and bytes;
 * metrics are derived from the full artifacts before capping.
 */
export function buildReport(input: ReportInput): ExecutionReportData {
  const { scenario, execution, artifacts } = input;
  const startedAt = toDate(execution.executedAt) ?? new Date(0);
  const completedAt = input.completedAt;

  const services: IReportServiceStatus[] = artifacts?.services
    ? uniqueByName(
        artifacts.services.map((s) => ({
          name: capName(s.name) ?? '',
          status: toDeployStatus(s.status),
          containers: s.containers.map((c) => ({
            name: capName(c.name) ?? '',
            status: toDeployStatus(c.status),
          })),
        }))
      )
    : uniqueByName(
        (execution.deployedServices ?? [])
          .filter((s): s is { name: string; status?: string } => Boolean(s.name))
          .map((s) => ({
            name: capName(s.name) ?? '',
            status: toDeployStatus(s.status),
            containers: [],
          }))
      );

  const rawLogs = artifacts?.logs ?? [];
  const rawEvents = artifacts?.events ?? [];
  const rawAlerts = rawLogs
    .map((entry) => parseSecurityAlert(entry))
    .filter((a): a is SecurityAlertEvent => a !== null);
  const rawErrorLogs = rawLogs.filter((l) => isErrorLine(l.line ?? ''));

  const logs = takeTail(rawLogs, MAX_LOG_LINES, ARTIFACT_BYTE_BUDGET.logs, capLogLine);
  const errorLogs = takeTail(
    rawErrorLogs,
    MAX_ERROR_LOG_LINES,
    ARTIFACT_BYTE_BUDGET.errorLogs,
    capLogLine
  );
  const events = takeTail(rawEvents, MAX_EVENTS, ARTIFACT_BYTE_BUDGET.events, capEvent);
  const alerts = takeTail(rawAlerts, MAX_ALERTS, ARTIFACT_BYTE_BUDGET.alerts, capAlert);

  const captureErrors = (artifacts?.captureErrors ?? []).map((e) =>
    truncateBytes(e, MAX_TEXT_BYTES)
  );
  const partial = captureErrors.length > 0;

  const outcome =
    input.outcome ??
    computeOutcome({
      priorStatus: execution.status,
      services,
      captured: artifacts !== null,
      partial,
    });

  const conclusion = execution.conclusion?.text;

  return {
    scenarioId: String(scenario._id),
    executionId: String(execution._id ?? ''),
    scenarioTitle: truncateBytes(scenario.title ?? '', MAX_TEXT_BYTES),
    executedBy: capName(execution.executedBy) ?? '',
    ...(execution.namespace ? { namespace: capName(execution.namespace) } : {}),
    status: execution.status,
    outcome,
    startedAt,
    ...(completedAt
      ? {
          completedAt,
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        }
      : {}),
    services,
    metrics: deriveMetrics({
      services,
      restarts: artifacts?.restarts ?? 0,
      logs: rawLogs,
      events: rawEvents,
      alerts: rawAlerts,
    }),
    logs: logs.kept,
    errorLogs: errorLogs.kept,
    events: events.kept,
    alerts: alerts.kept,
    ...(artifacts?.traffic
      ? {
          traffic: artifacts.traffic
            .slice(0, MAX_TRAFFIC_ROWS)
            .map((t) => ({ ...t, service: capName(t.service) ?? '' })),
        }
      : {}),
    omitted: {
      logs: logs.omitted,
      errorLogs: errorLogs.omitted,
      events: events.omitted,
      alerts: alerts.omitted,
    },
    partial,
    captureErrors,
    ...(input.error ? { error: truncateBytes(input.error, MAX_TEXT_BYTES) } : {}),
    ...(conclusion ? { conclusion: truncateBytes(conclusion, MAX_TEXT_BYTES) } : {}),
    provisional: input.provisional ?? false,
    generatedAt: new Date(),
  };
}

/** Provisional report for a run with no stored report — embedded fields only, no cluster reads. */
export function buildProvisionalReport(
  scenario: ReportScenarioView,
  execution: ReportExecutionView
): ExecutionReportData {
  return buildReport({
    scenario,
    execution,
    completedAt: toDate(execution.completedAt),
    artifacts: null,
    outcome: execution.outcome ?? undefined,
    provisional: true,
  });
}

/** Stored report document (lean) as read back from MongoDB. */
type StoredReport = Omit<
  ExecutionReportData,
  'scenarioId' | 'executionId' | 'status' | 'provisional' | 'generatedAt'
> & {
  scenarioId: unknown;
  executionId: unknown;
  updatedAt?: Date;
};

/**
 * Project a stored report onto the API shape (field whitelist). The live
 * execution supplies what can change after the run closed: its status and
 * the conclusion an analyst writes after reviewing the run.
 */
export function toReportData(
  stored: StoredReport,
  execution: { status: string; conclusion?: { text?: string } | null }
): ExecutionReportData {
  const conclusion = execution.conclusion?.text ?? stored.conclusion;
  return {
    scenarioId: String(stored.scenarioId),
    executionId: String(stored.executionId),
    scenarioTitle: stored.scenarioTitle ?? '',
    executedBy: stored.executedBy ?? '',
    ...(stored.namespace ? { namespace: stored.namespace } : {}),
    status: execution.status,
    outcome: stored.outcome,
    startedAt: stored.startedAt,
    completedAt: stored.completedAt,
    durationMs: stored.durationMs,
    services: stored.services ?? [],
    metrics: stored.metrics,
    logs: stored.logs ?? [],
    errorLogs: stored.errorLogs ?? [],
    events: stored.events ?? [],
    alerts: stored.alerts ?? [],
    ...(Array.isArray(stored.traffic) ? { traffic: stored.traffic } : {}),
    omitted: {
      logs: stored.omitted?.logs ?? 0,
      errorLogs: stored.omitted?.errorLogs ?? 0,
      events: stored.omitted?.events ?? 0,
      alerts: stored.omitted?.alerts ?? 0,
    },
    partial: Boolean(stored.partial),
    captureErrors: stored.captureErrors ?? [],
    ...(stored.error ? { error: stored.error } : {}),
    ...(conclusion ? { conclusion: truncateBytes(conclusion, MAX_TEXT_BYTES) } : {}),
    provisional: false,
    generatedAt: stored.updatedAt ?? stored.completedAt ?? stored.startedAt,
  };
}

// ---------------------------------------------------------------------------
// Cluster capture + persistence
// ---------------------------------------------------------------------------

/** Components kept in a report's health/traffic table. */
const MAX_TRAFFIC_ROWS = 100;

/**
 * PromQL range covering the run, at least one minute (so a short run still
 * spans a few 15 s probes) and at most the stack's one-day retention.
 */
export function runWindow(startedAt: Date | undefined, now: Date): string {
  const seconds = startedAt ? Math.ceil((now.getTime() - startedAt.getTime()) / 1000) : 0;
  return `${Math.min(86_400, Math.max(60, seconds))}s`;
}

/**
 * Read the run's final cluster state: workload statuses, container restarts,
 * the full pod logs and the namespace events (fresh `seen` state, so every
 * line/event still retained by the cluster is returned). Each step fails
 * independently into `captureErrors`; the whole read is bounded by
 * `timeoutMs`, returning whatever was gathered so far on expiry.
 */
export async function collectArtifacts(
  clients: K8sClients,
  opts: {
    namespace: string;
    names: string[];
    /** Read the observability stack over `window` (e.g. the run's length). */
    traffic?: { get: ApiGet; window: string };
  },
  timeoutMs: number = CAPTURE_TIMEOUT_MS
): Promise<CapturedArtifacts> {
  const acc: CapturedArtifacts = {
    services: null,
    restarts: 0,
    logs: [],
    events: [],
    captureErrors: [],
  };
  const namespace = opts.namespace;
  const names = [...new Set(opts.names.filter(Boolean))];

  const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      acc.captureErrors.push(`${label}: ${errorMessage(err)}`);
    }
  };

  const collect = async (): Promise<void> => {
    // Nothing deployed (e.g. a failed deploy): an empty `app in ()` selector
    // is invalid, so only the namespace events are worth reading.
    if (names.length) {
      await step('status', async () => {
        const { statuses } = await getDeploymentStatus(clients, { namespace, names });
        acc.services = statuses;
      });
      await step('restarts', async () => {
        const pods = await clients.core.listNamespacedPod({
          namespace,
          labelSelector: `app in (${names.join(',')})`,
        });
        acc.restarts = (pods.items ?? []).reduce(
          (sum, pod) =>
            sum +
            (pod.status?.containerStatuses ?? []).reduce((n, cs) => n + (cs.restartCount ?? 0), 0),
          0
        );
      });
      await step('logs', async () => {
        acc.logs = await collectNewPodLogs(clients, { namespace, names, seen: new Map() });
      });
    }
    await step('events', async () => {
      acc.events = await collectNewNamespaceEvents(clients, { namespace, seen: new Set() });
    });
  };

  // Runs alongside the cluster reads; only deployed components are kept —
  // span-derived series carry a pushed, untrusted service name.
  const collectObservability = async (): Promise<void> => {
    const traffic = opts.traffic;
    if (!traffic) return;
    await step('observability', async () => {
      const byService = await collectTraffic(traffic.get, namespace, {
        window: traffic.window,
        timeoutMs: Math.max(1000, Math.floor(timeoutMs / 2)),
      });
      acc.traffic = names
        .filter((name) => byService.has(name))
        .map((name) => ({ service: name, ...byService.get(name) }));
    });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    await Promise.race([
      Promise.all([collect(), collectObservability()]),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Snapshot so a capture still running past the deadline cannot mutate it.
  const result: CapturedArtifacts = {
    services: acc.services,
    restarts: acc.restarts,
    logs: [...acc.logs],
    events: [...acc.events],
    ...(acc.traffic ? { traffic: [...acc.traffic] } : {}),
    captureErrors: [...acc.captureErrors],
  };
  if (timedOut) result.captureErrors.push(`capture timed out after ${timeoutMs}ms`);
  return result;
}

function storedFields(report: ExecutionReportData): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status, provisional, generatedAt, ...fields } = report;
  return {
    ...fields,
    completedAt: report.completedAt ?? report.generatedAt,
    durationMs: report.durationMs ?? 0,
  };
}

/**
 * Upsert the report. If the full write fails (e.g. a document-size or
 * validation error), retry once without the artifact arrays so a report —
 * flagged partial — always lands.
 */
async function persistReport(report: ExecutionReportData): Promise<void> {
  const filter = { scenarioId: report.scenarioId, executionId: report.executionId };
  const fields = storedFields(report);
  try {
    await ExecutionReport.findOneAndUpdate(filter, { $set: fields }, { upsert: true });
  } catch (err) {
    logger.warn('Execution report write failed; retrying without artifacts', {
      executionId: report.executionId,
      error: errorMessage(err),
    });
    await ExecutionReport.findOneAndUpdate(
      filter,
      {
        $set: {
          ...fields,
          logs: [],
          errorLogs: [],
          events: [],
          alerts: [],
          omitted: {
            logs: report.omitted.logs + report.logs.length,
            errorLogs: report.omitted.errorLogs + report.errorLogs.length,
            events: report.omitted.events + report.events.length,
            alerts: report.omitted.alerts + report.alerts.length,
          },
          partial: true,
          captureErrors: [
            ...report.captureErrors,
            `report artifacts dropped: ${errorMessage(err)}`,
          ],
        },
      },
      { upsert: true }
    );
  }
}

/**
 * Close a run at teardown: snapshot the cluster (when something was
 * deployed), build and store the report, and return the stamps for the
 * embedded execution. Never throws — a capture or storage failure yields a
 * partial report (or none) but the teardown must still proceed.
 *
 * A run that is already closed keeps its existing report and stamps; a run
 * that failed at deploy keeps its original error, outcome and close time.
 */
export async function captureReport(opts: {
  clients: K8sClients | null;
  scenario: ReportScenarioView;
  execution: ReportExecutionView;
  timeoutMs?: number;
  /** API-server reader for the execution's observability stack, if it has one. */
  observabilityGet?: ApiGet;
}): Promise<RunCloseSummary> {
  const { clients, scenario, execution } = opts;
  const executionId = String(execution._id ?? '');
  const now = new Date();
  const fallback = (): RunCloseSummary => {
    const completedAt = toDate(execution.completedAt) ?? now;
    const startedAt = toDate(execution.executedAt) ?? completedAt;
    return {
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      outcome: execution.outcome ?? (execution.status === 'failed' ? 'failed' : 'partial'),
    };
  };

  try {
    const existing = await ExecutionReport.findOne({
      scenarioId: String(scenario._id),
      executionId,
    }).lean();

    if (existing && execution.status === 'completed') {
      return {
        completedAt: existing.completedAt,
        durationMs: existing.durationMs,
        outcome: existing.outcome,
      };
    }

    const artifacts =
      clients && execution.namespace
        ? await collectArtifacts(
            clients,
            {
              namespace: execution.namespace,
              names: (execution.deployedServices ?? [])
                .map((s) => s.name)
                .filter((n): n is string => Boolean(n)),
              ...(execution.observability && opts.observabilityGet
                ? {
                    traffic: {
                      get: opts.observabilityGet,
                      window: runWindow(toDate(execution.executedAt), now),
                    },
                  }
                : {}),
            },
            opts.timeoutMs
          )
        : null;

    const report = buildReport({
      scenario,
      execution,
      completedAt: toDate(execution.completedAt) ?? now,
      artifacts,
      error: existing?.error,
    });

    try {
      await persistReport(report);
    } catch (err) {
      logger.error('Execution report could not be stored', {
        executionId,
        error: errorMessage(err),
      });
    }

    return {
      completedAt: report.completedAt ?? now,
      durationMs: report.durationMs ?? 0,
      outcome: report.outcome,
    };
  } catch (err) {
    logger.error('Execution report capture failed', { executionId, error: errorMessage(err) });
    return fallback();
  }
}

/**
 * Store the report of a run whose deploy failed (outcome `failed`, carrying
 * the truncated deploy error). Best-effort: never throws, so it can never
 * mask the original deploy error.
 */
export async function recordDeployFailure(opts: {
  scenario: ReportScenarioView;
  execution: ReportExecutionView;
  completedAt: Date;
  error: unknown;
}): Promise<void> {
  try {
    const report = buildReport({
      scenario: opts.scenario,
      execution: { ...opts.execution, status: 'failed' },
      completedAt: opts.completedAt,
      artifacts: null,
      error: errorMessage(opts.error),
      outcome: 'failed',
    });
    await persistReport(report);
  } catch (err) {
    logger.error('Deploy-failure report could not be stored', {
      executionId: String(opts.execution._id ?? ''),
      error: errorMessage(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/** Human-readable duration: `850 ms`, `42s`, `3m 05s`, `1h 02m 03s`. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

function iso(date: Date | string | undefined): string {
  const d = toDate(date);
  return d ? d.toISOString() : '—';
}

// Control characters other than tab/newline never belong in a report.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Escape untrusted text for inline Markdown (table cells, list items):
 * newlines/tabs collapse to spaces, control characters are dropped and every
 * character that can open markup, a table column, raw HTML or an entity is
 * backslash-escaped.
 */
export function escapeMarkdown(text: string | number | undefined | null): string {
  if (text === undefined || text === null || text === '') return '—';
  return String(text)
    .replace(CONTROL_RE, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\`*_[\]|<>~&]/g, '\\$&');
}

/**
 * Wrap untrusted text in a fenced code block whose fence is longer than the
 * longest backtick run in the content, so the content can never close it.
 */
export function markdownCodeBlock(content: string): string {
  const clean = content.replace(CONTROL_RE, '').replace(/\r/g, '');
  const longest = Math.max(0, ...(clean.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${clean}\n${fence}`;
}

/** Escape untrusted text for HTML element content and attribute values. */
export function escapeHtml(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(CONTROL_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logPrefix(entry: IReportLogLine): string {
  return `[${entry.service}${entry.container ? `/${entry.container}` : ''}]`;
}

function statusSummary(counts: IReportStatusCounts): string {
  return DEPLOY_STATUSES.map((s) => `${s} ${counts[s]}`).join(', ');
}

function mdTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/** Auto-generated run conclusion: a one-line verdict plus supporting findings. */
export interface ReportConclusion {
  verdict: string;
  findings: string[];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Derive the report's conclusion from its outcome and metrics, so every
 * report ends with an assessment even when no analyst wrote one. Built from
 * counts and capped identifiers only; renderers escape it like any other text.
 */
export function summarizeReport(report: ExecutionReportData): ReportConclusion {
  const m = report.metrics;
  const failedServices = report.services.filter(
    (s) => s.status === 'failed' || s.containers.some((c) => c.status === 'failed')
  );

  let verdict: string;
  if (report.outcome === 'failed') {
    verdict = report.error
      ? 'The run failed during deployment; the scenario did not execute.'
      : `The run failed: ${plural(failedServices.length, 'service')} ended in a failed state.`;
  } else if (report.outcome === 'partial') {
    verdict = report.provisional
      ? 'The run has no captured artifacts yet; this assessment is based on the execution record only.'
      : 'The run finished, but its final state could not be fully observed.';
  } else {
    verdict =
      m.services.total === 1
        ? 'The run passed: the deployed service reached a healthy state.'
        : `The run passed: all ${m.services.total} services reached a healthy state.`;
  }

  const findings: string[] = [];
  if (m.alerts.total) {
    const top = m.alerts.byVerdict[0];
    findings.push(
      `Detection: the monitor raised ${plural(m.alerts.total, 'security alert')} from ${plural(
        m.alerts.uniqueAttackers,
        'distinct attacker'
      )}${top ? `; most frequent verdict "${top.name}" (${top.count})` : ''}.`
    );
  } else if (!report.provisional) {
    findings.push(
      'Detection: no security alerts were raised. If an attack was run, the monitor did not detect it.'
    );
  }
  if (failedServices.length && report.outcome !== 'failed') {
    findings.push(`Services: ${failedServices.map((s) => s.name).join(', ')} failed.`);
  } else if (failedServices.length) {
    findings.push(`Failed services: ${failedServices.map((s) => s.name).join(', ')}.`);
  }
  if (m.containers.restarts) {
    findings.push(
      `Resilience: containers restarted ${plural(m.containers.restarts, 'time')} during the run${
        report.outcome === 'passed' ? ' and every service recovered' : ''
      }.`
    );
  }
  if (m.events.warnings) {
    findings.push(`Cluster: ${plural(m.events.warnings, 'Kubernetes warning event')} recorded.`);
  }
  if (m.logs.errorLines) {
    findings.push(
      `Logs: ${plural(m.logs.errorLines, 'error-looking line')} out of ${m.logs.lines}.`
    );
  }
  if (report.partial) {
    findings.push(
      `Capture: ${plural(report.captureErrors.length, 'capture step')} failed; figures may be incomplete.`
    );
  }
  if (!findings.length)
    findings.push('No alerts, restarts, warnings or error lines were recorded.');
  return { verdict, findings };
}

/** Render the report as GitHub-flavored Markdown; all untrusted text escaped. */
const TRAFFIC_HEADERS = [
  'Component',
  'Probe',
  'Availability',
  'Probe latency',
  'Requests/s',
  'Errors',
  'p95 latency',
];

/** Plain-text cells of the component health table (escaped by each renderer). */
function trafficRows(traffic: IReportTraffic[]): string[][] {
  const pct = (v?: number) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const ms = (v?: number) => (v === undefined ? '—' : `${Math.round(v)} ms`);
  return traffic.map((t) => [
    t.service,
    t.probe
      ? `${t.probe.toUpperCase()}${t.up === undefined ? '' : t.up ? ' · up' : ' · down'}`
      : '—',
    pct(t.availability),
    ms(t.probeLatencyMs),
    t.requestRate === undefined ? '—' : t.requestRate.toFixed(2),
    pct(t.errorRate),
    ms(t.latencyP95Ms),
  ]);
}

export function renderMarkdown(report: ExecutionReportData): string {
  const m = report.metrics;
  const out: string[] = [];

  out.push(`# Execution report: ${escapeMarkdown(report.scenarioTitle)}`);
  out.push('');
  if (report.provisional) {
    out.push(`> **Provisional report** — ${provisionalNotice(report.status)}.`);
    out.push('');
  }
  if (report.partial) {
    out.push('> **Partial report** — some artifacts could not be captured (see Capture errors).');
    out.push('');
  }

  out.push('## Summary', '');
  out.push(
    mdTable(
      ['Field', 'Value'],
      [
        ['Outcome', `**${report.outcome.toUpperCase()}**`],
        ['Status', escapeMarkdown(report.status)],
        ['Scenario', escapeMarkdown(report.scenarioTitle)],
        ['Execution', escapeMarkdown(report.executionId)],
        ['Executed by', escapeMarkdown(report.executedBy)],
        ['Namespace', escapeMarkdown(report.namespace)],
        ['Started', iso(report.startedAt)],
        ['Completed', iso(report.completedAt)],
        ['Duration', formatDuration(report.durationMs)],
        ['Generated', iso(report.generatedAt)],
      ]
    )
  );
  out.push('');

  if (report.error) {
    out.push('## Error', '', markdownCodeBlock(report.error), '');
  }

  const conclusion = summarizeReport(report);
  out.push('## Conclusion', '', `**${escapeMarkdown(conclusion.verdict)}**`, '');
  for (const finding of conclusion.findings) out.push(`- ${escapeMarkdown(finding)}`);
  out.push('');
  if (report.conclusion) {
    out.push('### Analyst note', '', markdownCodeBlock(report.conclusion), '');
  }

  out.push('## Key metrics', '');
  out.push(`- Services: ${m.services.total} (${statusSummary(m.services.byStatus)})`);
  out.push(
    `- Containers: ${m.containers.total} (${statusSummary(m.containers.byStatus)}); restarts ${m.containers.restarts}`
  );
  out.push(`- Log lines: ${m.logs.lines} (${m.logs.errorLines} error lines)`);
  out.push(`- Kubernetes events: ${m.events.total} (${m.events.warnings} warnings)`);
  out.push(`- Security alerts: ${m.alerts.total} (${m.alerts.uniqueAttackers} unique attackers)`);
  out.push('');
  if (m.alerts.byVerdict.length) {
    out.push('### Alerts by verdict', '');
    out.push(
      mdTable(
        ['Verdict', 'Count'],
        m.alerts.byVerdict.map((c) => [escapeMarkdown(c.name), String(c.count)])
      )
    );
    out.push('');
  }
  if (m.events.byReason.length) {
    out.push('### Events by reason', '');
    out.push(
      mdTable(
        ['Reason', 'Count'],
        m.events.byReason.map((c) => [escapeMarkdown(c.name), String(c.count)])
      )
    );
    out.push('');
  }

  out.push('## Services', '');
  if (report.services.length) {
    out.push(
      mdTable(
        ['Service', 'Status', 'Containers'],
        report.services.map((s) => [
          escapeMarkdown(s.name),
          escapeMarkdown(s.status),
          s.containers.length
            ? s.containers
                .map((c) => `${escapeMarkdown(c.name)}: ${escapeMarkdown(c.status)}`)
                .join(', ')
            : '—',
        ])
      )
    );
  } else {
    out.push('_No services were deployed._');
  }
  out.push('');

  if (report.traffic) {
    out.push('## Component health', '');
    out.push(
      '_Probed by the OpenTelemetry Collector deployed with the run; request metrics only for components that expose Prometheus metrics or send OpenTelemetry traces._',
      ''
    );
    out.push(
      report.traffic.length
        ? mdTable(
            TRAFFIC_HEADERS,
            trafficRows(report.traffic).map((row) => row.map((c) => escapeMarkdown(c)))
          )
        : '_The observability stack returned no readings._'
    );
    out.push('');
  }

  out.push('## Security alerts', '');
  if (report.alerts.length) {
    if (report.omitted.alerts) out.push(`_${report.omitted.alerts} earlier alerts omitted._`, '');
    out.push(
      mdTable(
        ['Time', 'Service', 'Container', 'Verdict', 'Attacker'],
        report.alerts.map((a) => [
          escapeMarkdown(a.timestamp),
          escapeMarkdown(a.service),
          escapeMarkdown(a.container),
          escapeMarkdown(a.verdict),
          escapeMarkdown(a.attacker),
        ])
      )
    );
  } else {
    out.push('_No security alerts._');
  }
  out.push('');

  out.push('## Kubernetes events', '');
  if (report.events.length) {
    if (report.omitted.events) out.push(`_${report.omitted.events} earlier events omitted._`, '');
    out.push(
      mdTable(
        ['Time', 'Type', 'Reason', 'Object', 'Message'],
        report.events.map((e) => [
          escapeMarkdown(e.timestamp),
          escapeMarkdown(e.type),
          escapeMarkdown(e.reason),
          escapeMarkdown([e.objectKind, e.objectName].filter(Boolean).join('/')),
          escapeMarkdown(e.message),
        ])
      )
    );
  } else {
    out.push('_No events captured._');
  }
  out.push('');

  out.push('## Error log lines', '');
  if (report.errorLogs.length) {
    if (report.omitted.errorLogs) {
      out.push(`_${report.omitted.errorLogs} earlier error lines omitted._`, '');
    }
    out.push(
      markdownCodeBlock(report.errorLogs.map((l) => `${logPrefix(l)} ${l.line}`).join('\n'))
    );
  } else {
    out.push('_No error lines._');
  }
  out.push('');

  out.push('## Logs', '');
  if (report.logs.length) {
    if (report.omitted.logs) out.push(`_${report.omitted.logs} earlier log lines omitted._`, '');
    out.push(markdownCodeBlock(report.logs.map((l) => `${logPrefix(l)} ${l.line}`).join('\n')));
  } else {
    out.push('_No logs captured._');
  }
  out.push('');

  if (report.captureErrors.length) {
    out.push('## Capture errors', '');
    for (const err of report.captureErrors) out.push(`- ${escapeMarkdown(err)}`);
    out.push('');
  }

  return out.join('\n');
}

/**
 * Dark "SOC console" theme for the standalone HTML report. System font
 * stacks only (the page must render offline and carries no script); a
 * light, ink-friendly variant takes over for print.
 */
const HTML_STYLE = `
:root {
  --bg: #07090b; --panel: #0c1013; --panel-2: #10161a; --line: #1b2329; --line-2: #26313a;
  --text: #e4ebef; --muted: #8a979f; --faint: #5b6770;
  --green: #22c55e; --red: #ef4444; --amber: #f59e0b; --blue: #3b82f6;
  --mono: 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
  --sans: 'IBM Plex Sans', 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--bg); }
body {
  margin: 0; color: var(--text); font: 14px/1.55 var(--sans);
  background:
    linear-gradient(rgba(34,197,94,.035) 1px, transparent 1px) 0 0 / 100% 28px,
    radial-gradient(1200px 500px at 85% -10%, rgba(34,197,94,.07), transparent 60%),
    var(--bg);
  -webkit-font-smoothing: antialiased;
}
.sheet { max-width: 1120px; margin: 0 auto; padding: 40px 32px 64px; }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); }

/* Masthead */
.bar { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  font: 600 11px/1 var(--mono); letter-spacing: .18em; text-transform: uppercase; color: var(--muted);
  border-left: 3px solid var(--green); padding: 6px 0 6px 12px; }
.bar b { color: var(--green); font-weight: 600; }
.masthead { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end;
  margin: 28px 0 24px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.eyebrow { font: 500 12px/1 var(--mono); color: var(--faint); letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 10px 0 0; font: 600 34px/1.15 var(--sans); letter-spacing: -.02em; word-break: break-word; }
.verdict { text-align: right; }
.verdict .label { font: 500 11px/1 var(--mono); letter-spacing: .16em; color: var(--faint); text-transform: uppercase; }
.outcome { display: inline-flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 16px;
  border: 1px solid currentColor; border-radius: 4px; font: 700 18px/1 var(--mono); letter-spacing: .14em; }
.outcome::before { content: ''; width: 9px; height: 9px; border-radius: 50%; background: currentColor;
  box-shadow: 0 0 12px currentColor; }
.outcome-passed { color: var(--green); }
.outcome-failed { color: var(--red); }
.outcome-partial { color: var(--amber); }

/* Metadata */
.meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px;
  background: var(--line); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin-bottom: 28px; }
.meta div { background: var(--panel); padding: 12px 14px; min-width: 0; }
.meta dt { font: 500 10px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
.meta dd { margin: 6px 0 0; font: 13px/1.35 var(--mono); word-break: break-all; }

/* Notices */
.note { border: 1px solid var(--line-2); border-left: 3px solid var(--amber); background: var(--panel);
  padding: 10px 14px; border-radius: 4px; margin: 0 0 16px; color: var(--text); }
.note strong { color: var(--amber); }

/* Conclusion */
.conclusion { position: relative; background: linear-gradient(180deg, var(--panel-2), var(--panel));
  border: 1px solid var(--line-2); border-left: 3px solid var(--green); border-radius: 6px;
  padding: 22px 24px; margin-bottom: 28px; box-shadow: 0 20px 40px -24px rgba(0,0,0,.8); }
.tag { font: 600 11px/1 var(--mono); letter-spacing: .2em; color: var(--green); text-transform: uppercase; }
.conclusion .lead { margin: 12px 0 14px; font-size: 17px; line-height: 1.5; font-weight: 500; }
.conclusion ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.conclusion li { padding-left: 22px; position: relative; color: #c7d1d6; }
.conclusion li::before { content: '›'; position: absolute; left: 4px; color: var(--green); font-family: var(--mono); font-weight: 700; }
.analyst { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--line-2); }
.analyst p { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; }

/* KPI strip */
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 36px; }
.kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; }
.kpi .v { font: 600 28px/1 var(--mono); letter-spacing: -.02em; }
.kpi .k { margin-top: 8px; font: 500 10px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
.kpi .s { margin-top: 6px; font-size: 12px; color: var(--muted); }
.kpi.hot .v { color: var(--red); } .kpi.warm .v { color: var(--amber); } .kpi.ok .v { color: var(--green); }

/* Sections */
section { margin-top: 36px; }
h2 { display: flex; align-items: baseline; gap: 14px; margin: 0 0 14px; padding-bottom: 10px;
  border-bottom: 1px solid var(--line); font: 600 13px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase; }
h2 .n { color: var(--green); }
h2 .c { margin-left: auto; color: var(--faint); font-weight: 500; letter-spacing: .08em; }
h3 { margin: 20px 0 8px; font: 500 11px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }

/* Tables */
.tw { border: 1px solid var(--line); border-radius: 6px; overflow-x: auto; background: var(--panel); }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
th { text-align: left; font: 500 10px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase;
  color: var(--faint); background: var(--panel-2); padding: 10px 12px; border-bottom: 1px solid var(--line); }
td { padding: 9px 12px; border-top: 1px solid var(--line); vertical-align: top; word-break: break-word; font-family: var(--mono); }
tbody tr:first-child td { border-top: 0; }
tbody tr:nth-child(even) td { background: rgba(255,255,255,.015); }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.st { font-weight: 600; white-space: nowrap; }
.st::before { content: '●'; margin-right: 6px; font-size: 9px; vertical-align: 1px; }
.st-completed, .st-running, .st-Normal { color: var(--green); }
.st-failed { color: var(--red); } .st-pending, .st-Warning { color: var(--amber); }
.atk { color: var(--red); }

/* Logs */
pre { margin: 0; background: #050607; color: #b9c6cc; border: 1px solid var(--line); border-radius: 6px;
  padding: 14px 16px; font: 11.5px/1.6 var(--mono); overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 560px; }
pre.err { color: #f3b3b3; border-left: 3px solid var(--red); }
.empty { color: var(--faint); font: 12px var(--mono); padding: 14px 0; }
.empty::before { content: '— '; }
ul.errs { margin: 0; padding-left: 18px; color: var(--amber); font: 12px/1.6 var(--mono); }

footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); display: flex;
  justify-content: space-between; gap: 16px; flex-wrap: wrap; font: 11px/1.4 var(--mono); color: var(--faint); letter-spacing: .06em; }

@media (max-width: 640px) {
  .sheet { padding: 24px 16px 48px; }
  .masthead { grid-template-columns: 1fr; }
  .verdict { text-align: left; }
  .meta, .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  h1 { overflow-wrap: anywhere; }
  h1 { font-size: 26px; }
}

/* Print: ink-friendly light variant of the same layout. */
@media print {
  :root { --bg: #fff; --panel: #fff; --panel-2: #f5f7f8; --line: #d9dee2; --line-2: #c6cdd2;
    --text: #0b0f12; --muted: #4b5563; --faint: #6b7280; --green: #15803d; --red: #b91c1c; --amber: #b45309; }
  html, body { background: #fff; }
  .sheet { max-width: none; padding: 0; }
  .conclusion, .kpi, .tw, pre { box-shadow: none; break-inside: avoid; }
  .outcome::before { box-shadow: none; }
  pre { background: #f7f8f9; color: #111; max-height: none; }
  pre.err { color: #7f1d1d; }
  .conclusion li { color: var(--text); }
  tbody tr:nth-child(even) td { background: #fafbfb; }
  section { break-inside: auto; } h2 { break-after: avoid; }
  @page { size: A4; margin: 16mm 14mm; }
}
`;

/** A table cell: plain (escaped) text, or pre-escaped markup. */
type HtmlCell = string | number | undefined | { html: string };

function cellHtml(cell: HtmlCell): string {
  if (cell !== null && typeof cell === 'object') return cell.html;
  return escapeHtml(cell === undefined || cell === '' ? '—' : cell);
}

function htmlTable(headers: string[], rows: HtmlCell[][], numeric: number[] = []): string {
  const head = headers
    .map(
      (h, i) =>
        `<th scope="col"${numeric.includes(i) ? ' style="text-align:right"' : ''}>${escapeHtml(h)}</th>`
    )
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${cellHtml(cell)}</td>`
          )
          .join('')}</tr>`
    )
    .join('\n');
  return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

/** Status text with a colored marker; the class is derived from a fixed allowlist. */
function htmlStatus(status: string | undefined): { html: string } {
  const known = ['completed', 'running', 'pending', 'failed', 'Normal', 'Warning'];
  const cls = status && known.includes(status) ? ` st-${status}` : '';
  return { html: `<span class="st${cls}">${escapeHtml(status || '—')}</span>` };
}

function htmlLogBlock(lines: IReportLogLine[], cls = ''): string {
  return `<pre${cls ? ` class="${cls}"` : ''}>${escapeHtml(
    lines.map((l) => `${logPrefix(l)} ${l.line}`).join('\n')
  )}</pre>`;
}

function htmlOmitted(count: number, what: string): string {
  return count ? `<p class="muted mono">${count} earlier ${escapeHtml(what)} omitted.</p>` : '';
}

function htmlEmpty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

function htmlKpi(value: number | string, label: string, sub: string, tone = ''): string {
  return `<div class="kpi${tone ? ` ${tone}` : ''}"><div class="v">${escapeHtml(value)}</div><div class="k">${escapeHtml(label)}</div><div class="s">${escapeHtml(sub)}</div></div>`;
}

/**
 * Render the report as a standalone HTML page. Every interpolated value is
 * HTML-escaped; styling is an inline `<style>` block and the page contains
 * no script.
 */
export function renderHtml(report: ExecutionReportData): string {
  const m = report.metrics;
  const outcome = ['passed', 'failed', 'partial'].includes(report.outcome)
    ? report.outcome
    : 'partial';
  const conclusion = summarizeReport(report);
  const parts: string[] = [];
  let sectionNo = 0;
  const section = (title: string, body: string, count?: number | string): void => {
    sectionNo += 1;
    parts.push(
      `<section><h2><span class="n">${String(sectionNo).padStart(2, '0')}</span>${escapeHtml(title)}${
        count === undefined ? '' : `<span class="c">${escapeHtml(count)}</span>`
      }</h2>${body}</section>`
    );
  };

  parts.push(
    `<div class="bar"><span><b>▌ SecSim</b> // Execution report</span><span>${escapeHtml(
      `Exec ${report.executionId || '—'}`
    )}</span></div>`
  );
  parts.push(
    `<header class="masthead"><div><div class="eyebrow">Scenario run · ${escapeHtml(
      iso(report.startedAt)
    )}</div><h1>${escapeHtml(report.scenarioTitle || 'Untitled scenario')}</h1></div>` +
      `<div class="verdict"><div class="label">Outcome</div><div class="outcome outcome-${outcome}">${escapeHtml(
        outcome.toUpperCase()
      )}</div></div></header>`
  );

  if (report.provisional) {
    parts.push(
      `<p class="note"><strong>Provisional report</strong> — ${escapeHtml(provisionalNotice(report.status))}.</p>`
    );
  }
  if (report.partial) {
    parts.push(
      '<p class="note"><strong>Partial report</strong> — some artifacts could not be captured (see Capture errors).</p>'
    );
  }

  const meta: [string, string | undefined][] = [
    ['Status', report.status],
    ['Executed by', report.executedBy],
    ['Namespace', report.namespace],
    ['Duration', formatDuration(report.durationMs)],
    ['Started', iso(report.startedAt)],
    ['Completed', iso(report.completedAt)],
    ['Scenario ID', report.scenarioId],
    ['Generated', iso(report.generatedAt)],
  ];
  parts.push(
    `<dl class="meta">${meta
      .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`)
      .join('')}</dl>`
  );

  parts.push(
    `<section class="conclusion" aria-labelledby="concl"><div class="tag" id="concl">[ Conclusion ]</div>` +
      `<p class="lead">${escapeHtml(conclusion.verdict)}</p>` +
      `<ul>${conclusion.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` +
      (report.conclusion
        ? `<div class="analyst"><div class="tag">Analyst note</div><p>${escapeHtml(report.conclusion)}</p></div>`
        : '') +
      '</section>'
  );

  const failedServices = m.services.byStatus.failed;
  parts.push(
    `<div class="kpis">${[
      htmlKpi(
        m.services.total,
        'Services',
        `${m.services.byStatus.completed + m.services.byStatus.running} healthy · ${failedServices} failed`,
        failedServices ? 'hot' : ''
      ),
      htmlKpi(
        m.alerts.total,
        'Security alerts',
        `${m.alerts.uniqueAttackers} unique attacker(s)`,
        m.alerts.total ? 'hot' : ''
      ),
      htmlKpi(
        m.containers.restarts,
        'Restarts',
        `${m.containers.total} container(s)`,
        m.containers.restarts ? 'warm' : ''
      ),
      htmlKpi(
        m.events.total,
        'K8s events',
        `${m.events.warnings} warning(s)`,
        m.events.warnings ? 'warm' : ''
      ),
      htmlKpi(
        m.logs.errorLines,
        'Error lines',
        `of ${m.logs.lines} log lines`,
        m.logs.errorLines ? 'warm' : ''
      ),
    ].join('')}</div>`
  );

  if (report.error) {
    section('Deploy error', `<pre class="err">${escapeHtml(report.error)}</pre>`);
  }

  section(
    'Security alerts',
    report.alerts.length
      ? (m.alerts.byVerdict.length
          ? `<h3>By verdict</h3>${htmlTable(
              ['Verdict', 'Count'],
              m.alerts.byVerdict.map((c) => [c.name, c.count]),
              [1]
            )}<h3>Timeline</h3>`
          : '') +
          htmlOmitted(report.omitted.alerts, 'alerts') +
          htmlTable(
            ['Time', 'Service', 'Container', 'Verdict', 'Attacker'],
            report.alerts.map((a) => [
              a.timestamp,
              a.service,
              a.container,
              a.verdict,
              { html: `<span class="atk">${escapeHtml(a.attacker || '—')}</span>` },
            ])
          )
      : htmlEmpty('No security alerts.'),
    m.alerts.total
  );

  section(
    'Services',
    report.services.length
      ? htmlTable(
          ['Service', 'Status', 'Containers'],
          report.services.map((s) => [
            s.name,
            htmlStatus(s.status),
            s.containers.length
              ? {
                  html: s.containers
                    .map((c) => `${escapeHtml(c.name)} ${htmlStatus(c.status).html}`)
                    .join('<br>'),
                }
              : undefined,
          ])
        )
      : htmlEmpty('No services were deployed.'),
    m.services.total
  );

  if (report.traffic) {
    section(
      'Component health',
      report.traffic.length
        ? htmlTable(TRAFFIC_HEADERS, trafficRows(report.traffic), [2, 3, 4, 5, 6])
        : htmlEmpty('The observability stack returned no readings.'),
      report.traffic.length
    );
  }

  section(
    'Kubernetes events',
    report.events.length
      ? (m.events.byReason.length
          ? `<h3>By reason</h3>${htmlTable(
              ['Reason', 'Count'],
              m.events.byReason.map((c) => [c.name, c.count]),
              [1]
            )}<h3>Timeline</h3>`
          : '') +
          htmlOmitted(report.omitted.events, 'events') +
          htmlTable(
            ['Time', 'Type', 'Reason', 'Object', 'Message'],
            report.events.map((e) => [
              e.timestamp,
              htmlStatus(e.type),
              e.reason,
              [e.objectKind, e.objectName].filter(Boolean).join('/') || undefined,
              e.message,
            ])
          )
      : htmlEmpty('No events captured.'),
    m.events.total
  );

  section(
    'Error log lines',
    report.errorLogs.length
      ? htmlOmitted(report.omitted.errorLogs, 'error lines') + htmlLogBlock(report.errorLogs, 'err')
      : htmlEmpty('No error lines.'),
    m.logs.errorLines
  );

  section(
    'Logs',
    report.logs.length
      ? htmlOmitted(report.omitted.logs, 'log lines') + htmlLogBlock(report.logs)
      : htmlEmpty('No logs captured.'),
    m.logs.lines
  );

  if (report.captureErrors.length) {
    section(
      'Capture errors',
      `<ul class="errs">${report.captureErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`,
      report.captureErrors.length
    );
  }

  parts.push(
    `<footer><span>SecSim · MI Digital Twin Management Platform</span><span>${escapeHtml(
      `Generated ${iso(report.generatedAt)}`
    )}</span></footer>`
  );

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark light">',
    `<title>Execution report: ${escapeHtml(report.scenarioTitle)}</title>`,
    `<style>${HTML_STYLE}</style>`,
    '</head>',
    '<body>',
    '<main class="sheet">',
    ...parts,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
