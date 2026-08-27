/**
 * Server-Sent Events (SSE) type definitions for execution monitoring.
 *
 * Extracted from api.ts to keep that module under 300 lines.
 */

/** Coarse per-service deploy status. */
export type DeployStatus = 'pending' | 'running' | 'failed';

/** Status of a single service during execution. */
export interface ExecutionServiceStatus {
  name: string;
  status: DeployStatus;
}

/** Progress snapshot emitted during execution. */
export interface ExecutionProgressEvent {
  progress: number;
  services: ExecutionServiceStatus[];
  /** Present only in the single-snapshot response for a terminal execution. */
  status?: string;
}

/** A single log line from a service's pod. */
export interface ExecutionLogEvent {
  service: string;
  pod: string;
  line: string;
}

/** Terminal execution outcome (completed or failed). */
export interface ExecutionEndEvent {
  status: 'completed' | 'failed';
  services?: ExecutionServiceStatus[];
}

/** Error event emitted when the stream encounters an issue. */
export interface ExecutionErrorEvent {
  message: string;
}

/** Callback handlers for SSE execution events. */
export interface ExecutionEventHandlers {
  onProgress?: (event: ExecutionProgressEvent) => void;
  onLog?: (event: ExecutionLogEvent) => void;
  onEnd?: (event: ExecutionEndEvent) => void;
  onError?: (event: ExecutionErrorEvent) => void;
}

/** Parsed SSE event with event type and data payload. */
export interface ParsedSseEvent {
  event: string;
  data: string;
}
