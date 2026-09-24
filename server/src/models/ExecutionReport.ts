import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Snapshot report of one scenario execution (issue #26).
 *
 * Captured when a run closes — at teardown, or when the deploy itself fails —
 * so results, key metrics and the tail of the logs/events/alerts outlive the
 * Kubernetes namespace. Stored in its own collection (keyed by scenario +
 * execution) rather than on the embedded execution so the Scenario document
 * stays small. Artifact arrays are capped by the report service; nothing
 * derived from infrastructure credentials is ever stored here.
 */

/** Overall verdict of a closed run. */
export type ExecutionOutcome = 'passed' | 'failed' | 'partial';

/** Coarse deploy status reused from the execution model. */
export type ReportDeployStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IReportContainerStatus {
  name: string;
  status: ReportDeployStatus;
}

export interface IReportServiceStatus {
  name: string;
  status: ReportDeployStatus;
  containers: IReportContainerStatus[];
}

export interface IReportLogLine {
  service: string;
  pod: string;
  container?: string;
  line: string;
}

export interface IReportEvent {
  reason?: string;
  message?: string;
  objectKind?: string;
  objectName?: string;
  type?: string;
  count?: number;
  timestamp?: string;
}

export interface IReportAlert {
  service: string;
  pod: string;
  container?: string;
  timestamp?: string;
  verdict?: string;
  attacker?: string;
  line: string;
}

/** A named counter — used instead of a map so untrusted keys stay values. */
export interface IReportCount {
  name: string;
  count: number;
}

export interface IReportStatusCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface IReportMetrics {
  services: { total: number; byStatus: IReportStatusCounts };
  containers: { total: number; byStatus: IReportStatusCounts; restarts: number };
  logs: { lines: number; errorLines: number };
  events: { total: number; warnings: number; byReason: IReportCount[] };
  alerts: { total: number; uniqueAttackers: number; byVerdict: IReportCount[] };
}

/** Number of artifact entries dropped by the caps, per artifact kind. */
export interface IReportOmitted {
  logs: number;
  errorLogs: number;
  events: number;
  alerts: number;
}

export interface IExecutionReport extends Document {
  scenarioId: Types.ObjectId;
  executionId: Types.ObjectId;
  scenarioTitle: string;
  executedBy: string;
  namespace?: string;
  outcome: ExecutionOutcome;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  services: IReportServiceStatus[];
  metrics: IReportMetrics;
  logs: IReportLogLine[];
  errorLogs: IReportLogLine[];
  events: IReportEvent[];
  alerts: IReportAlert[];
  omitted: IReportOmitted;
  partial: boolean;
  captureErrors: string[];
  error?: string;
  conclusion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const statusEnum = ['pending', 'running', 'completed', 'failed'];

const containerStatusSchema = new Schema<IReportContainerStatus>(
  {
    name: { type: String, required: true },
    status: { type: String, enum: statusEnum, required: true },
  },
  { _id: false }
);

const serviceStatusSchema = new Schema<IReportServiceStatus>(
  {
    name: { type: String, required: true },
    status: { type: String, enum: statusEnum, required: true },
    containers: [containerStatusSchema],
  },
  { _id: false }
);

const logLineSchema = new Schema<IReportLogLine>(
  {
    service: { type: String, required: true },
    pod: { type: String, required: true },
    container: { type: String },
    line: { type: String, default: '' },
  },
  { _id: false }
);

const eventSchema = new Schema<IReportEvent>(
  {
    reason: { type: String },
    message: { type: String },
    objectKind: { type: String },
    objectName: { type: String },
    type: { type: String },
    count: { type: Number },
    timestamp: { type: String },
  },
  { _id: false }
);

const alertSchema = new Schema<IReportAlert>(
  {
    service: { type: String, required: true },
    pod: { type: String, required: true },
    container: { type: String },
    timestamp: { type: String },
    verdict: { type: String },
    attacker: { type: String },
    line: { type: String, default: '' },
  },
  { _id: false }
);

const executionReportSchema = new Schema<IExecutionReport>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: 'Scenario', required: true },
    executionId: { type: Schema.Types.ObjectId, required: true },
    scenarioTitle: { type: String, default: '' },
    executedBy: { type: String, default: '' },
    namespace: { type: String },
    outcome: { type: String, enum: ['passed', 'failed', 'partial'], required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true, min: 0 },
    services: [serviceStatusSchema],
    // Fixed-shape counters; untrusted names live in `{ name, count }` values.
    metrics: { type: Schema.Types.Mixed, required: true },
    logs: [logLineSchema],
    errorLogs: [logLineSchema],
    events: [eventSchema],
    alerts: [alertSchema],
    omitted: {
      logs: { type: Number, default: 0 },
      errorLogs: { type: Number, default: 0 },
      events: { type: Number, default: 0 },
      alerts: { type: Number, default: 0 },
    },
    partial: { type: Boolean, default: false },
    captureErrors: [{ type: String }],
    error: { type: String },
    conclusion: { type: String },
  },
  {
    timestamps: true,
  }
);

// One report per execution; the report service upserts on this key.
executionReportSchema.index({ scenarioId: 1, executionId: 1 }, { unique: true });

// Remove __v from JSON output
executionReportSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const ExecutionReport = mongoose.model<IExecutionReport>(
  'ExecutionReport',
  executionReportSchema
);
