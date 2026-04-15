import { logger } from '../../utils/logger.js';
import type { VectorMetadata, VectorSearchResult, VectorStore } from '../vector-store.js';

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: VectorMetadata;
}

export class QdrantVectorStore implements VectorStore {
  private readonly baseUrl: string;

  private readonly collectionName: string;

  private vectorSize: number | null = null;

  constructor(
    baseUrl = process.env.QDRANT_URL || 'http://localhost:6333',
    collectionName = 'service_embeddings'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.collectionName = collectionName;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...init,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Qdrant request failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    if (this.vectorSize === vectorSize) {
      return;
    }

    this.vectorSize = vectorSize;
    await this.request(`/collections/${this.collectionName}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      }),
    });
  }

  async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
    await this.ensureCollection(vector.length);

    await this.request(`/collections/${this.collectionName}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({
        points: [
          {
            id,
            vector,
            payload: metadata,
          },
        ],
      }),
    });
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    if (queryVector.length === 0) {
      return [];
    }

    await this.ensureCollection(queryVector.length);

    const result = (await this.request(`/collections/${this.collectionName}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: queryVector,
        limit: Math.max(1, topK),
        with_payload: true,
      }),
    })) as { result: QdrantSearchResult[] };

    return (result.result || []).map((item) => ({
      id: item.id,
      score: item.score,
      metadata: item.payload,
    }));
  }

  async delete(id: string): Promise<void> {
    try {
      await this.request(`/collections/${this.collectionName}/points/delete?wait=true`, {
        method: 'POST',
        body: JSON.stringify({ points: [id] }),
      });
    } catch (error) {
      logger.warn('Qdrant delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async deleteAll(): Promise<void> {
    try {
      await this.request(`/collections/${this.collectionName}`, { method: 'DELETE' });
    } catch (error) {
      logger.warn('Qdrant deleteAll failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.vectorSize = null;
  }
}
