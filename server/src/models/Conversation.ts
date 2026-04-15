import mongoose, { Schema, Document, Types } from 'mongoose';

export type ConversationRole = 'system' | 'user' | 'assistant';

export interface IConversationSource {
  serviceId: string;
  shortName: string;
  title: string;
  score: number;
}

export interface IConversationMessage {
  role: ConversationRole;
  content: string;
  timestamp: Date;
  sources?: IConversationSource[];
}

export interface IConversation extends Document {
  userId: Types.ObjectId;
  title: string;
  messages: IConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const conversationSourceSchema = new Schema<IConversationSource>(
  {
    serviceId: { type: String, required: true },
    shortName: { type: String, required: true },
    title: { type: String, required: true },
    score: { type: Number, required: true },
  },
  { _id: false }
);

const conversationMessageSchema = new Schema<IConversationMessage>(
  {
    role: {
      type: String,
      enum: ['system', 'user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 12000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    sources: {
      type: [conversationSourceSchema],
      default: [],
    },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    messages: {
      type: [conversationMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'conversations',
  }
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
