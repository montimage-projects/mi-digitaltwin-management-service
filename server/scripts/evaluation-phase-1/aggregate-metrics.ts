/*
 * Aggregate metrics from graded evaluation CSVs (graded_rep1.csv, graded_rep2.csv,
 * graded_rep3.csv) and emit the numbers ready to copy into the paper.
 *
 * Accepted CSV format:
 *   - Semicolon-separated (as exported by Numbers on macOS in many locales).
 *     Fall back to comma if no semicolon is found in the header line.
 *   - Header columns include: id, category, expected_intent, config, rep,
 *     predicted_intent, latency_ms, Correctness, Intent_ok, Hallucination.
 *   - Cell values may be capitalised: Correct/Partial/Incorrect/Refused, Yes/No.
 *     Comparison is case-insensitive.
 *
 * Run from the repo root:
 *   bun server/scripts/evaluation/aggregate-metrics.ts \
 *     [--dir=server/scripts/evaluation/results] \
 *     [--reps=1,2,3]
 *
 * Output: human-readable summary on stdout, plus LaTeX snippets for the three
 * placeholder tables in the paper (tab:eval_quality, tab:eval_classifier,
 * latency summary).
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

type Row = Record<string, string>;
type Category = 'factual' | 'comparative' | 'adversarial' | 'casual';
type Config = 'RAG' | 'COLD';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- minimal CSV parser (handles quoted fields w/ embedded newlines) ----------

function parseCsv(text: string, delim: string): Row[] {
  const records: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        cur.push(field);
        field = '';
      } else if (c === '\n') {
        cur.push(field);
        field = '';
        records.push(cur);
        cur = [];
      } else if (c === '\r') {
        // ignore
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    records.push(cur);
  }

  const filtered = records.filter((r) => r.some((cell) => cell.length > 0));
  if (filtered.length < 2) return [];
  const header = filtered[0];
  return filtered.slice(1).map((cols) => {
    const obj: Row = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (cols[idx] ?? '').trim();
    });
    return obj;
  });
}

async function readGraded(path: string): Promise<Row[]> {
  const text = await readFile(path, 'utf-8');
  const firstLine = text.split('\n', 1)[0];
  const delim = firstLine.includes(';') ? ';' : ',';
  return parseCsv(text, delim);
}

// ---------- helpers ----------

function eq(value: string | undefined, target: string): boolean {
  return (value ?? '').trim().toLowerCase() === target.toLowerCase();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '–';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

// ---------- metric computation ----------

interface SubsetCount {
  total: number;
  correct: number;
  partial: number;
  refused: number;
  incorrect: number;
  hallucinations: number;
}

function emptySubset(): SubsetCount {
  return { total: 0, correct: 0, partial: 0, refused: 0, incorrect: 0, hallucinations: 0 };
}

function addRow(s: SubsetCount, row: Row): void {
  s.total++;
  const correctness = (row['Correctness'] ?? '').toLowerCase();
  if (correctness === 'correct') s.correct++;
  else if (correctness === 'partial') s.partial++;
  else if (correctness === 'refused') s.refused++;
  else s.incorrect++;
  if (eq(row['Hallucination'], 'yes')) s.hallucinations++;
}

function aggregateByConfigCategory(
  rows: Row[]
): Record<Config, Record<Category, SubsetCount>> {
  const result: Record<string, Record<string, SubsetCount>> = {
    RAG: { factual: emptySubset(), comparative: emptySubset(), adversarial: emptySubset(), casual: emptySubset() },
    COLD: { factual: emptySubset(), comparative: emptySubset(), adversarial: emptySubset(), casual: emptySubset() },
  };
  for (const r of rows) {
    const cfg = (r['config'] ?? '').toUpperCase() as Config;
    const cat = (r['category'] ?? '').toLowerCase() as Category;
    if (!(cfg in result) || !(cat in result[cfg])) continue;
    addRow(result[cfg][cat], r);
  }
  return result as Record<Config, Record<Category, SubsetCount>>;
}

function latencyByConfigCategory(rows: Row[]): Record<Config, Record<Category, number[]>> {
  const result: Record<string, Record<string, number[]>> = {
    RAG: { factual: [], comparative: [], adversarial: [], casual: [] },
    COLD: { factual: [], comparative: [], adversarial: [], casual: [] },
  };
  for (const r of rows) {
    const cfg = (r['config'] ?? '').toUpperCase() as Config;
    const cat = (r['category'] ?? '').toLowerCase() as Category;
    const lat = Number(r['latency_ms']);
    if (!(cfg in result) || !(cat in result[cfg]) || !Number.isFinite(lat)) continue;
    result[cfg][cat].push(lat);
  }
  return result as Record<Config, Record<Category, number[]>>;
}

interface ConfusionMatrix {
  tp_service: number; // service predicted as service
  fn_service: number; // service predicted as casual
  fp_service: number; // casual predicted as service
  tn_casual: number; // casual predicted as casual
}

function intentConfusion(rows: Row[]): ConfusionMatrix {
  // Use only RAG rows; COLD has predicted_intent = rag-off.
  const m: ConfusionMatrix = { tp_service: 0, fn_service: 0, fp_service: 0, tn_casual: 0 };
  for (const r of rows) {
    if ((r['config'] ?? '').toUpperCase() !== 'RAG') continue;
    const expected = (r['expected_intent'] ?? '').toLowerCase();
    const predicted = (r['predicted_intent'] ?? '').toLowerCase();
    if (expected === 'service' && predicted === 'service') m.tp_service++;
    else if (expected === 'service' && predicted === 'casual') m.fn_service++;
    else if (expected === 'casual' && predicted === 'service') m.fp_service++;
    else if (expected === 'casual' && predicted === 'casual') m.tn_casual++;
  }
  return m;
}

// ---------- printing ----------

function sumSubsets(...subs: SubsetCount[]): SubsetCount {
  const out = emptySubset();
  for (const s of subs) {
    out.total += s.total;
    out.correct += s.correct;
    out.partial += s.partial;
    out.refused += s.refused;
    out.incorrect += s.incorrect;
    out.hallucinations += s.hallucinations;
  }
  return out;
}

function printRepSummary(repLabel: string, rows: Row[]): void {
  const acc = aggregateByConfigCategory(rows);
  const lat = latencyByConfigCategory(rows);
  const intent = intentConfusion(rows);

  console.log(`\n=== ${repLabel} ===`);
  for (const cfg of ['RAG', 'COLD'] as Config[]) {
    console.log(`  ${cfg}:`);
    for (const cat of ['factual', 'comparative', 'adversarial', 'casual'] as Category[]) {
      const s = acc[cfg][cat];
      const ms = lat[cfg][cat];
      console.log(
        `    ${cat.padEnd(12)} n=${s.total}` +
          `  correct=${s.correct} partial=${s.partial} refused=${s.refused} incorrect=${s.incorrect}` +
          `  halluc=${s.hallucinations}` +
          `  latency med=${(median(ms) / 1000).toFixed(1)}s p95=${(percentile(ms, 95) / 1000).toFixed(1)}s`
      );
    }
  }
  console.log(
    `  intent classifier (RAG rows only): TP=${intent.tp_service} FN=${intent.fn_service} ` +
      `FP=${intent.fp_service} TN=${intent.tn_casual}`
  );
}

function printAggregate(allRows: Row[]): void {
  console.log(`\n=== Aggregate over all reps (n=${allRows.length} rows) ===`);
  const acc = aggregateByConfigCategory(allRows);
  const lat = latencyByConfigCategory(allRows);
  const intent = intentConfusion(allRows);

  // Headline accuracy / hallucination per (config, category)
  console.log(`\n--- Accuracy table values (Table tab:eval_quality) ---`);
  console.log(`Higher is better for accuracy/refusal; lower is better for hallucination.\n`);

  const printCfg = (cfg: Config) => {
    const f = acc[cfg].factual;
    const c = acc[cfg].comparative;
    const a = acc[cfg].adversarial;
    const overall = sumSubsets(f, c, a); // exclude casual from quality table
    console.log(`  ${cfg}`);
    console.log(`    factual          accuracy = ${pct(f.correct, f.total)}    (correct ${f.correct}/${f.total}, partial ${f.partial})`);
    console.log(`    comparative      accuracy = ${pct(c.correct, c.total)}    (correct ${c.correct}/${c.total}, partial ${c.partial})`);
    console.log(`    adversarial      refusal  = ${pct(a.refused + a.correct, a.total)}  (refused ${a.refused}, correct ${a.correct}, incorrect ${a.incorrect})`);
    console.log(`    HALLUCINATION rate (factual+comparative+adversarial) = ${pct(overall.hallucinations, overall.total)}  (${overall.hallucinations}/${overall.total})`);
  };
  printCfg('RAG');
  printCfg('COLD');

  // Latency summary
  console.log(`\n--- Latency (seconds, all reps pooled) ---`);
  for (const cfg of ['RAG', 'COLD'] as Config[]) {
    console.log(`  ${cfg}`);
    for (const cat of ['factual', 'comparative', 'adversarial', 'casual'] as Category[]) {
      const ms = lat[cfg][cat];
      console.log(
        `    ${cat.padEnd(12)} n=${ms.length}  median=${(median(ms) / 1000).toFixed(1)}  p95=${(percentile(ms, 95) / 1000).toFixed(1)}`
      );
    }
  }

  // Intent classifier confusion matrix
  console.log(`\n--- Intent classifier confusion matrix (RAG rows only, all reps pooled) ---`);
  console.log(`                  Pred: casual   Pred: service`);
  console.log(`  Actual: casual      ${String(intent.tn_casual).padStart(4)}            ${String(intent.fp_service).padStart(4)}`);
  console.log(`  Actual: service     ${String(intent.fn_service).padStart(4)}            ${String(intent.tp_service).padStart(4)}`);
  const total = intent.tp_service + intent.fn_service + intent.fp_service + intent.tn_casual;
  const accIntent = total === 0 ? 0 : (intent.tp_service + intent.tn_casual) / total;
  console.log(`  overall accuracy: ${(accIntent * 100).toFixed(1)}%`);

  // LaTeX-ready snippets
  console.log(`\n--- LaTeX-ready rows for paper tables ---\n`);
  console.log(`% tab:eval_quality`);
  console.log(`Factual accuracy & ${pct(acc.COLD.factual.correct, acc.COLD.factual.total)} & ${pct(acc.RAG.factual.correct, acc.RAG.factual.total)} \\\\`);
  console.log(`Comparative accuracy & ${pct(acc.COLD.comparative.correct, acc.COLD.comparative.total)} & ${pct(acc.RAG.comparative.correct, acc.RAG.comparative.total)} \\\\`);
  const advCOLD = sumSubsets(acc.COLD.adversarial);
  const advRAG = sumSubsets(acc.RAG.adversarial);
  console.log(`Adversarial refusal rate & ${pct(advCOLD.refused + advCOLD.correct, advCOLD.total)} & ${pct(advRAG.refused + advRAG.correct, advRAG.total)} \\\\`);
  const ovCOLD = sumSubsets(acc.COLD.factual, acc.COLD.comparative, acc.COLD.adversarial);
  const ovRAG = sumSubsets(acc.RAG.factual, acc.RAG.comparative, acc.RAG.adversarial);
  console.log(`Hallucination rate & ${pct(ovCOLD.hallucinations, ovCOLD.total)} & ${pct(ovRAG.hallucinations, ovRAG.total)} \\\\`);

  console.log(`\n% tab:eval_classifier (cells)`);
  console.log(`Actual: casual  & ${intent.tn_casual} & ${intent.fp_service} \\\\`);
  console.log(`Actual: service & ${intent.fn_service} & ${intent.tp_service} \\\\`);
}

// ---------- main ----------

interface CliArgs {
  dir: string;
  reps: number[];
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string, def: string) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : def;
  };
  return {
    dir: get('dir', join(__dirname, 'results')),
    reps: get('reps', '1,2,3').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.dir);
  console.log(`[metrics] dir   : ${dir}`);
  console.log(`[metrics] reps  : ${args.reps.join(',')}`);

  const allRows: Row[] = [];
  for (const rep of args.reps) {
    const path = join(dir, `graded_rep${rep}.csv`);
    const rows = await readGraded(path);
    console.log(`[metrics] loaded ${rows.length.toString().padStart(3)} rows from graded_rep${rep}.csv`);
    printRepSummary(`Rep ${rep}`, rows);
    allRows.push(...rows);
  }

  printAggregate(allRows);
}

main().catch((err) => {
  console.error('[metrics] FATAL:', err);
  process.exit(1);
});
