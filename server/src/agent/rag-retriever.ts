import { Types } from 'mongoose';
import { Service } from '../models/Service.js';
import { Category } from '../models/Category.js';
import { Sector } from '../models/Sector.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { LLMGateway } from './llm-gateway.js';
import type { VectorSearchResult, VectorStore } from './vector-store.js';

// ---------------------------------------------------------------------------
// Intent classification via embedding similarity
// Compares user message against two cached reference clusters to decide
// whether to run RAG. Uses the already-loaded embed model — no extra model.
// ---------------------------------------------------------------------------

const SERVICE_QUERY_REFERENCES = [
  'Which services support threat detection?',
  'Tell me about cybersecurity tools for network monitoring.',
  'What services are available for intrusion detection?',
  'Show me tools that work with telecom infrastructure.',
  'Compare the available firewall and filtering solutions.',
  'What does the MMT probe do?',
  'List services from Montimage.',
  'Which tools can I deploy for anomaly detection?',
  'Please tell me about MMT.',
  'Give me information about the probe tool.',
  'What is Suricata used for?',
  'Describe the capabilities of this service.',
];

const CASUAL_REFERENCES = [
  'Hello',
  'Hi there',
  'How are you?',
  'Good morning',
  'Good afternoon',
  'Thank you very much',
  'Thanks a lot',
  'Goodbye',
  'See you later',
  'Nice to meet you',
];

