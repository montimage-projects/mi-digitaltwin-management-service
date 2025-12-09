import mongoose, { Schema, Document } from 'mongoose';

export interface ISector extends Document {
  name: string;
  slug: string;
  category: 'essential' | 'important';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sectorSchema = new Schema<ISector>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['essential', 'important'],
    },
    description: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Remove __v from JSON output
sectorSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Sector = mongoose.model<ISector>('Sector', sectorSchema);
