import { getRAGRetriever } from '../agent/index.js';

export async function seedEmbeddings(): Promise<void> {
  console.info('Generating service embeddings...');

  const retriever = getRAGRetriever();
  const readiness = await retriever.canIndexEmbeddings();
  if (!readiness.ready) {
    console.warn(`Skipping embeddings seed: ${readiness.reason}`);
    return;
  }

  const result = await retriever.reindexAll();
  console.info(`Embeddings generated for ${result.indexed} services in ${result.duration}ms`);
}
