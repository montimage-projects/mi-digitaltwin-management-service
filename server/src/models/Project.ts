import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProject extends Document {
  shortName: string;
  title: string;
  sector: 'Telecommunications' | 'Healthcare' | 'Transportation' | 'Nuclear' | 'Cross-Sector';
  leader: string;
  involvedPartners: string[];
  description?: string;
  isComposite: boolean;
  atomicProjectIds: Types.ObjectId[];
  /**
   * Set when a seed refresh no longer lists this project in its source data —
   * kept for the same seed-vs-operator bookkeeping the catalog models use;
   * the demo seed never deprecates projects.
   */
  deprecated: boolean;
  /**
   * True for projects created/managed by a seed (`seedDemoScenario()` stamps
   * the demo project). Operator-created projects read `false` and are never
   * touched by seed upserts.
   */
  seedManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
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
    sector: {
      type: String,
      enum: ['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector'],
      required: true,
    },
    leader: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    involvedPartners: [
      {
        type: String,
        maxlength: 50,
      },
    ],
    description: {
      type: String,
      maxlength: 2000,
    },
    isComposite: {
      type: Boolean,
      default: false,
    },
    atomicProjectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
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

// Indexes (shortName already has unique: true in schema)
projectSchema.index({ sector: 1 });
projectSchema.index({ leader: 1 });

// Text index for search
projectSchema.index(
  { shortName: 'text', title: 'text', description: 'text' },
  { weights: { shortName: 10, title: 5, description: 1 } }
);

// Remove __v from JSON output
projectSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Project = mongoose.model<IProject>('Project', projectSchema);
