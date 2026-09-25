/*
 * Freshness-injection ablation experiment.
 *
 * For each multi-turn dialogue in freshness-questions.json, runs the dialogue
 * end-to-end twice — once with injectionScheme='pre-user' (the default,
 * freshness-preserving placement) and once with injectionScheme='static'
 * (the pre-fix baseline that injects RAG context only at the top of the
 * prompt) — and records the answer to each "graded" turn. A graded turn
 * is automatically scored: an answer is "correct" if any of its
 * groundTruthAny substrings appear (case-insensitive) in the response.
 *
 * Two fresh conversations are created per dialogue (one per scheme) so
 * that history does not leak between schemes.
 *
 * Output: a CSV in the results directory with one row per (dialogue,
 * scheme, graded-turn).
 *
 * Run from the repo root with:
 *   bun server/scripts/evaluation/run-freshness-eval.ts \
 *     [--base-url=http://localhost:3000] \
 *     [--username=admin] [--password=intact2025] \
 *     [--out=server/scripts/evaluation/results/freshness_<ts>.csv] \
 *     [--cleanup=true]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Turn {
  user: string;
  graded: boolean;
  groundTruthAny?: string[];
}

interface Dialogue {
  id: string;
  turns: Turn[];
}

interface CliArgs {
  baseUrl: string;
  username: string;
  password: string;
  outPath: string;
  cleanup: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string, def: string) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    if (a) return a.slice(name.length + 3);
    const env = process.env[`EVAL_${name.toUpperCase().replace(/-/g, '_')}`];
    return env ?? def;
  };
  const bool = (v: string) => v === 'true' || v === '1';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    baseUrl: get('base-url', 'http://localhost:3000'),
    username: get('username', 'admin'),
    password: get('password', 'intact2025'),
    outPath: get('out', join(__dirname, 'results', `freshness_${ts}.csv`)),
    cleanup: bool(get('cleanup', 'true')),
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
  if (!json.token) throw new Error('Login response missing token');
  return json.token;
}

interface TurnResult {
  answer: string;
  conversationId: string | null;
  sourcesCount: number;
  latencyMs: number;
  error: string | null;
}

async function sendChat(
  args: CliArgs,
  token: string,
  message: string,
  conversationId: string | null,
  injectionScheme: 'pre-user' | 'static'
): Promise<TurnResult> {
  const start = Date.now();
  const result: TurnResult = {
    answer: '',
    conversationId,
    sourcesCount: 0,
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
      body: JSON.stringify({
        message,
        ...(conversationId ? { conversationId } : {}),
        injectionScheme,
      }),
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
          result.conversationId = payload.conversationId ?? result.conversationId;
          break;
        case 'token':
          result.answer += payload.content ?? '';
          break;
        case 'sources':
          if (Array.isArray(payload)) result.sourcesCount = payload.length;
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
    /* best effort */
  }
}

function gradeAnswer(answer: string, groundTruthAny: string[] | undefined): 'correct' | 'incorrect' {
  if (!groundTruthAny || groundTruthAny.length === 0) return 'incorrect';
  const lower = answer.toLowerCase();
  return groundTruthAny.some((gt) => lower.includes(gt.toLowerCase())) ? 'correct' : 'incorrect';
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
  console.log(`[freshness] base URL : ${args.baseUrl}`);
  console.log(`[freshness] output   : ${args.outPath}`);

  const questionsPath = resolve(__dirname, 'freshness-questions.json');
  const dialogues = JSON.parse(await readFile(questionsPath, 'utf-8')) as Dialogue[];
  console.log(`[freshness] loaded ${dialogues.length} dialogue(s)`);

  const token = await login(args);
  console.log(`[freshness] login OK`);

  // Warm-up
  console.log(`[freshness] warm-up…`);
  const warm = await sendChat(args, token, 'What does MMT do?', null, 'pre-user');
  if (warm.conversationId) await deleteConversation(args, token, warm.conversationId);
  console.log(`[freshness] warm-up done`);

  await ensureDir(args.outPath);
  const header = [
    'dialogue_id',
    'scheme',
    'turn_index',
    'turn_text',
    'graded',
    'verdict',
    'sources_count',
    'latency_ms',
    'ground_truth_any',
    'answer',
  ].join(',');
  const lines: string[] = [header];

  const conversationsToClean: string[] = [];

  for (const dlg of dialogues) {
    for (const scheme of ['pre-user', 'static'] as const) {
      let conversationId: string | null = null;
      console.log(`\n[freshness] dialogue ${dlg.id} | scheme=${scheme}`);
      for (let i = 0; i < dlg.turns.length; i++) {
        const turn = dlg.turns[i];
        process.stdout.write(`  turn ${i + 1}/${dlg.turns.length} ${turn.graded ? '(GRADED)' : '       '}…`);
        const r = await sendChat(args, token, turn.user, conversationId, scheme);
        if (r.conversationId) {
          conversationId = r.conversationId;
        }
        const verdict = turn.graded ? gradeAnswer(r.answer, turn.groundTruthAny) : 'n/a';
        lines.push(
          [
            dlg.id,
            scheme,
            i + 1,
            turn.user,
            String(turn.graded),
            verdict,
            r.sourcesCount,
            r.latencyMs,
            (turn.groundTruthAny ?? []).join('|'),
            r.answer,
          ]
            .map(csvEscape)
            .join(',')
        );
        process.stdout.write(
          ` done (${(r.latencyMs / 1000).toFixed(1)}s, verdict=${verdict}${r.error ? `, ERROR: ${r.error}` : ''})\n`
        );
        await writeFile(args.outPath, lines.join('\n') + '\n');
      }
      if (conversationId) conversationsToClean.push(conversationId);
    }
  }

  // Summary
  console.log(`\n=== Summary ===`);
  const summary = {
    'pre-user': { correct: 0, total: 0 },
    static: { correct: 0, total: 0 },
  };
  for (const line of lines.slice(1)) {
    // crude CSV split is fine here because turn_text and answer might contain
    // commas — but verdict is at column 5 and scheme at column 1, so we use a
    // proper re-parse from the structured array we have above.
  }
  // Re-walk for the summary using the in-memory data.
  for (const dlg of dialogues) {
    for (const scheme of ['pre-user', 'static'] as const) {
      for (const turn of dlg.turns) {
        if (turn.graded) summary[scheme].total++;
      }
    }
  }
  // The verdicts we just wrote: read back from `lines`.
  for (let li = 1; li < lines.length; li++) {
    const parts = lines[li].split(',');
    if (parts[4] === 'true' && parts[5] === 'correct') {
      const scheme = parts[1] as 'pre-user' | 'static';
      summary[scheme].correct++;
    }
  }
  for (const scheme of ['pre-user', 'static'] as const) {
    const s = summary[scheme];
    const pct = s.total === 0 ? 0 : (s.correct / s.total) * 100;
    console.log(`  ${scheme.padEnd(8)}: ${s.correct}/${s.total} graded turns correct (${pct.toFixed(1)}%)`);
  }

  console.log(`\n[freshness] wrote ${lines.length - 1} rows to ${args.outPath}`);

  if (args.cleanup && conversationsToClean.length > 0) {
    console.log(`[freshness] cleaning up ${conversationsToClean.length} conversations…`);
    for (const cid of conversationsToClean) {
      await deleteConversation(args, token, cid);
    }
    console.log(`[freshness] cleanup done`);
  }
}

main().catch((err) => {
  console.error('[freshness] FATAL:', err);
  process.exit(1);
});