// Minimum margin by which casual must exceed service similarity to skip RAG.
// When the decision is borderline, we default to running RAG.
const CASUAL_MARGIN = 0.08;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class IntentClassifier {
  private serviceVectors: number[][] | null = null;
  private casualVectors: number[][] | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly gateway: LLMGateway) {}

  private async init(): Promise<void> {
    if (this.serviceVectors && this.casualVectors) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      logger.info('IntentClassifier: embedding reference sentences…');
      const [serviceVecs, casualVecs] = await Promise.all([
        Promise.all(SERVICE_QUERY_REFERENCES.map((s) => this.gateway.embed(s))),
        Promise.all(CASUAL_REFERENCES.map((s) => this.gateway.embed(s))),
      ]);
      this.serviceVectors = serviceVecs;
      this.casualVectors = casualVecs;
      logger.info('IntentClassifier: reference embeddings cached.');
    })();

    return this.initPromise;
  }

  async isServiceQuery(message: string): Promise<boolean> {
    try {
      await this.init();
    } catch (error) {
      // If classifier fails, default to running RAG so we don't silently degrade
      logger.warn('IntentClassifier init failed; defaulting to RAG', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    let queryVec: number[];
    try {
      queryVec = await this.gateway.embed(message);
    } catch {
      return true;
    }

    const maxServiceSim = Math.max(
      ...this.serviceVectors!.map((v) => cosineSimilarity(queryVec, v))
    );
    const maxCasualSim = Math.max(...this.casualVectors!.map((v) => cosineSimilarity(queryVec, v)));

    // Only skip RAG if casual wins by a comfortable margin — when borderline,
    // default to running RAG so we don't silently miss relevant services.
    const isService = maxCasualSim < maxServiceSim + CASUAL_MARGIN;
    logger.debug('IntentClassifier result', {
      message,
      maxServiceSim: maxServiceSim.toFixed(3),
      maxCasualSim: maxCasualSim.toFixed(3),
      margin: (maxCasualSim - maxServiceSim).toFixed(3),
      isService,
    });
    return isService;
  }
}

interface ServiceDoc {
  _id: Types.ObjectId;
  shortName: string;
  title: string;
  categoryId: Types.ObjectId;
  sectorId?: Types.ObjectId;
  provider: string;
  description?: string;
  type: string;
  uiType: string;
  trl: {
    current?: number;
    expected?: number;
  };
  license?: string;
  standards: string[];
  inputs: Array<{ name: string; description?: string; format?: string }>;
  outputs: Array<{ name: string; description?: string; format?: string }>;
  interactsWith: string[];
  potentialUseCases: string[];
  versions: Array<{ dockerImage: string }>;
}

export interface RetrievedService {
  serviceId: string;
  shortName: string;
  title: string;
  provider: string;
  category?: string;
  sector?: string;
  score: number;
  rawText: string;
}

interface BuildTextContext {
  categoryMap: Map<string, string>;
  sectorMap: Map<string, string>;
}

function cleanText(value: string | undefined): string {
  return (value || '').trim();
}

function nonEmpty(values: Array<string | undefined>): string[] {
  return values.map((value) => cleanText(value)).filter(Boolean);
}

export class RAGRetriever {
  constructor(
    private readonly gateway: LLMGateway,
    private readonly vectorStore: VectorStore
  ) {}

  private async getLookupMaps(): Promise<BuildTextContext> {
    const [categories, sectors] = await Promise.all([
      Category.find({}, { _id: 1, name: 1 }).lean(),
      Sector.find({}, { _id: 1, name: 1 }).lean(),
    ]);

    const categoryMap = new Map<string, string>();
    for (const category of categories) {
      categoryMap.set(String(category._id), category.name);
    }

    const sectorMap = new Map<string, string>();
    for (const sector of sectors) {
      sectorMap.set(String(sector._id), sector.name);
    }

    return { categoryMap, sectorMap };
  }

  private buildServiceText(service: ServiceDoc, context: BuildTextContext): string {
    const categoryName = context.categoryMap.get(String(service.categoryId));
    const sectorName = service.sectorId
      ? context.sectorMap.get(String(service.sectorId))
      : undefined;

    const lines: string[] = [];
    lines.push(`shortName: ${service.shortName}`);
    lines.push(`title: ${service.title}`);
    lines.push(`provider: ${service.provider}`);

    if (categoryName) {
      lines.push(`category: ${categoryName}`);
    }
    if (sectorName) {
      lines.push(`sector: ${sectorName}`);
    }

    const description = cleanText(service.description);
    if (description) {
      lines.push(`description: ${description}`);
    }

    lines.push(`type: ${service.type}`);
    lines.push(`uiType: ${service.uiType}`);

    if (service.trl.current !== undefined || service.trl.expected !== undefined) {
      lines.push(
        `trl: current=${service.trl.current ?? 'n/a'}, expected=${service.trl.expected ?? 'n/a'}`
      );
    }

    const license = cleanText(service.license);
    if (license) {
      lines.push(`license: ${license}`);
    }

    const standards = nonEmpty(service.standards || []);
    if (standards.length > 0) {
      lines.push(`standards: ${standards.join(', ')}`);
    }

    const inputs = (service.inputs || []).map((input) => {
      const parts = nonEmpty([input.name, input.description, input.format]);
      return parts.join(' | ');
    });
    if (inputs.length > 0) {
      lines.push(`inputs: ${inputs.join('; ')}`);
    }

    const outputs = (service.outputs || []).map((output) => {
      const parts = nonEmpty([output.name, output.description, output.format]);
      return parts.join(' | ');
    });
    if (outputs.length > 0) {
      lines.push(`outputs: ${outputs.join('; ')}`);
    }

    const interactsWith = nonEmpty(service.interactsWith || []);
    if (interactsWith.length > 0) {
      lines.push(`interactsWith: ${interactsWith.join(', ')}`);
    }

    const useCases = nonEmpty(service.potentialUseCases || []);
    if (useCases.length > 0) {
      lines.push(`potentialUseCases: ${useCases.join(' | ')}`);
    }

    const dockerImages = (service.versions || []).map((version) => cleanText(version.dockerImage));
    const nonEmptyImages = dockerImages.filter(Boolean);
    if (nonEmptyImages.length > 0) {
      lines.push(`dockerImages: ${nonEmptyImages.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Build the text that will be embedded into the vector store. This is
   * intentionally a different text from `buildServiceText` (which feeds the
   * LLM as context). Two differences matter for retrieval quality:
   *
   *   1. The service's own identity (shortName, title, provider, category)
   *      is front-loaded as a natural-language sentence, so the embedding
   *      is heavily weighted toward "what is this service?".
   *
   *   2. Cross-reference fields are omitted — in particular `interactsWith`,
   *      which lists *other* services' shortnames. Including them dilutes
   *      the embedding by making every service that interacts with X look
   *      like a partial match for queries about X. Cross-references remain
   *      in `buildServiceText` so the LLM still sees them at answer time.
   */
  private buildEmbeddingText(service: ServiceDoc, context: BuildTextContext): string {
    const categoryName = context.categoryMap.get(String(service.categoryId));
    const sectorName = service.sectorId
      ? context.sectorMap.get(String(service.sectorId))
      : undefined;

    const description = cleanText(service.description);
    const license = cleanText(service.license);
    const standards = nonEmpty(service.standards || []);
    const inputs = (service.inputs || [])
      .map((input) => nonEmpty([input.name, input.description]).join(' '))
      .filter(Boolean);
    const outputs = (service.outputs || [])
      .map((output) => nonEmpty([output.name, output.description]).join(' '))
      .filter(Boolean);
    const useCases = nonEmpty(service.potentialUseCases || []);

    // Front-load the identity. The opening sentence states what the service
    // *is* — shortName, title, provider, category — using natural language.
    const identityParts: string[] = [];
    identityParts.push(`${service.shortName}, the ${service.title}`);
    identityParts.push(`provided by ${service.provider}`);
    if (categoryName) identityParts.push(`in the ${categoryName} category`);
    if (sectorName) identityParts.push(`for the ${sectorName} sector`);
    const identitySentence = `${identityParts.join(', ')}.`;

    const sentences: string[] = [identitySentence];

    if (description) {
      sentences.push(description.endsWith('.') ? description : `${description}.`);
    }

    const typeParts = [`Type: ${service.type}.`];
    if (license) typeParts.push(`License: ${license}.`);
    sentences.push(typeParts.join(' '));

    if (standards.length > 0) {
      sentences.push(`Supports the ${standards.join(', ')} standards.`);
    }
    if (inputs.length > 0) {
      sentences.push(`Inputs: ${inputs.join('; ')}.`);
    }
    if (outputs.length > 0) {
      sentences.push(`Outputs: ${outputs.join('; ')}.`);
    }
    if (useCases.length > 0) {
      sentences.push(`Used for ${useCases.join(', ')}.`);
    }

    return sentences.join(' ');
  }

  async indexService(service: ServiceDoc): Promise<void> {
    const context = await this.getLookupMaps();
    const rawText = this.buildServiceText(service, context);

    if (!rawText.trim()) {
      logger.warn('Skipping service indexing with empty text', {
        serviceId: String(service._id),
        shortName: service.shortName,
      });
      return;
    }

    const categoryName = context.categoryMap.get(String(service.categoryId));
    const sectorName = service.sectorId
      ? context.sectorMap.get(String(service.sectorId))
      : undefined;

    // The text fed to the embedding model is intentionally different from the
    // rawText shown to the LLM: it is a focused natural-language description
    // optimised for retrieval discrimination (see `buildEmbeddingText`).
    // 'search_document' is the asymmetric-retrieval task prefix expected by
    // nomic-embed-text for indexed passages. Models that ignore the prefix
    // are unaffected.
    const embeddingText = this.buildEmbeddingText(service, context);
    const embedding = await this.gateway.embed(embeddingText, 'search_document');
    await this.vectorStore.upsert(String(service._id), embedding, {
      serviceId: String(service._id),
      shortName: service.shortName,
      title: service.title,
      provider: service.provider,
      category: categoryName,
      sector: sectorName,
      rawText,
      modelName: env.OLLAMA_EMBED_MODEL,
    });
  }

  async reindexAll(): Promise<{ indexed: number; duration: number }> {
    const startedAt = Date.now();
    const services = (await Service.find({}).lean()) as unknown as ServiceDoc[];

    await this.vectorStore.deleteAll();

    let indexed = 0;
    for (const service of services) {
      try {
        await this.indexService(service);
        indexed += 1;
      } catch (error) {
        logger.warn('Failed to index service during reindexAll', {
          serviceId: String(service._id),
          shortName: service.shortName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      indexed,
      duration: Date.now() - startedAt,
    };
  }

  async canIndexEmbeddings(): Promise<{ ready: boolean; reason?: string }> {
    const health = await this.gateway.healthCheck();
    if (!health.ollamaReachable) {
      return { ready: false, reason: 'Ollama is unreachable' };
    }
    if (!health.embedModelAvailable) {
      return {
        ready: false,
        reason: `Embedding model ${env.OLLAMA_EMBED_MODEL} is not available`,
      };
    }

    return { ready: true };
  }

  async retrieveSimilar(query: string, topK = 5): Promise<RetrievedService[]> {
    const queryText = query.trim();
    if (!queryText) {
      return [];
    }

    // 'search_query' is the matching retrieval-time prefix for nomic-embed-text;
    // it pairs with the 'search_document' prefix used at indexing time.
    const queryVector = await this.gateway.embed(queryText, 'search_query');
    const results = await this.vectorStore.search(queryVector, topK);
    return results.map((result) => this.mapResult(result));
  }

  formatContextForPrompt(services: RetrievedService[]): string {
    if (services.length === 0) {
      return 'No relevant services were retrieved from the catalog.';
    }

    return services
      .map((service, index) => {
        const header = `[${index + 1}] ${service.shortName} - ${service.title} (score=${service.score.toFixed(3)})`;
        const details = [
          `provider: ${service.provider}`,
          service.category ? `category: ${service.category}` : undefined,
          service.sector ? `sector: ${service.sector}` : undefined,
        ]
          .filter(Boolean)
          .join(' | ');

        const evidence =
          service.rawText.length > 1200 ? `${service.rawText.slice(0, 1197)}...` : service.rawText;

        return `${header}\n${details}\n${evidence}`;
      })
      .join('\n\n');
  }

  private mapResult(result: VectorSearchResult): RetrievedService {
    return {
      serviceId: result.metadata.serviceId,
      shortName: result.metadata.shortName,
      title: result.metadata.title,
      provider: result.metadata.provider,
      category: result.metadata.category,
      sector: result.metadata.sector,
      score: result.score,
      rawText: result.metadata.rawText,
    };
  }

  async indexServiceById(serviceId: string): Promise<void> {
    const service = (await Service.findById(serviceId).lean()) as unknown as ServiceDoc | null;
    if (!service) {
      return;
    }

    await this.indexService(service);
  }

  /**
   * Drop a service's embedding from the vector store so a deleted service can
   * no longer be retrieved by the Boss Agent. Called after the service is
   * removed from the catalog (the service row is already gone at this point,
   * so we key off the id rather than re-loading it).
   */
  async removeServiceById(serviceId: string): Promise<void> {
    await this.vectorStore.delete(serviceId);
  }
}
