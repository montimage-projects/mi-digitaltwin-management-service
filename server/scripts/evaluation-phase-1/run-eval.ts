/*
 * Evaluation harness for the Boss Agent.
 *
 * For each question in questions.json, sends it to /api/agent/chat twice
 * (once with RAG enabled, once disabled), parses the SSE stream, and writes
 * one CSV row per (question, config, repetition). The CSV can then be opened
 * in a spreadsheet for manual grading.
 *
 * Run with:
 *   bun server/scripts/evaluation/run-eval.ts \
 *     [--base-url=http://localhost:3000] \
 *     [--username=admin] [--password=intact2025] \
 *     [--reps=1] \
 *     [--out=server/scripts/evaluation/results/raw_results_<ts>.csv] \
 *     [--warmup=true] \
 *     [--cleanup=true] \
 *     [--only=F1,F2,...]
 *     [--configs=RAG,COLD]   (subset of configs to run; default both)
 *     [--questions=questions.json]  (question file, relative to this script)
 *
 * When --reps > 1, the script writes one CSV per repetition, suffixed
 * with _rep1, _rep2, ... so they can be compared independently. Each
 * repetition does a complete sweep over all questions × both configs
 * before moving on to the next repetition.
 *
 * Environment variables override defaults: EVAL_BASE_URL, EVAL_USERNAME, EVAL_PASSWORD.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Question {
  id: string;
  category: 'factual' | 'comparative' | 'adversarial' | 'casual' | 'memory';
  question: string;
  // Memory questions: this turn is sent first in the same conversation, and
  // only the answer to `question` (the second turn) is recorded.
  setup?: string;
  expectedIntent: 'service' | 'casual';
}

interface SseSource {
  serviceId: string;
  shortName: string;
  title: string;
  score: number;
}

interface ChatRunResult {
  answer: string;
  sources: SseSource[];
  conversationId: string | null;
  latencyMs: number;
  error: string | null;
}

interface CliArgs {
  baseUrl: string;
  username: string;
  password: string;
  reps: number;
  outPath: string;
  warmup: boolean;
  cleanup: boolean;
  only: string[] | null;
  // useRag values to run, from --configs=RAG,COLD (default both)
  configs: boolean[];
  questionsFile: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string, def: string) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`));
    if (arg) return arg.slice(name.length + 3);
    const env = process.env[`EVAL_${name.toUpperCase().replace(/-/g, '_')}`];
    return env ?? def;
  };
  const bool = (v: string) => v === 'true' || v === '1';

  const tsStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOut = join(__dirname, 'results', `raw_results_${tsStamp}.csv`);

  const only = get('only', '').trim();
  const configs = get('configs', 'RAG,COLD')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c === 'RAG' || c === 'COLD')
    .map((c) => c === 'RAG');
  return {
    baseUrl: get('base-url', 'http://localhost:3000'),
    username: get('username', 'admin'),
    password: get('password', 'intact2025'),
    reps: Number(get('reps', '1')),
    outPath: get('out', defaultOut),
    warmup: bool(get('warmup', 'true')),
    cleanup: bool(get('cleanup', 'true')),
    only: only.length > 0 ? only.split(',').map((s) => s.trim()) : null,
    configs: configs.length > 0 ? configs : [true, false],
    questionsFile: get('questions', 'questions.json'),
  };
}

async function login(args: CliArgs): Promise<string> {
  const response = await fetch(`${args.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: args.username, password: args.password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { token?: string };
  if (!json.token) {
    throw new Error(`Login response missing token`);
  }
  return json.token;
}

/**
 * Send one chat request and parse the SSE stream until 'done' or 'error'.
 * Returns the final assembled answer and metadata.
 */
