export interface VectorMetadata {
  serviceId: string;
  shortName: string;
  title: string;
  provider: string;
  category?: string;
  sector?: string;
  rawText: string;
  modelName: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorStore {
  upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void>;
  search(queryVector: number[], topK: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}
