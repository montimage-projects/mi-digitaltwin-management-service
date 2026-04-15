import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { LLMGateway } from './llm-gateway.js';
import { MongoVectorStore } from './stores/mongo-vector-store.js';
import { QdrantVectorStore } from './stores/qdrant-vector-store.js';
import type { AgentConfig } from './types.js';
import type { VectorStore } from './vector-store.js';
import { RAGRetriever } from './rag-retriever.js';

let gatewayInstance: LLMGateway | null = null;
let vectorStoreInstance: VectorStore | null = null;
let ragRetrieverInstance: RAGRetriever | null = null;
let healthCheckTriggered = false;

function getAgentConfig(): AgentConfig {
  return {
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    chatModel: env.OLLAMA_MODEL,
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
          host: env.OLLAMA_BASE_URL,
          chatModel: env.OLLAMA_MODEL,
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
