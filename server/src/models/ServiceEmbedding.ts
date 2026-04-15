import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IServiceEmbedding extends Document {
  serviceId: Types.ObjectId;
  embedding: number[];
  rawText: string;
  modelName: string;
  shortName: string;
  title: string;
  provider: string;
  category?: string;
  sector?: string;
  createdAt: Date;
  updatedAt: Date;
}

const serviceEmbeddingSchema = new Schema<IServiceEmbedding>(
  {
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
      unique: true,
      index: true,
    },
    embedding: {
      type: [Number],
      required: true,
      default: [],
    },
    rawText: {
      type: String,
      required: true,
      maxlength: 20000,
    },
    modelName: {
      type: String,
      required: true,
      maxlength: 200,
    },
    shortName: {
      type: String,
      required: true,
      maxlength: 100,
    },
    title: {
      type: String,
      required: true,
      maxlength: 400,
    },
    provider: {
      type: String,
      required: true,
      maxlength: 200,
    },
    category: {
      type: String,
      maxlength: 200,
    },
    sector: {
      type: String,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
    collection: 'service_embeddings',
  }
);

serviceEmbeddingSchema.index({ updatedAt: -1 });
serviceEmbeddingSchema.index({ shortName: 1 });

export const ServiceEmbedding = mongoose.model<IServiceEmbedding>(
  'ServiceEmbedding',
  serviceEmbeddingSchema
);
