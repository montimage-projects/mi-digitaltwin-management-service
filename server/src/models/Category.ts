import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  /**
   * Set when a seed run no longer finds this category in its source data
   * (e.g. after a catalog refresh). Deprecated categories are kept rather
   * than deleted so existing services that still reference them via
   * `categoryId` don't dangle; they are excluded from list responses by
   * default (see `GET /api/categories`).
   */
  deprecated: boolean;
  /**
   * True for categories created/managed by `seedCategories()`. Only
   * seed-managed records are ever auto-deprecated by a catalog refresh —
   * categories created some other way (should a creation path be added
   * later) are never touched by the stale-deprecation sweep.
   */
  seedManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
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
    description: {
      type: String,
      maxlength: 500,
    },
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

categorySchema.index({ deprecated: 1 });

// Remove __v from JSON output
categorySchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Category = mongoose.model<ICategory>('Category', categorySchema);
