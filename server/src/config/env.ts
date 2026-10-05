import { z } from 'zod';

/**
 * Passwords that must never be accepted for the seeded admin user.
 * Compared case-insensitively against ADMIN_PASSWORD before seeding.
 */
export const DEFAULT_ADMIN_PASSWORDS = ['intact2025', 'admin', 'password'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  SERVE_STATIC: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/intact'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be at least 16 characters'),
  MAESTRO_BASE_URL: z.string().url().default('https://maestro.intact-project.eu'),
  BRANDING_PROFILE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['default', 'intact', 'secassured']).default('default')
  ),
  APP_NAME: z.string().optional(),
  ORG_NAME: z.string().optional(),
  ORG_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  // Boss Agent / RAG (local LLM via Ollama)
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:14b'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_NUM_PREDICT: z.string().default('384').transform(Number),
  OLLAMA_NUM_CTX: z.string().default('4096').transform(Number),
  OLLAMA_TEMPERATURE: z.string().default('0.2').transform(Number),
  VECTOR_DB_TYPE: z.enum(['mongodb', 'qdrant']).default('mongodb'),
  // Chat generator provider. 'ollama' (default) uses OLLAMA_MODEL on
  // OLLAMA_BASE_URL; 'openai' uses any OpenAI-compatible endpoint
  // (CHAT_BASE_URL, e.g. the office vLLM) for chat only — embeddings always
  // stay on Ollama so retrieval is held constant.
  CHAT_PROVIDER: z.enum(['ollama', 'openai']).default('ollama'),
  CHAT_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  CHAT_API_KEY: z.string().default(''),
  // Empty falls back to OLLAMA_MODEL (so the default ollama path is unchanged).
  CHAT_MODEL: z.string().default(''),
  // Disable reasoning on OpenAI-compatible Qwen3 servers (vLLM
  // chat_template_kwargs.enable_thinking=false); otherwise the thinking
  // consumes max_tokens and answers can come back empty.
  CHAT_DISABLE_THINKING: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  // Monitor agent: small model for incident triage (empty = the chat model),
  // log polling interval, and the quiet gap that closes an incident.
  MONITOR_MODEL: z.string().default(''),
  MONITOR_POLL_MS: z.string().default('2000').transform(Number),
  // Give the triage model the rule's reference MITRE technique (default). 'false'
  // is the ablation: the model must map the MMT cause to ATT&CK on its own.
  MONITOR_TRIAGE_REFERENCE: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  MONITOR_INCIDENT_GAP_MS: z.string().default('30000').transform(Number),
  /** Serve Prometheus metrics at `GET /metrics` (default on). */
  METRICS_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  /** When set, `/metrics` requires `Authorization: Bearer <METRICS_TOKEN>`. */
  // gitleaks:allow — variable name, not a credential
  METRICS_TOKEN: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(16, 'METRICS_TOKEN must be at least 16 characters').optional()
  ),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Environment validation failed — fix the variables above and restart');
  }

  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
