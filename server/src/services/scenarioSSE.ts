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
  isDeploymentSettled,
} from './kubernetesDeploy.js';

/** Interval between cluster status/log polls for the SSE progress stream. */
export const SSE_POLL_INTERVAL_MS = 2000;

/** A single SSE event sent to the client. */

/**
 * Run an SSE poll loop for a scenario execution.
 *
 * The caller (route handler) is responsible for:
 *  - Setting `Content-Type: text/event-stream` headers.
 *  - Calling `res.flushHeaders()`.
 *
 * This function:
 *  - Writes `progress`, `log`, `end`, and `error` events to the response.
 *  - Cleans up the interval on client disconnect or when the deploy settles.
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
    deployedServices?: { name?: string }[];
  },
  infrastructure: {
    endpoint: string;
    credentials: { iv: string; encrypted: string; authTag: string };
  } | null
): () => void {
  const namespace = execution.namespace;
  const names = (execution.deployedServices ?? [])
    .map((s) => s.name)
    .filter((n): n is string => Boolean(n));

  // Nothing was deployed, or the execution has already reached a terminal
  // state — there is nothing to poll for. Emit a single snapshot and close.
  const terminal =
    !namespace ||
    names.length === 0 ||
    execution.status === 'completed' ||
    execution.status === 'failed';

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

  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      const { statuses, progress } = await getDeploymentStatus(clients, { namespace, names });
      send('progress', { progress, services: statuses });

      const logs = await collectNewPodLogs(clients, { namespace, names, seen });
      for (const entry of logs) {
        send('log', { service: entry.name, pod: entry.pod, line: entry.line });
      }

      if (isDeploymentSettled(statuses)) {
        const status = statuses.some((s) => s.status === 'failed') ? 'failed' : 'completed';
        send('end', { status, services: statuses });
        cleanup();
      }
    } catch (err) {
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
