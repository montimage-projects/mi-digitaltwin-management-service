/**
 * Server-Sent Events (SSE) type definitions for execution monitoring.
 *
 * Extracted from api.ts to keep that module under 300 lines.
 */

/** Coarse per-service deploy status; `completed` marks a finished Job. */
export type DeployStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Per-container status inside one workload's pods. */
export interface ContainerDeployStatus {
  name: string;
  status: DeployStatus;
}

/** Status of a single service during execution. */
export interface ExecutionServiceStatus {
  name: string;
  status: DeployStatus;
  /** Per-container breakdown of the workload's pods (host + sidecars). */
  containers?: ContainerDeployStatus[];
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
  /** Container the line came from (multi-container pods carry sidecars). */
  container?: string;
  line: string;
}

/** Terminal execution outcome (completed or failed). */
export interface ExecutionEndEvent {
  status: 'completed' | 'failed';
  services?: ExecutionServiceStatus[];
}

/**
 * A Kubernetes Event in the execution namespace, distilled for SSE.
 * Mirrors the server's `NamespaceEventEntry` (kubernetesDeploy.ts).
 */
export interface ExecutionK8sEvent {
  /** `metadata.uid` of the Event object — the dedup key alongside `count`. */
  uid?: string;
  /** Short machine reason, e.g. `Scheduled`, `Pulled`, `Killing`. */
  reason?: string;
  /** Human-readable detail of what happened. */
  message?: string;
  /** Kind of the object the event is about, e.g. `Pod`. */
  objectKind?: string;
  /** Name of the object the event is about, e.g. the pod name. */
  objectName?: string;
  /** `Normal` or `Warning`. */
  type?: string;
  /** Number of times the event has fired. */
  count?: number;
  /** ISO timestamp of the most recent occurrence. */
  timestamp?: string;
}

/** Error event emitted when the stream encounters an issue. */
export interface ExecutionErrorEvent {
  message: string;
}

/** Callback handlers for SSE execution events. */
export interface ExecutionEventHandlers {
  onProgress?: (event: ExecutionProgressEvent) => void;
  onLog?: (event: ExecutionLogEvent) => void;
  onK8sEvent?: (event: ExecutionK8sEvent) => void;
  onEnd?: (event: ExecutionEndEvent) => void;
  onError?: (event: ExecutionErrorEvent) => void;
}

/** Parsed SSE event with event type and data payload. */
export interface ParsedSseEvent {
  event: string;
  data: string;
}
