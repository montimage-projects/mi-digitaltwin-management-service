/**
 * Scenario SSE (Server-Sent Events) service.
 *
 * Owns the poll loop and SSE stream for deploy progress + pod logs.
 * The route layer only switches the response to `text/event-stream`,
 * calls this service, and lets it manage the interval / cleanup.
 */

import type { Response } from 'express';
import {
  buildClientFromInfrastructure,
  getDeploymentStatus,
  collectNewPodLogs,
  collectNewNamespaceEvents,
  isDeploymentSettled,
  type PodLogLine,
} from './kubernetesDeploy.js';

/** Interval between cluster status/log polls for the SSE progress stream. */
export const SSE_POLL_INTERVAL_MS = 2000;

/**
 * A security alert distilled from a monitor probe's log line (issue #234).
 * Emitted as the `alert` SSE event alongside the line's normal `log` event so
 * the execution view can list detections — timestamp, verdict and the
 * attacker source address the AI4SOAR playbook consumes (`ip.src`, #235).
 */
export interface SecurityAlertEvent {
  /** Workload resource name the reporting container belongs to. */
  service: string;
  /** Concrete pod the line came from. */
  pod: string;
  /** Container the line came from (e.g. the `mmt-probe` sidecar). */
  container?: string;
  /** ISO timestamp carried by the report, when the probe supplied one. */
  timestamp?: string;
  /** Detection summary (the report's verdict / alert text). */
  verdict?: string;
  /** Attacker source address — the report's `ip.src` when present. */
  attacker?: string;
  /** The original log line the alert was parsed from. */
  line: string;
}

/** Minimum gap between two `alert` events for the same detection. */
const ALERT_THROTTLE_MS = 5_000;

/** Field spellings that carry the attacker source address in a report. */
const ATTACKER_KEYS = ['ip.src', 'ip_src', 'src', 'attacker', 'source_ip', 'src_ip'];
/** Field spellings that carry the detection verdict/summary. */
const VERDICT_KEYS = [
  'verdict',
  'verdicts',
  'attack',
  'attack_type',
  'attack-type',
  'alert',
  'description',
  'message',
];
/** Field spellings that carry the report timestamp. */
const TIMESTAMP_KEYS = ['timestamp', 'time', 'ts', 'date'];
/** Sub-objects one level down that may hold the report fields. */
const NESTED_KEYS = ['properties', 'property', 'security', 'report', 'alert', 'attributes', 'data'];

