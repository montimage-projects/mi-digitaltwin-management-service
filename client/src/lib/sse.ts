/**
 * Server-Sent Events (SSE) utilities for execution monitoring.
 *
 * Extracted from api.ts to keep that module under 300 lines.
 */

import { useAuthStore } from '@/store/auth-store';
import type {
  ExecutionEventHandlers,
  ExecutionProgressEvent,
  ExecutionLogEvent,
  ExecutionEndEvent,
  ExecutionErrorEvent,
  ParsedSseEvent,
} from './sse-types';

/**
 * Parse a single raw SSE record (its fields separated by newlines) into an
 * `{ event, data }` pair. Returns null when the record carries no `data:`
 * field (e.g. a keep-alive comment). Pure and side-effect free.
 */
function parseSseEvent(raw: string): ParsedSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Per the SSE spec a single leading space after the colon is stripped.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // Comments (":" prefix) and other fields (id/retry) are ignored.
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function dispatchSseEvent(parsed: ParsedSseEvent, handlers: ExecutionEventHandlers): void {
  let payload: unknown;
  try {
    payload = JSON.parse(parsed.data);
  } catch {
    return;
  }
  switch (parsed.event) {
    case 'progress':
      handlers.onProgress?.(payload as ExecutionProgressEvent);
      break;
    case 'log':
      handlers.onLog?.(payload as ExecutionLogEvent);
      break;
    case 'end':
      handlers.onEnd?.(payload as ExecutionEndEvent);
      break;
    case 'error':
      handlers.onError?.(payload as ExecutionErrorEvent);
      break;
  }
}

/**
 * Subscribe to a scenario execution's Server-Sent Events stream.
 *
 * The native `EventSource` cannot attach the `Authorization` header the
 * endpoint requires, so the stream is consumed with `fetch` + a manual
 * `ReadableStream` reader. The auth token is read from the same store the
 * axios request interceptor uses, keeping a single source of truth.
 *
 * Returns an unsubscribe function that aborts the request and stops reading.
 */
export function subscribeToExecutionEvents(
  scenarioId: string,
  executionId: string,
  handlers: ExecutionEventHandlers
): () => void {
  const controller = new AbortController();
  const token = useAuthStore.getState().token;

  void (async () => {
    try {
      const response = await fetch(
        `/api/scenarios/${scenarioId}/executions/${executionId}/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        handlers.onError?.({ message: `Failed to open event stream (${response.status})` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let ended = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE records are separated by a blank line.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseEvent(raw);
          if (parsed) {
            if (parsed.event === 'end') ended = true;
            dispatchSseEvent(parsed, handlers);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }

      // Stream ended without an explicit 'end' event — notify the client.
      if (!ended) {
        handlers.onError?.({ message: 'Event stream ended unexpectedly' });
      }
    } catch (err) {
      // A deliberate unsubscribe surfaces as an AbortError — not a failure.
      if (controller.signal.aborted) return;
      handlers.onError?.({ message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return () => controller.abort();
}
