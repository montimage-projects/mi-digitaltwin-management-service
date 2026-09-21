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
      // Only the generator is swapped; retrieval + embeddings stay on Ollama.
      const generationPromise =
        this.config.chatProvider === 'openai'
          ? this.chatOpenAI(messages, onToken)
          : this.chatOllama(messages, onToken);

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('LLM chat timed out after 120 seconds'));
        }, timeoutMs);
      });

      return await Promise.race([generationPromise, timeoutPromise]);
    } catch (error) {
      logger.error('LLMGateway chat request failed', {
        provider: this.config.chatProvider,
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

  /** Local Ollama chat generation (the default Boss Agent path). */
  private async chatOllama(
    messages: ChatMessage[],
    onToken?: (token: string) => void
  ): Promise<string> {
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
      onToken?.(token);
    }

    return fullResponse;
  }

  /**
   * OpenAI-compatible chat generation (OpenRouter or any /v1 endpoint), used to
   * compare the Boss Agent against hosted frontier models. Streams the response
   * so the SSE token flow to the client is identical to the Ollama path.
   */
  private async chatOpenAI(
    messages: ChatMessage[],
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.config.chatApiKey) {
      throw new Error('CHAT_API_KEY is required when CHAT_PROVIDER=openai');
    }

    const response = await fetch(`${this.config.chatBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.chatApiKey}`,
        // Optional OpenRouter attribution headers (ignored by other providers).
        'HTTP-Referer': 'https://montimage.com',
        'X-Title': 'SecSim Boss Agent',
      },
      body: JSON.stringify({
        model: this.config.chatModel,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.numPredict,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `OpenAI-compatible chat failed: ${response.status} ${response.statusText} ${detail}`.trim()
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    // Parse the SSE stream: lines beginning with `data:` carry JSON chunks,
    // terminated by `data: [DONE]`. Comment/keepalive lines are ignored.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === '' || data === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const token = parsed.choices?.[0]?.delta?.content ?? '';
          if (token) {
            fullResponse += token;
            onToken?.(token);
          }
        } catch {
          // Ignore partial/keepalive frames; the next chunk completes them.
        }
      }
    }

    return fullResponse;
  }

  /**
   * Generate an embedding vector for the given text.
   *
   * For asymmetric embedding models such as nomic-embed-text v1.5, callers
   * should pass an appropriate `task` so the model produces task-aligned
   * embeddings. Recognised values include `search_document` (for indexed
   * passages), `search_query` (for retrieval queries), `classification`,
   * and `clustering`. Models that ignore the prefix are unaffected.
   */
  async embed(text: string, task?: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty text');
    }

    const input = task ? `${task}: ${trimmed}` : trimmed;

    try {
      const response = await this.client.embed({
        model: this.config.embedModel,
        input,
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

      // For the openai provider the chat model is remote (not in the local
      // Ollama list), so gate it on having credentials + a model id instead.
      const chatModelAvailable =
        this.config.chatProvider === 'openai'
          ? Boolean(this.config.chatApiKey && this.config.chatModel)
          : modelExists(this.config.chatModel, availableModels);
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
