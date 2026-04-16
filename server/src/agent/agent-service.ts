import type { IConversationSource } from '../models/Conversation.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { ConversationManager } from './conversation-manager.js';
import { getRAGRetriever, getLLMGateway, getIntentClassifier } from './index.js';
import { BOSS_AGENT_SYSTEM_PROMPT, buildRagContextPrompt } from './prompts.js';
import type { ChatMessage } from './types.js';

export interface ChatResult {
  conversationId: string;
  sources: IConversationSource[];
}

export class AgentService {
  constructor(private readonly conversationManager: ConversationManager) {}

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    onToken?: (token: string) => void
  ): Promise<ChatResult> {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new AppError('Message cannot be empty', 400);
    }

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      activeConversationId = await this.conversationManager.create(userId);
    }

    const conversation = await this.conversationManager.getHistory(activeConversationId, userId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    await this.conversationManager.addMessage(activeConversationId, {
      role: 'user',
      content: trimmedMessage,
    });
    await this.conversationManager.ensureTitleFromFirstUserMessage(activeConversationId);

    const retriever = getRAGRetriever();
    let retrieved: Awaited<ReturnType<typeof retriever.retrieveSimilar>> = [];
    try {
      const isServiceQuery = await getIntentClassifier().isServiceQuery(trimmedMessage);
      if (isServiceQuery) {
        retrieved = await retriever.retrieveSimilar(trimmedMessage, 4);
      }
    } catch (error) {
      logger.warn('RAG retrieval failed; continuing with chat-only mode', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const ragContext = retriever.formatContextForPrompt(retrieved);

    const historyAfterUserMessage = await this.conversationManager.getHistory(
      activeConversationId,
      userId
    );
    if (!historyAfterUserMessage) {
      throw new AppError('Conversation not found', 404);
    }

    const historyMessages = historyAfterUserMessage.messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    // Find the last user message index so we can inject fresh RAG context
    // right before it — this prevents the LLM from trusting stale context
    // from earlier turns.
    let lastUserIndex = -1;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      if (historyMessages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex > 0) {
      historyMessages.splice(lastUserIndex, 0, {
        role: 'system',
        content: buildRagContextPrompt(ragContext),
      });
    }

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT },
      ...(lastUserIndex <= 0
        ? [
            { role: 'system' as const, content: buildRagContextPrompt(ragContext) },
            ...historyMessages,
          ]
        : historyMessages),
    ];

    const response = await getLLMGateway().chat(llmMessages, onToken);
    const sources: IConversationSource[] = retrieved.map((item) => ({
      serviceId: item.serviceId,
      shortName: item.shortName,
      title: item.title,
      score: item.score,
    }));

    await this.conversationManager.addMessage(activeConversationId, {
      role: 'assistant',
      content: response,
      sources,
    });

    return { conversationId: activeConversationId, sources };
  }
}
