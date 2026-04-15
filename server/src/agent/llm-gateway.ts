import { Ollama } from 'ollama';
import { logger } from '../utils/logger.js';
import type { AgentConfig, ChatMessage, GatewayHealthStatus } from './types.js';

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

function modelExists(requestedModel: string, availableModels: string[]): boolean {
  const requested = normalizeModelName(requestedModel);
  const requestedBase = requested.split(':')[0];

  return availableModels.some((modelName) => {
    const normalized = normalizeModelName(modelName);
    const normalizedBase = normalized.split(':')[0];
    return normalized === requested || normalizedBase === requestedBase;
  });
}

export class LLMGateway {
  private readonly client: Ollama;

  private readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Ollama({ host: config.ollamaBaseUrl });
  }

  async chat(messages: ChatMessage[], onToken?: (token: string) => void): Promise<string> {
    const timeoutMs = 120_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      const generationPromise = (async () => {
        const response = await this.client.chat({
          model: this.config.chatModel,
          messages,
          options: {
            num_predict: this.config.numPredict,
            num_ctx: this.config.numCtx,
            temperature: this.config.temperature,
          },
          stream: true,
        });

        let fullResponse = '';

        for await (const part of response) {
          const token = part.message?.content ?? '';
          if (!token) {
            continue;
          }
          fullResponse += token;
          if (onToken) {
            onToken(token);
          }
        }

        return fullResponse;
      })();

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('LLM chat timed out after 120 seconds'));
        }, timeoutMs);
      });

      return await Promise.race([generationPromise, timeoutPromise]);
    } catch (error) {
      logger.error('LLMGateway chat request failed', {
        model: this.config.chatModel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty text');
    }

    try {
      const response = await this.client.embed({
        model: this.config.embedModel,
        input: trimmed,
      });

      const vector = response.embeddings[0];
      if (!vector) {
        throw new Error('Embedding response did not contain vectors');
      }

      return vector;
    } catch (error) {
      logger.error('LLMGateway embedding request failed', {
        model: this.config.embedModel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    try {
      const modelList = await this.client.list();
      const availableModels = modelList.models.map((model) => model.name);

      const chatModelAvailable = modelExists(this.config.chatModel, availableModels);
      const embedModelAvailable = modelExists(this.config.embedModel, availableModels);

      const status: GatewayHealthStatus['status'] =
        chatModelAvailable && embedModelAvailable
          ? 'healthy'
          : chatModelAvailable || embedModelAvailable
            ? 'degraded'
            : 'offline';

      return {
        status,
        ollamaReachable: true,
        chatModelAvailable,
        embedModelAvailable,
        availableModels,
        error:
          status === 'healthy'
            ? undefined
            : `Model availability issue. chat=${chatModelAvailable}, embed=${embedModelAvailable}`,
      };
    } catch (error) {
      logger.warn('LLMGateway health check failed', {
        host: this.config.ollamaBaseUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        status: 'offline',
        ollamaReachable: false,
        chatModelAvailable: false,
        embedModelAvailable: false,
        availableModels: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
