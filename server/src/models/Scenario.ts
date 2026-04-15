import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeployedService {
  serviceId: Types.ObjectId;
  dashboardUrl?: string;
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
  deployedServices: IDeployedService[];
  conclusion?: IConclusion;
}

export interface ITopology {
  yaml: string;
  nodes: object[];
  edges: object[];
}

export interface IScenario extends Document {
  projectId: Types.ObjectId;
  title: string;
  description?: string;
  topology: ITopology;
  infrastructureId?: Types.ObjectId;
  executions: IExecution[];
  createdAt: Date;
  updatedAt: Date;
}

const deployedServiceSchema = new Schema<IDeployedService>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    dashboardUrl: { type: String },
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
    deployedServices: [deployedServiceSchema],
    conclusion: conclusionSchema,
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
    executions: [executionSchema],
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