async function sendChat(
  args: CliArgs,
  token: string,
  question: string,
  useRag: boolean,
  conversationId?: string
): Promise<ChatRunResult> {
  const start = Date.now();
  const result: ChatRunResult = {
    answer: '',
    sources: [],
    conversationId: null,
    latencyMs: 0,
    error: null,
  };

  let response: Response;
  try {
    response = await fetch(`${args.baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message: question, useRag, conversationId }),
    });
  } catch (err) {
    result.error = (err as Error).message;
    result.latencyMs = Date.now() - start;
    return result;
  }

  if (!response.ok || !response.body) {
    result.error = `HTTP ${response.status}: ${await response.text()}`;
    result.latencyMs = Date.now() - start;
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. Process complete frames.
    let separatorIdx;
    while ((separatorIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawFrame = buffer.slice(0, separatorIdx);
      buffer = buffer.slice(separatorIdx + 2);
      const eventLine = rawFrame.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = rawFrame.split('\n').find((l) => l.startsWith('data:'));
      if (!eventLine || !dataLine) continue;
      const eventType = eventLine.slice('event:'.length).trim();
      const payload = JSON.parse(dataLine.slice('data:'.length).trim());

      switch (eventType) {
        case 'metadata':
          result.conversationId = payload.conversationId ?? null;
          break;
        case 'token':
          result.answer += payload.content ?? '';
          break;
        case 'sources':
          // Backend emits sources as a bare array (see agent.routes.ts).
          if (Array.isArray(payload)) {
            result.sources = payload as SseSource[];
          }
          break;
        case 'error':
          result.error = payload.message ?? 'Stream error';
          break outer;
        case 'done':
          break outer;
      }
    }
  }

  result.latencyMs = Date.now() - start;
  return result;
}

async function deleteConversation(
  args: CliArgs,
  token: string,
  conversationId: string
): Promise<void> {
  try {
    await fetch(`${args.baseUrl}/api/agent/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort cleanup; ignore failures
  }
}

/**
 * RAG mode was effectively used when sources are non-empty. When the
 * intent classifier rules a query "casual", retrieval is skipped and
 * sources will be empty. We use this signal to derive a predicted intent.
 */
function predictedIntent(useRag: boolean, sources: SseSource[]): 'casual' | 'service' | 'rag-off' {
  if (!useRag) return 'rag-off';
  return sources.length > 0 ? 'service' : 'casual';
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[eval] base URL : ${args.baseUrl}`);
  console.log(`[eval] reps     : ${args.reps}`);
  console.log(`[eval] output   : ${args.outPath}`);
  if (args.only) console.log(`[eval] only     : ${args.only.join(',')}`);

  const questionsPath = resolve(__dirname, args.questionsFile);
  const rawQuestions = JSON.parse(await readFile(questionsPath, 'utf-8')) as Question[];
  const questions = args.only
    ? rawQuestions.filter((q) => args.only!.includes(q.id))
    : rawQuestions;
  console.log(`[eval] loaded ${questions.length} question(s)`);

  console.log(`[eval] logging in as ${args.username}…`);
  const token = await login(args);
  console.log(`[eval] login OK`);

  if (args.warmup) {
    console.log(`[eval] warm-up (loads models, ignored in results)…`);
    await sendChat(args, token, 'What does MMT do?', true);
    await sendChat(args, token, 'Hello', false);
    console.log(`[eval] warm-up done`);
  }

  const header = [
    'id',
    'category',
    'expected_intent',
    'config',
    'rep',
    'predicted_intent',
    'latency_ms',
    'sources_count',
    'top_source_ids',
    'top_source_scores',
    'answer_length',
    'answer',
    'error',
  ].join(',');

  const conversationsToClean: string[] = [];

  /**
   * Resolve the output path for a given repetition. When reps == 1 we keep the
   * configured path unchanged; when reps > 1 we suffix each file with _repN
   * so they can be compared side-by-side.
   */
  const pathForRep = (rep: number): string => {
    if (args.reps === 1) return args.outPath;
    const dot = args.outPath.lastIndexOf('.');
    if (dot === -1) return `${args.outPath}_rep${rep}`;
    return `${args.outPath.slice(0, dot)}_rep${rep}${args.outPath.slice(dot)}`;
  };

  await ensureDir(args.outPath);

  const totalRuns = questions.length * args.configs.length * args.reps;
  let counter = 0;

  // Outer loop is repetition so that each output CSV is one complete sweep of
  // every (question × config). This makes the files directly comparable.
  for (let rep = 1; rep <= args.reps; rep++) {
    const repPath = pathForRep(rep);
    const lines: string[] = [header];
    await writeFile(repPath, lines.join('\n') + '\n');
    console.log(`\n[eval] === repetition ${rep}/${args.reps} → ${repPath} ===`);

    for (const q of questions) {
      for (const useRag of args.configs) {
        const configLabel = useRag ? 'RAG' : 'COLD';
        counter++;
        process.stdout.write(
          `[eval] (${counter}/${totalRuns}) ${q.id} ${configLabel} rep=${rep}…`
        );
        let setupConversationId: string | undefined;
        let setupError: string | null = null;
        if (q.setup) {
          const setup = await sendChat(args, token, q.setup, useRag);
          setupConversationId = setup.conversationId ?? undefined;
          setupError = setup.error ?? (setupConversationId ? null : 'setup turn: no conversationId');
        }
        const r = setupError
          ? { answer: '', sources: [], conversationId: setupConversationId ?? null, latencyMs: 0, error: `setup turn failed: ${setupError}` }
          : await sendChat(args, token, q.question, useRag, setupConversationId);
        if (r.conversationId) conversationsToClean.push(r.conversationId);
        const intent = predictedIntent(useRag, r.sources);
        const topIds = r.sources.map((s) => s.shortName).join('|');
        const topScores = r.sources.map((s) => s.score.toFixed(3)).join('|');
        lines.push(
          [
            q.id,
            q.category,
            q.expectedIntent,
            configLabel,
            rep,
            intent,
            r.latencyMs,
            r.sources.length,
            topIds,
            topScores,
            r.answer.length,
            r.answer,
            r.error ?? '',
          ]
            .map(csvEscape)
            .join(',')
        );
        process.stdout.write(
          ` done in ${(r.latencyMs / 1000).toFixed(1)}s${r.error ? ` (ERROR: ${r.error})` : ''}\n`
        );
        // Flush incrementally so a crash mid-run doesn't lose this rep.
        await writeFile(repPath, lines.join('\n') + '\n');
      }
    }

    console.log(`[eval] repetition ${rep} done (${lines.length - 1} rows in ${repPath})`);
  }

  if (args.cleanup && conversationsToClean.length > 0) {
    console.log(`[eval] cleaning up ${conversationsToClean.length} conversations…`);
    for (const cid of conversationsToClean) {
      await deleteConversation(args, token, cid);
    }
    console.log(`[eval] cleanup done`);
  }
}

main().catch((err) => {
  console.error('[eval] FATAL:', err);
  process.exit(1);
});
