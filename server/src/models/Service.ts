import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVersion {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
  releasedAt: Date;
  releasedBy?: string;
}

export interface IInputOutput {
  name: string;
  description?: string;
  format?: string;
}

export interface IService extends Document {
  shortName: string;
  title: string;
  categoryId: Types.ObjectId;
  provider: string;
  description?: string;
  currentVersion?: string;
  versions: IVersion[];
  type: 'Software' | 'Hardware' | 'Software/Hardware';
  trl: {
    current?: number;
    expected?: number;
  };
  license?: string;
  standards: string[];
  inputs: IInputOutput[];
  outputs: IInputOutput[];
  interactsWith: string[];
  potentialUseCases: string[];
  repositoryTable: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  createdAt: Date;
  updatedAt: Date;
}

const versionSchema = new Schema<IVersion>(
  {
    version: { type: String, required: true },
    dockerImage: { type: String, required: true },
    releaseNotes: { type: String },
    releasedAt: { type: Date, default: Date.now },
    releasedBy: { type: String },
  },
  { _id: true }
);

const inputOutputSchema = new Schema<IInputOutput>(
  {
    name: { type: String, required: true },
    description: { type: String },
    format: { type: String },
  },
  { _id: false }
);

const serviceSchema = new Schema<IService>(
  {
    shortName: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      maxlength: 50,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    provider: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    currentVersion: {
      type: String,
    },
    versions: [versionSchema],
    type: {
      type: String,
      enum: ['Software', 'Hardware', 'Software/Hardware'],
      default: 'Software',
    },
    trl: {
      current: { type: Number, min: 1, max: 9 },
      expected: { type: Number, min: 1, max: 9 },
    },
    license: {
      type: String,
      maxlength: 100,
    },
    standards: [{ type: String }],
    inputs: [inputOutputSchema],
    outputs: [inputOutputSchema],
    interactsWith: [{ type: String }],
    potentialUseCases: [{ type: String }],
    repositoryTable: {
      type: String,
      enum: ['INTACT_TOOLBOX', 'OTHER_SERVICES'],
      default: 'INTACT_TOOLBOX',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
serviceSchema.index({ shortName: 1 }, { unique: true });
serviceSchema.index({ categoryId: 1 });
serviceSchema.index({ repositoryTable: 1 });
serviceSchema.index({ provider: 1 });
serviceSchema.index({ 'versions.version': 1 });

// Text index for search
serviceSchema.index(
  { shortName: 'text', title: 'text', description: 'text' },
  { weights: { shortName: 10, title: 5, description: 1 } }
);

// Remove __v from JSON output
serviceSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Service = mongoose.model<IService>('Service', serviceSchema);
