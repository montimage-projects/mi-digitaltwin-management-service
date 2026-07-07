import mongoose, { Schema, Document } from 'mongoose';

export interface ICredentials {
  iv: string;
  encrypted: string;
  authTag: string;
}

export interface ICapacity {
  cpu?: number;
  memory?: number;
  storage?: number;
}

export interface IInfrastructure extends Document {
  name: string;
  type: 'kubernetes' | 'docker' | 'virtual';
  endpoint: string;
  credentials: ICredentials;
  capacity: ICapacity;
  status: 'active' | 'inactive' | 'error';
  skipTLSVerify?: boolean;
  lastHealthCheck?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const credentialsSchema = new Schema<ICredentials>(
  {
    iv: { type: String, required: true },
    encrypted: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false }
);

const capacitySchema = new Schema<ICapacity>(
  {
    cpu: { type: Number },
    memory: { type: Number },
    storage: { type: Number },
  },
  { _id: false }
);

const infrastructureSchema = new Schema<IInfrastructure>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
      trim: true,
    },
    type: {
      type: String,
      enum: ['kubernetes', 'docker', 'virtual'],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
      maxlength: 500,
    },
    credentials: {
      type: credentialsSchema,
      required: true,
    },
    capacity: {
      type: capacitySchema,
      default: {},
    },
    skipTLSVerify: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'error'],
      default: 'inactive',
    },
    lastHealthCheck: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (name already has unique: true in schema)
infrastructureSchema.index({ type: 1 });
infrastructureSchema.index({ status: 1 });

// Remove __v and credentials from JSON output
infrastructureSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    delete obj.credentials; // Never return credentials in API responses
    return obj;
  },
});

export const Infrastructure = mongoose.model<IInfrastructure>(
  'Infrastructure',
  infrastructureSchema
);
