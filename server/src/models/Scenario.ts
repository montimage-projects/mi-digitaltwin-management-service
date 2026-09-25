import type { Runbook } from '../services/runbook.js';
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeployedService {
  serviceId: Types.ObjectId;
  /** Topology node id this deployment was created from. */
  nodeId?: string;
  /** Kubernetes resource name (Deployment/Service) for this node. */
  name?: string;
  uiType?: 'web' | 'terminal' | 'both';
  /** Coarse per-service deploy status derived from the cluster. */
  status?: 'pending' | 'running' | 'completed' | 'failed';
  /** Reachable NodePort URL for the deployed service. */
  dashboardUrl?: string;
  /** The node has a web-reachable Service (opened through the proxy). */
  webInterface?: boolean;
}

export interface IConclusion {
  text: string;
  author: string;
  createdAt: Date;
}

export interface IExecution {
  _id?: Types.ObjectId;
  executedAt: Date;
  executedBy: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Kubernetes namespace the topology was deployed into. */
  namespace?: string;
  deployedServices: IDeployedService[];
  conclusion?: IConclusion;
  /** When the run closed — teardown or deploy failure (issue #26). */
  completedAt?: Date;
  /** Wall-clock run time from `executedAt` to `completedAt`, in ms. */
  durationMs?: number;
  /** Overall verdict recorded when the run closed (issue #26). */
  outcome?: 'passed' | 'failed' | 'partial';
}

/**
 * Per-node config overrides — task 0.4 of the Montimage attack→detect→respond
 * plan (docs/playbooks/montimage-attack-detect-respond-plan.md). Mirrors the
 * `env`/`args` fields of `Service.deployment` (models/Service.ts) so a scenario
 * can override catalog defaults (e.g. the MAG attack profile) without editing
 * the catalog. Validated by the scenario routes on save; unknown keys are
 * preserved for forward compatibility (e.g. `configFiles`, task 3.3).
 */
export interface INodeConfig {
  env?: { name: string; value?: string; fromEdge?: 'target' | 'reaction' }[];
  args?: string[];
  [key: string]: unknown;
}

export interface ITopologyNode {
  id?: string;
  data?: {
    serviceId?: string;
    version?: string;
    config?: INodeConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ITopology {
  yaml: string;
  nodes: ITopologyNode[];
  edges: object[];
}

export interface IScenario extends Document {
  projectId: Types.ObjectId;
  title: string;
  description?: string;
  topology: ITopology;
  infrastructureId?: Types.ObjectId;
  /** Step-by-step test guide rendered per execution (services/runbook.ts). */
  runbook?: Runbook;
  /**
   * Deploy the per-namespace observability stack (OTel Collector +
   * Prometheus) with each execution. Defaults to on; documents saved before
   * the field existed read `undefined`, which the engine also treats as on.
   */
  observability?: boolean;
  executions: IExecution[];
  /**
   * Seed bookkeeping mirroring the catalog models — a seeded scenario (the
   * demo, task 4.1) is stamped `seedManaged`/`deprecated` so re-running the
   * seed can tell drift from an unchanged record; the demo seed never
   * deprecates scenarios.
   */
  deprecated: boolean;
  seedManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const deployedServiceSchema = new Schema<IDeployedService>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    nodeId: { type: String },
    name: { type: String },
    uiType: { type: String, enum: ['web', 'terminal', 'both'] },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    dashboardUrl: { type: String },
    webInterface: { type: Boolean },
  },
  { _id: false }
);

const conclusionSchema = new Schema<IConclusion>(
  {
    text: { type: String, required: true },
    author: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const executionSchema = new Schema<IExecution>(
  {
    executedAt: { type: Date, default: Date.now },
    executedBy: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    namespace: { type: String },
    deployedServices: [deployedServiceSchema],
    conclusion: conclusionSchema,
    completedAt: { type: Date },
    durationMs: { type: Number, min: 0 },
    outcome: { type: String, enum: ['passed', 'failed', 'partial'] },
  },
  { _id: true }
);

const topologySchema = new Schema<ITopology>(
  {
    yaml: { type: String, default: '' },
    nodes: [{ type: Schema.Types.Mixed }],
    edges: [{ type: Schema.Types.Mixed }],
  },
  { _id: false }
);

const scenarioSchema = new Schema<IScenario>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    topology: {
      type: topologySchema,
      default: { yaml: '', nodes: [], edges: [] },
    },
    infrastructureId: {
      type: Schema.Types.ObjectId,
      ref: 'Infrastructure',
    },
    runbook: {
      type: Schema.Types.Mixed,
    },
    observability: {
      type: Boolean,
      default: true,
    },
    executions: [executionSchema],
    deprecated: {
      type: Boolean,
      default: false,
    },
    seedManaged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (projectId already has index: true in schema)
scenarioSchema.index({ title: 'text', description: 'text' });

// Remove __v from JSON output
scenarioSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Scenario = mongoose.model<IScenario>('Scenario', scenarioSchema);
