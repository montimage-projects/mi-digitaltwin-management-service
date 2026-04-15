import { ServiceEmbedding } from '../../models/ServiceEmbedding.js';
import { logger } from '../../utils/logger.js';
import type { VectorMetadata, VectorSearchResult, VectorStore } from '../vector-store.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MongoVectorStore implements VectorStore {
  async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
    await ServiceEmbedding.findOneAndUpdate(
      { serviceId: id },
      {
        $set: {
          serviceId: id,
          embedding: vector,
          rawText: metadata.rawText,
          modelName: metadata.modelName,
          shortName: metadata.shortName,
          title: metadata.title,
          provider: metadata.provider,
          category: metadata.category,
          sector: metadata.sector,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    const k = Math.max(1, topK);

    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: 'service_embeddings_vector_idx',
            path: 'embedding',
            queryVector,
            numCandidates: Math.max(k * 10, 20),
            limit: k,
          },
        },
        {
          $project: {
            _id: 0,
            serviceId: 1,
            shortName: 1,
            title: 1,
            provider: 1,
            category: 1,
            sector: 1,
            rawText: 1,
            modelName: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];

      const results = await ServiceEmbedding.aggregate(pipeline);
      return results.map((doc) => ({
        id: String(doc.serviceId),
        score: doc.score,
        metadata: {
          serviceId: String(doc.serviceId),
          shortName: doc.shortName,
          title: doc.title,
          provider: doc.provider,
          category: doc.category,
          sector: doc.sector,
          rawText: doc.rawText,
          modelName: doc.modelName,
        },
      }));
    } catch (error) {
      logger.warn('MongoDB $vectorSearch unavailable; falling back to cosine search', {
        error: error instanceof Error ? error.message : String(error),
      });

      const candidates = await ServiceEmbedding.find({}, { _id: 0 }).lean();

      return candidates
        .map((doc) => ({
          id: String(doc.serviceId),
          score: cosineSimilarity(queryVector, doc.embedding || []),
          metadata: {
            serviceId: String(doc.serviceId),
            shortName: doc.shortName,
            title: doc.title,
            provider: doc.provider,
            category: doc.category,
            sector: doc.sector,
            rawText: doc.rawText,
            modelName: doc.modelName,
          },
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    }
  }

  async delete(id: string): Promise<void> {
    await ServiceEmbedding.deleteOne({ serviceId: id });
  }

  async deleteAll(): Promise<void> {
    await ServiceEmbedding.deleteMany({});
  }
}
