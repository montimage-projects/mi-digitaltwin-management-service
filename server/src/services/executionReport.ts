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
  type ReportDeployStatus,
} from '../models/ExecutionReport.js';
import { logger } from '../utils/logger.js';

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

/** Project a stored report onto the API shape (field whitelist). */
export function toReportData(stored: StoredReport, status: string): ExecutionReportData {
  return {
    scenarioId: String(stored.scenarioId),
    executionId: String(stored.executionId),
    scenarioTitle: stored.scenarioTitle ?? '',
    executedBy: stored.executedBy ?? '',
    ...(stored.namespace ? { namespace: stored.namespace } : {}),
    status,
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
    omitted: {
      logs: stored.omitted?.logs ?? 0,
      errorLogs: stored.omitted?.errorLogs ?? 0,
      events: stored.omitted?.events ?? 0,
      alerts: stored.omitted?.alerts ?? 0,
    },
    partial: Boolean(stored.partial),
    captureErrors: stored.captureErrors ?? [],
    ...(stored.error ? { error: stored.error } : {}),
    ...(stored.conclusion ? { conclusion: stored.conclusion } : {}),
    provisional: false,
    generatedAt: stored.updatedAt ?? stored.completedAt ?? stored.startedAt,
  };
}

// ---------------------------------------------------------------------------
// Cluster capture + persistence
// ---------------------------------------------------------------------------

/**
 * Read the run's final cluster state: workload statuses, container restarts,
 * the full pod logs and the namespace events (fresh `seen` state, so every
 * line/event still retained by the cluster is returned). Each step fails
 * independently into `captureErrors`; the whole read is bounded by
 * `timeoutMs`, returning whatever was gathered so far on expiry.
 */