function readField(obj: Record<string, unknown>, keys: string[], depth: number): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  if (depth <= 0) return undefined;
  for (const nest of NESTED_KEYS) {
    const sub = obj[nest];
    // mmt-security also emits `properties` as an array of
    // `{ att|name|key, val|value }` attribute pairs — normalize it first.
    const record = Array.isArray(sub)
      ? Object.fromEntries(
          sub
            .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
            .map((e) => [String(e.att ?? e.name ?? e.key ?? ''), e.val ?? e.value] as const)
            .filter(([k]) => k.length > 0)
        )
      : sub;
    if (record !== null && typeof record === 'object' && !Array.isArray(record)) {
      const value = readField(record as Record<string, unknown>, keys, depth - 1);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function readTimestamp(obj: Record<string, unknown>): string | undefined {
  const raw = readField(obj, TIMESTAMP_KEYS, 1);
  if (raw === undefined) return undefined;
  // Numeric epochs arrive in seconds or milliseconds; strings are taken
  // as-is when they parse as a date.
  const date =
    typeof raw === 'number' ? new Date(raw > 1e12 ? raw : raw * 1000) : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Detect an MMT security report in a pod log line (issue #234).
 *
 * With `output.format = JSON` the probe writes one JSON report per detection
 * on stdout; a report is recognized by carrying an attacker address (`ip.src`
 * and spellings) or a verdict field — the shapes are unambiguous enough that
 * no container-name gate is needed. A plain-text `ALERT …` line (e.g. the
 * e2e stub's detection banner) also counts, with the text as the verdict.
 * Returns null for ordinary log lines.
 */
export function parseSecurityAlert(entry: PodLogLine): SecurityAlertEvent | null {
  const line = entry.line;
  const trimmed = line.trim();

  // mmt-security's JSON report (secAnoD / mmt-probe `output.format = JSON`)
  // is an array: [10, probe, iface, ts, rule, verdict, type, description,
  // events], the attacker address in events.event_1.attributes.
  if (trimmed.startsWith('[10,')) {
    try {
      const report = JSON.parse(trimmed) as unknown[];
      const verdict = report[5];
      if (verdict === 'detected' || verdict === 'not_respected') {
        const events = report[8] as { event_1?: { attributes?: unknown[] } } | null | undefined;
        const pair = (events?.event_1?.attributes ?? []).find(
          (a): a is [string, unknown] =>
            Array.isArray(a) && (a[0] === 'ip.src' || a[0] === 'ipv6.src')
        );
        const ts = report[3];
        return {
          service: entry.name,
          pod: entry.pod,
          container: entry.container,
          timestamp: typeof ts === 'number' ? new Date(ts * 1000).toISOString() : undefined,
          verdict: `rule ${String(report[4])}: ${String(report[7])}`,
          attacker: pair ? String(pair[1]) : undefined,
          line,
        };
      }
      return null;
    } catch {
      /* not an mmt-security report — fall through */
    }
  }

  if (trimmed.startsWith('{')) {
    try {
      const report = JSON.parse(trimmed) as Record<string, unknown>;
      if (report !== null && typeof report === 'object' && !Array.isArray(report)) {
        const attacker = readField(report, ATTACKER_KEYS, 1);
        const verdict = readField(report, VERDICT_KEYS, 1);
        if (attacker !== undefined || verdict !== undefined) {
          return {
            service: entry.name,
            pod: entry.pod,
            container: entry.container,
            timestamp: readTimestamp(report),
            verdict: verdict === undefined ? undefined : String(verdict),
            attacker: attacker === undefined ? undefined : String(attacker),
            line,
          };
        }
      }
    } catch {
      /* not a JSON object line — fall through to the text check */
    }
  }

  const text = /^\[?ALERT[\s:]+(.+)$/i.exec(trimmed);
  if (text) {
    return {
      service: entry.name,
      pod: entry.pod,
      container: entry.container,
      verdict: text[1].trim() || undefined,
      line,
    };
  }
  return null;
}

/** A single SSE event sent to the client. */

/**
 * Run an SSE poll loop for a scenario execution.
 *
 * The caller (route handler) is responsible for:
 *  - Setting `Content-Type: text/event-stream` headers.
 *  - Calling `res.flushHeaders()`.
 *
 * This function:
 *  - Writes `progress`, `log`, `k8s-event`, `alert`, `end`, and `error`
 *    events to the response.
 *  - Cleans up the interval on client disconnect or when the deploy settles.
 *    For executions carrying a terminal-typed (`uiType`) service the stream
 *    stays open after `end` — a long-running workload like MAG is driven
 *    from a shell after rollout, so log lines, probe alerts and namespace
 *    events keep flowing to an attached console until disconnect/teardown.
 *  - Returns a cleanup function that the caller should invoke on `req.close`.
 *
 * @param res        — Express response already configured for SSE.
 * @param scenario   — the Scenario document (read-only).
 * @param execution  — the execution record (read-only).
 * @param infrastructure — the Infrastructure document for cluster access.
 * @returns a cleanup function to stop polling on client disconnect.
 */
export function runSSEStream(
  res: Response,
  scenario: { infrastructureId?: unknown },
  execution: {
    status: string;
    namespace?: string;
    completedAt?: Date;
    deployedServices?: { name?: string; uiType?: string }[];
  },
  infrastructure: {
    endpoint: string;
    credentials: { iv: string; encrypted: string; authTag: string };
  } | null,
  /**
   * Current execution state — the rollout runs in the background after
   * POST /execute answers, so a deploy failure is only visible in the record.
   */
  readState?: () => Promise<{ status: string; completedAt?: Date }>
): () => void {
  const namespace = execution.namespace;
  const deployed = execution.deployedServices ?? [];
  const names = deployed.map((s) => s.name).filter((n): n is string => Boolean(n));
  // A terminal-typed workload stays up for shell access after rollout — its
  // stream keeps flowing past deploy settle so `kubectl exec`-driven output
  // still reaches the console (issue #233).
  const interactive = deployed.some((s) => s.uiType === 'terminal' || s.uiType === 'both');
  let ended = false;

  // Nothing was deployed, or the execution has already reached a terminal
  // state — there is nothing to poll for. Emit a single snapshot and close.
  // `completed` only means the rollout settled; teardown stamps
  // `completedAt` — a settled, still-deployed execution keeps streaming.
  const terminal =
    !namespace || names.length === 0 || !!execution.completedAt || execution.status === 'failed';

  // Build the cluster client (may throw on bad credentials) *before*
  // switching the response to an event stream, so a failure returns a
  // normal JSON error rather than a half-open SSE connection.
  const infraForPoll = terminal || !scenario.infrastructureId ? null : infrastructure;

  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const send = (event: string, data: unknown): void => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    timer = undefined;
    res.end();
  };

  if (terminal || !names.length) {
    send('progress', { status: execution.status, progress: 0, services: [] });
    send('end', { status: execution.status });
    cleanup();
    return cleanup;
  }

  if (!infraForPoll) {
    send('error', { message: 'Assigned infrastructure not found' });
    cleanup();
    return cleanup;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = buildClientFromInfrastructure(infraForPoll as any);
  const seen = new Map<string, number>();
  // mmt-security reports every matching packet — a flood yields hundreds of
  // identical detections, so one `alert` per container/verdict/attacker is
  // sent per ALERT_THROTTLE_MS (the raw lines still stream as `log`).
  const lastAlertAt = new Map<string, number>();
  // `<uid>:<count>` keys of namespace events already streamed (task 2.3).
  const seenEvents = new Set<string>();

  let state: { status: string; completedAt?: Date } = execution;
  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      if (readState) {
        state = await readState();
        if (state.status === 'failed') {
          send('error', { message: 'Deployment failed — see the execution report for details' });
          cleanup();
          return;
        }
      }
      const { statuses, progress } = await getDeploymentStatus(clients, { namespace, names });
      send('progress', { progress, services: statuses });

      const logs = await collectNewPodLogs(clients, { namespace, names, seen });
      for (const entry of logs) {
        send('log', {
          service: entry.name,
          pod: entry.pod,
          container: entry.container,
          line: entry.line,
        });
        // A probe security report on stdout also surfaces as a typed `alert`
        // event so the console can list detections (issue #234).
        const alert = parseSecurityAlert(entry);
        if (alert) {
          const key = `${alert.container}|${alert.verdict}|${alert.attacker}`;
          const now = Date.now();
          if (now - (lastAlertAt.get(key) ?? 0) >= ALERT_THROTTLE_MS) {
            lastAlertAt.set(key, now);
            send('alert', alert);
          }
        }
      }

      // Namespace events (pod scheduled, image pulled, container started,
      // probe failures, the AI4SOAR reaction landing…) — before the settle
      // check so the final tick's events still reach the client.
      const events = await collectNewNamespaceEvents(clients, {
        namespace,
        seen: seenEvents,
      });
      for (const entry of events) {
        send('k8s-event', entry);
      }

      if (!ended && isDeploymentSettled(statuses)) {
        const status = statuses.some((s) => s.status === 'failed') ? 'failed' : 'completed';
        send('end', { status, services: statuses });
        if (status === 'failed' || !interactive) {
          cleanup();
          return;
        }
        // Interactive (terminal-typed) execution: `end` marks deploy settle,
        // but the stream stays attached so shell-driven attack output, probe
        // alerts and reaction events keep reaching the console (issue #233).
        ended = true;
      }
    } catch (err) {
      // Post-settle a failing read most likely means the namespace was torn
      // down — the deploy already ended cleanly, so close quietly instead of
      // flipping a finished execution to an error state.
      if (ended) {
        cleanup();
        return;
      }
      // Still rolling out in the background — the namespace or workloads
      // may not exist yet; keep polling.
      if (state.status === 'pending') return;
      send('error', { message: err instanceof Error ? err.message : String(err) });
      cleanup();
    }
  };

  // Emit an immediate snapshot, then poll on an interval until settled or
  // the client disconnects.
  void poll();
  if (!closed) {
    timer = setInterval(() => {
      void poll();
    }, SSE_POLL_INTERVAL_MS);
  }

  return cleanup;
}
