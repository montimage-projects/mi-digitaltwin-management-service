import { Conversation } from '../models/Conversation.js';
import type { IConversationSource } from '../models/Conversation.js';
import { getLLMGateway } from './index.js';
import { logger } from '../utils/logger.js';

export interface ConversationSummary {
  _id: string;
  title: string;
  lastMessage: string;
  updatedAt: Date;
  messageCount: number;
}

interface AddMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
  sources?: IConversationSource[];
}

function normalizeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'New Conversation';
  }

  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

export class ConversationManager {
  async create(userId: string): Promise<string> {
    const conversation = await Conversation.create({
      userId,
      title: 'New Conversation',
      messages: [],
    });

    return String(conversation._id);
  }

  async addMessage(conversationId: string, message: AddMessageInput): Promise<void> {
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $push: {
          messages: {
            role: message.role,
            content: message.content,
            timestamp: new Date(),
            sources: message.sources || [],
          },
        },
      },
      { runValidators: true }
    );
  }

  async getHistory(conversationId: string, userId: string) {
    const conversation = await Conversation.findOne({ _id: conversationId, userId }).lean();
    if (!conversation) {
      return null;
    }

    return conversation;
  }

  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 }).lean();

    return conversations.map((conversation) => {
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      return {
        _id: String(conversation._id),
        title: conversation.title,
        lastMessage: lastMessage?.content || '',
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
      };
    });
  }

  async delete(conversationId: string, userId: string): Promise<boolean> {
    const result = await Conversation.deleteOne({ _id: conversationId, userId });
    return result.deletedCount > 0;
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const fallback = normalizeTitle(firstMessage);

    try {
      const response = await getLLMGateway().chat([
        {
          role: 'system',
          content:
            'Generate a concise conversation title in at most 6 words. Return plain text only, no quotes.',
        },
        {
          role: 'user',
          content: firstMessage,
        },
      ]);

      const normalized = normalizeTitle(response.replace(/[\n\r]+/g, ' ').replace(/^"|"$/g, ''));
      return normalized || fallback;
    } catch (error) {
      logger.warn('Conversation title generation via LLM failed, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  async ensureTitleFromFirstUserMessage(conversationId: string): Promise<void> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return;
    }

    if (conversation.title !== 'New Conversation') {
      return;
    }

    const firstUserMessage = conversation.messages.find((message) => message.role === 'user');
    if (!firstUserMessage) {
      return;
    }

    conversation.title = await this.generateTitle(firstUserMessage.content);
    await conversation.save();
  }
}