export async function collectArtifacts(
  clients: K8sClients,
  opts: { namespace: string; names: string[] },
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

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    await Promise.race([
      collect(),
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

/** Render the report as GitHub-flavored Markdown; all untrusted text escaped. */
export function renderMarkdown(report: ExecutionReportData): string {
  const m = report.metrics;
  const out: string[] = [];

  out.push(`# Execution report: ${escapeMarkdown(report.scenarioTitle)}`);
  out.push('');
  if (report.provisional) {
    out.push(
      '> **Provisional report** — this run has not been closed yet; no logs, events or alerts were captured.'
    );
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

  if (report.conclusion) {
    out.push('## Conclusion', '', markdownCodeBlock(report.conclusion), '');
  }

  return out.join('\n');
}

const HTML_STYLE = `
body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; color: #1f2937; }
h1 { font-size: 1.5rem; } h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .25rem; }
table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: .5rem 0; }
th, td { border: 1px solid #e5e7eb; padding: .35rem .5rem; text-align: left; vertical-align: top; word-break: break-word; }
th { background: #f9fafb; }
pre { background: #0f172a; color: #e2e8f0; padding: .75rem; border-radius: 6px; font-size: .75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: .5rem .75rem; }
.muted { color: #6b7280; }
.outcome { display: inline-block; padding: .1rem .5rem; border-radius: 9999px; font-weight: 600; font-size: .8rem; }
.outcome-passed { background: #dcfce7; color: #166534; }
.outcome-failed { background: #fee2e2; color: #991b1b; }
.outcome-partial { background: #fef3c7; color: #92400e; }
`;

function htmlTable(headers: string[], rows: (string | number | undefined)[][]): string {
  const head = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '—')}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function htmlLogBlock(lines: IReportLogLine[]): string {
  return `<pre>${escapeHtml(lines.map((l) => `${logPrefix(l)} ${l.line}`).join('\n'))}</pre>`;
}

function htmlOmitted(count: number, what: string): string {
  return count ? `<p class="muted">${count} earlier ${escapeHtml(what)} omitted.</p>` : '';
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
  const parts: string[] = [];

  parts.push(`<h1>Execution report: ${escapeHtml(report.scenarioTitle)}</h1>`);
  if (report.provisional) {
    parts.push(
      '<p class="note"><strong>Provisional report</strong> — this run has not been closed yet; no logs, events or alerts were captured.</p>'
    );
  }
  if (report.partial) {
    parts.push(
      '<p class="note"><strong>Partial report</strong> — some artifacts could not be captured (see Capture errors).</p>'
    );
  }

  parts.push('<h2>Summary</h2>');
  parts.push(
    `<p>Outcome: <span class="outcome outcome-${outcome}">${escapeHtml(outcome.toUpperCase())}</span></p>`
  );
  parts.push(
    htmlTable(
      ['Field', 'Value'],
      [
        ['Status', report.status],
        ['Scenario', report.scenarioTitle],
        ['Execution', report.executionId],
        ['Executed by', report.executedBy],
        ['Namespace', report.namespace],
        ['Started', iso(report.startedAt)],
        ['Completed', iso(report.completedAt)],
        ['Duration', formatDuration(report.durationMs)],
        ['Generated', iso(report.generatedAt)],
      ]
    )
  );

  if (report.error) {
    parts.push('<h2>Error</h2>', `<pre>${escapeHtml(report.error)}</pre>`);
  }

  parts.push('<h2>Key metrics</h2>');
  parts.push(
    htmlTable(
      ['Metric', 'Value'],
      [
        ['Services', `${m.services.total} (${statusSummary(m.services.byStatus)})`],
        [
          'Containers',
          `${m.containers.total} (${statusSummary(m.containers.byStatus)}); restarts ${m.containers.restarts}`,
        ],
        ['Log lines', `${m.logs.lines} (${m.logs.errorLines} error lines)`],
        ['Kubernetes events', `${m.events.total} (${m.events.warnings} warnings)`],
        ['Security alerts', `${m.alerts.total} (${m.alerts.uniqueAttackers} unique attackers)`],
      ]
    )
  );
  if (m.alerts.byVerdict.length) {
    parts.push(
      '<h3>Alerts by verdict</h3>',
      htmlTable(
        ['Verdict', 'Count'],
        m.alerts.byVerdict.map((c) => [c.name, c.count])
      )
    );
  }
  if (m.events.byReason.length) {
    parts.push(
      '<h3>Events by reason</h3>',
      htmlTable(
        ['Reason', 'Count'],
        m.events.byReason.map((c) => [c.name, c.count])
      )
    );
  }

  parts.push('<h2>Services</h2>');
  parts.push(
    report.services.length
      ? htmlTable(
          ['Service', 'Status', 'Containers'],
          report.services.map((s) => [
            s.name,
            s.status,
            s.containers.map((c) => `${c.name}: ${c.status}`).join(', ') || '—',
          ])
        )
      : '<p class="muted">No services were deployed.</p>'
  );

  parts.push('<h2>Security alerts</h2>');
  parts.push(
    report.alerts.length
      ? htmlOmitted(report.omitted.alerts, 'alerts') +
          htmlTable(
            ['Time', 'Service', 'Container', 'Verdict', 'Attacker'],
            report.alerts.map((a) => [a.timestamp, a.service, a.container, a.verdict, a.attacker])
          )
      : '<p class="muted">No security alerts.</p>'
  );

  parts.push('<h2>Kubernetes events</h2>');
  parts.push(
    report.events.length
      ? htmlOmitted(report.omitted.events, 'events') +
          htmlTable(
            ['Time', 'Type', 'Reason', 'Object', 'Message'],
            report.events.map((e) => [
              e.timestamp,
              e.type,
              e.reason,
              [e.objectKind, e.objectName].filter(Boolean).join('/') || undefined,
              e.message,
            ])
          )
      : '<p class="muted">No events captured.</p>'
  );

  parts.push('<h2>Error log lines</h2>');
  parts.push(
    report.errorLogs.length
      ? htmlOmitted(report.omitted.errorLogs, 'error lines') + htmlLogBlock(report.errorLogs)
      : '<p class="muted">No error lines.</p>'
  );

  parts.push('<h2>Logs</h2>');
  parts.push(
    report.logs.length
      ? htmlOmitted(report.omitted.logs, 'log lines') + htmlLogBlock(report.logs)
      : '<p class="muted">No logs captured.</p>'
  );

  if (report.captureErrors.length) {
    parts.push(
      '<h2>Capture errors</h2>',
      `<ul>${report.captureErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    );
  }

  if (report.conclusion) {
    parts.push('<h2>Conclusion</h2>', `<pre>${escapeHtml(report.conclusion)}</pre>`);
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Execution report: ${escapeHtml(report.scenarioTitle)}</title>`,
    `<style>${HTML_STYLE}</style>`,
    '</head>',
    '<body>',
    ...parts,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
