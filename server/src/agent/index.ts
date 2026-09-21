import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { LLMGateway } from './llm-gateway.js';
import { MongoVectorStore } from './stores/mongo-vector-store.js';
import { QdrantVectorStore } from './stores/qdrant-vector-store.js';
import type { AgentConfig } from './types.js';
import type { VectorStore } from './vector-store.js';
import { RAGRetriever, IntentClassifier } from './rag-retriever.js';

let gatewayInstance: LLMGateway | null = null;
let vectorStoreInstance: VectorStore | null = null;
let ragRetrieverInstance: RAGRetriever | null = null;
let intentClassifierInstance: IntentClassifier | null = null;
let healthCheckTriggered = false;

function getAgentConfig(): AgentConfig {
  return {
    chatProvider: env.CHAT_PROVIDER,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    chatBaseUrl: env.CHAT_BASE_URL,
    chatApiKey: env.CHAT_API_KEY,
    // For the openai provider the model must come from CHAT_MODEL; for ollama
    // it falls back to OLLAMA_MODEL so the default path is unchanged.
    chatModel: env.CHAT_MODEL || env.OLLAMA_MODEL,
    embedModel: env.OLLAMA_EMBED_MODEL,
    numPredict: env.OLLAMA_NUM_PREDICT,
    numCtx: env.OLLAMA_NUM_CTX,
    temperature: env.OLLAMA_TEMPERATURE,
    vectorDbType: env.VECTOR_DB_TYPE,
  };
}

export function getLLMGateway(): LLMGateway {
  if (!gatewayInstance) {
    gatewayInstance = new LLMGateway(getAgentConfig());
  }

  if (!healthCheckTriggered) {
    healthCheckTriggered = true;
    gatewayInstance
      .healthCheck()
      .then((health) => {
        logger.info('LLM gateway initialized', {
          status: health.status,
          chatProvider: env.CHAT_PROVIDER,
          chatHost: env.CHAT_PROVIDER === 'openai' ? env.CHAT_BASE_URL : env.OLLAMA_BASE_URL,
          chatModel: env.CHAT_MODEL || env.OLLAMA_MODEL,
          embedHost: env.OLLAMA_BASE_URL,
          embedModel: env.OLLAMA_EMBED_MODEL,
          availableModels: health.availableModels,
        });
      })
      .catch((error) => {
        logger.warn('LLM gateway health check failed on initialization', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  return gatewayInstance;
}

export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance =
      env.VECTOR_DB_TYPE === 'qdrant' ? new QdrantVectorStore() : new MongoVectorStore();
  }

  return vectorStoreInstance;
}

export function getRAGRetriever(): RAGRetriever {
  if (!ragRetrieverInstance) {
    ragRetrieverInstance = new RAGRetriever(getLLMGateway(), getVectorStore());
  }

  return ragRetrieverInstance;
}

export function getIntentClassifier(): IntentClassifier {
  if (!intentClassifierInstance) {
    intentClassifierInstance = new IntentClassifier(getLLMGateway());
  }

  return intentClassifierInstance;
}
