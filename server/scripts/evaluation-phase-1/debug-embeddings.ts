/*
 * Diagnostic: verify whether nomic-embed-text in this Ollama install honors
 * the `search_query` / `search_document` task prefixes, and inspect the
 * current state of the vector store.
 *
 * Calls Ollama directly (no auth, no Express). Prints:
 *   1. Vector samples for "Tell me about MONT-MMT" embedded three ways:
 *      a) no prefix
 *      b) "search_query: ..." prefix
 *      c) "search_document: ..." prefix
 *      Includes cosine similarities between them so we can tell whether
 *      the prefix actually changes the embedding.
 *
 *   2. For the search_query-prefixed query above, the top-10 stored
 *      service embeddings ranked by cosine similarity, with their
 *      stored `modelName` (so we can confirm what's actually indexed).
 *
 * Run from the repo root with:
 *   bun server/scripts/evaluation/debug-embeddings.ts
 *
 * Env overrides: OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL, MONGODB_URI.
 */

import mongoose from 'mongoose';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/intact';
const QUERY = 'Tell me about MONT-MMT';

async function ollamaEmbed(input: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { embeddings: number[][] };
  if (!json.embeddings?.[0]) {
    throw new Error('No embedding returned');
  }
  return json.embeddings[0];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function fmtVec(v: number[], n = 5): string {
  return `[${v
    .slice(0, n)
    .map((x) => x.toFixed(4))
    .join(', ')}, ...]  (dim=${v.length})`;
}

async function main(): Promise<void> {
  console.log(`[debug] Ollama   : ${OLLAMA_BASE_URL}`);
  console.log(`[debug] model    : ${EMBED_MODEL}`);
  console.log(`[debug] mongo    : ${MONGODB_URI}`);
  console.log(`[debug] query    : "${QUERY}"\n`);

  // 1. Embed the query three ways and compare.
  console.log('=== 1. Prefix-honoring test ===');
  const eNone = await ollamaEmbed(QUERY);
  const eQuery = await ollamaEmbed(`search_query: ${QUERY}`);
  const eDoc = await ollamaEmbed(`search_document: ${QUERY}`);

  console.log(`  no prefix         : ${fmtVec(eNone)}`);
  console.log(`  search_query: ... : ${fmtVec(eQuery)}`);
  console.log(`  search_document:..: ${fmtVec(eDoc)}`);
  console.log();
  console.log(`  cosine(no prefix, search_query)    = ${cosine(eNone, eQuery).toFixed(4)}`);
  console.log(`  cosine(no prefix, search_document) = ${cosine(eNone, eDoc).toFixed(4)}`);
  console.log(`  cosine(search_query, search_doc)   = ${cosine(eQuery, eDoc).toFixed(4)}`);
  console.log();
  console.log(`  Interpretation:`);
  console.log(`    cosine ≈ 1.0  → prefixes are IGNORED by the model (no asymmetric mapping)`);
  console.log(`    cosine ~ 0.85-0.95 → prefix produces a different but related embedding (OK)`);
  console.log(`    cosine < 0.8  → prefix changes the embedding substantially (good)`);
  console.log();

  // 2. Inspect what is actually indexed.
  console.log('=== 2. Top-10 stored embeddings for the prefixed query ===');
  await mongoose.connect(MONGODB_URI);
  const conn = mongoose.connection;
  if (!conn.db) {
    throw new Error('Mongo connection is missing a `db` handle');
  }
  const docs = await conn.db
    .collection('service_embeddings')
    .find(
      {},
      { projection: { shortName: 1, modelName: 1, embedding: 1, rawText: 1, _id: 0 } }
    )
    .toArray();

  console.log(`  found ${docs.length} service embeddings in collection 'service_embeddings'`);
  const distinctModels = new Set(docs.map((d) => d.modelName));
  console.log(`  distinct modelName values: ${[...distinctModels].join(', ')}`);

  const ranked = docs
    .map((d) => ({
      shortName: d.shortName as string,
      modelName: d.modelName as string,
      score: cosine(eQuery, (d.embedding as number[]) ?? []),
      rawTextPreview: ((d.rawText as string) ?? '').slice(0, 80).replace(/\n/g, ' | '),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  console.log();
  console.log(`  rank  score   shortName              modelName            preview`);
  console.log(`  ----  ------  ---------------------  -------------------  ----------------------`);
  ranked.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}    ${r.score.toFixed(4)}  ` +
        `${r.shortName.padEnd(22)} ${r.modelName.padEnd(20)} ${r.rawTextPreview}`
    );
  });
  console.log();

  // 3. Sanity: find MONT-MMT specifically (if it exists) and report its rank.
  const allRanked = docs
    .map((d) => ({
      shortName: d.shortName as string,
      score: cosine(eQuery, (d.embedding as number[]) ?? []),
    }))
    .sort((a, b) => b.score - a.score);
  const mmtIdx = allRanked.findIndex((r) => r.shortName === 'MONT-MMT');
  if (mmtIdx === -1) {
    console.log(`  WARNING: MONT-MMT not found in indexed embeddings at all.`);
  } else {
    console.log(
      `  MONT-MMT rank: ${mmtIdx + 1} of ${allRanked.length} (score ${allRanked[mmtIdx].score.toFixed(4)})`
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[debug] FATAL:', err);
  process.exit(1);
});
