import type { IConversationSource } from '../models/Conversation.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { ConversationManager } from './conversation-manager.js';
import { getRAGRetriever, getLLMGateway, getIntentClassifier } from './index.js';
import {
  BOSS_AGENT_SYSTEM_PROMPT,
  EMPTY_ANSWER_FALLBACK,
  buildRagContextPrompt,
} from './prompts.js';
import type { ChatMessage } from './types.js';

export interface ChatResult {
  conversationId: string;
  sources: IConversationSource[];
}

export interface ChatOptions {
  // When false, skip intent classification + retrieval entirely. Used by the
  // evaluation harness to produce a Cold-LLM baseline (same model, same prompt
  // scaffold, no retrieved context).
  useRag?: boolean;
  // Where to place the freshly retrieved RAG context in the prompt:
  //   'pre-user' (default) — inject as a system message immediately before
  //                          the most recent user turn so the LLM cannot
  //                          anchor on earlier turns' (possibly stale) context.
  //   'static'             — inject only as a top-level system message after
  //                          the boss-agent prompt; reproduces the pre-fix
  //                          behaviour used as the ablation baseline.
  injectionScheme?: 'pre-user' | 'static';
}

export class AgentService {
  constructor(private readonly conversationManager: ConversationManager) {}

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    onToken?: (token: string) => void,
    options: ChatOptions = {}
  ): Promise<ChatResult> {
    const useRag = options.useRag !== false;
    const injectionScheme = options.injectionScheme ?? 'pre-user';
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
    if (useRag) {
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

    let llmMessages: ChatMessage[];
    if (injectionScheme === 'static' || lastUserIndex <= 0) {
      // Static placement: the freshly retrieved context is appended as a
      // top-level system message after the boss-agent system prompt. This is
      // also the only sensible placement when the conversation contains a
      // single user turn (lastUserIndex <= 0).
      llmMessages = [
        { role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT },
        { role: 'system', content: buildRagContextPrompt(ragContext) },
        ...historyMessages,
      ];
    } else {
      // Pre-user placement (default): splice the context immediately before
      // the most recent user message so the LLM cannot anchor on stale
      // context from earlier turns.
      historyMessages.splice(lastUserIndex, 0, {
        role: 'system',
        content: buildRagContextPrompt(ragContext),
      });
      llmMessages = [{ role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT }, ...historyMessages];
    }

    let response = await getLLMGateway().chat(llmMessages, onToken);
    if (!response.trim()) {
      logger.warn('LLM returned an empty answer; sending fallback message', {
        conversationId: activeConversationId,
      });
      response = EMPTY_ANSWER_FALLBACK;
      onToken?.(response);
    }
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
