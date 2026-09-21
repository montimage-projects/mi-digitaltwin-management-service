import mongoose, { Schema, Document } from 'mongoose';

export interface IPartner extends Document {
  shortName: string;
  legalName: string;
  role: 'COO' | 'BEN';
  country: string;
  pic: string;
  maxGrantAmountEur: number;
  /**
   * Set when a seed run no longer finds this partner (by `shortName`) in its
   * source data (e.g. after a consortium/grant agreement refresh). Deprecated
   * partners are kept rather than deleted so historical references don't
   * dangle; they are excluded from list responses by default (see
   * `GET /api/partners`).
   */
  deprecated: boolean;
  /**
   * True for partners created/managed by `seedPartners()`. Only
   * seed-managed records are ever auto-deprecated by a catalog refresh —
   * partners created some other way (should a creation path be added later)
   * are never touched by the stale-deprecation sweep.
   */
  seedManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
  {
    shortName: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
      trim: true,
    },
    legalName: {
      type: String,
      required: true,
      maxlength: 300,
      trim: true,
    },
    role: {
      type: String,
      enum: ['COO', 'BEN'],
      required: true,
    },
    country: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    pic: {
      type: String,
      required: true,
      trim: true,
    },
    maxGrantAmountEur: {
      type: Number,
      required: true,
      min: 0,
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

partnerSchema.index({ deprecated: 1 });

// Remove __v from JSON output
partnerSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const Partner = mongoose.model<IPartner>('Partner', partnerSchema);
