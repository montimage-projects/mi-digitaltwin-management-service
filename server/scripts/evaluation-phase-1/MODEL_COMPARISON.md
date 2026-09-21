# Boss Agent vs. open frontier models

Compare the local Boss Agent generator against hosted open frontier models,
**holding everything else constant**: retrieval, embeddings (local
`mxbai-embed-large`), prompts, and the intent classifier are unchanged — only
the chat generator is swapped. This isolates the model as the single variable
and reuses the existing eval harness (`run-eval.ts` + `aggregate-metrics.ts`)
and question set (`questions.json`: 10 factual / 8 comparative / 6 adversarial
/ 6 casual), so the hosted models slot in as extra columns next to the paper's
Cold-LLM / local-RAG numbers.

## How the swap works

`CHAT_PROVIDER` selects the generator (see `server/src/config/env.ts`):

- `ollama` (default) — local `OLLAMA_MODEL` on `OLLAMA_BASE_URL` (the baseline).
- `openai` — any OpenAI-compatible endpoint (`CHAT_BASE_URL`), e.g. OpenRouter.

Embeddings **always** use Ollama (`OLLAMA_EMBED_MODEL`), so the vector store /
retrieval never changes between runs. No re-seeding needed between models.

## Prerequisites

- MongoDB + Ollama running, embeddings already seeded (`npm run seed`).
- An OpenRouter API key: https://openrouter.ai/keys
- Admin login for the eval harness (default password differs — pass it, see below).

## Models under comparison

| Role                | `CHAT_MODEL`                              | ctx  |
| ------------------- | ----------------------------------------- | ---- |
| Baseline (local)    | `qwen3:14b` via `CHAT_PROVIDER=ollama`    | 4k   |
| Frontier (reasoning)| `nvidia/nemotron-3-ultra-550b-a55b:free`  | 1M   |
| Frontier (coding)   | `poolside/laguna-s-2.1:free`              | 262k |
| Frontier (MoE)      | `inclusionai/ling-3.0-flash-fin:free`     | 262k |

(Confirm the exact `:free` ids on https://openrouter.ai/models — they rotate.)

## Run one model

For each model: set env → restart the server → run the eval into a per-model
results folder → aggregate.

```bash
# 1) Baseline (local Ollama) — from server/.env: CHAT_PROVIDER=ollama
cd server && npm run dev        # in one terminal
# 2) eval (another terminal). Admin password is IntactAdmin2026!, not the default.
bun scripts/evaluation-phase-1/run-eval.ts \
  --password=IntactAdmin2026! --reps=3 \
  --out=scripts/evaluation-phase-1/results/ollama-qwen3-14b/raw.csv
bun scripts/evaluation-phase-1/aggregate-metrics.ts \
  scripts/evaluation-phase-1/results/ollama-qwen3-14b/

# 3) A hosted model — set these in server/.env, then restart the server:
#    CHAT_PROVIDER=openai
#    CHAT_API_KEY=<your OpenRouter key>
#    CHAT_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
bun scripts/evaluation-phase-1/run-eval.ts \
  --password=IntactAdmin2026! --reps=3 \
  --out=scripts/evaluation-phase-1/results/nemotron-3-ultra/raw.csv
bun scripts/evaluation-phase-1/aggregate-metrics.ts \
  scripts/evaluation-phase-1/results/nemotron-3-ultra/
```

Repeat step 3 for `poolside/laguna-s-2.1:free` and
`inclusionai/ling-3.0-flash-fin:free`.

## Fairness & caveats (for the write-up)

- **Temperature** held at `OLLAMA_TEMPERATURE` (0.2) for all models;
  `num_predict` maps to `max_tokens`. `num_ctx` has no hosted equivalent.
- **Non-determinism**: run `--reps=3` (or more) and report mean/spread, as in
  the paper's protocol.
- **Free-tier rate limits**: the free OpenRouter tier throttles (and has daily
  caps); the 30-question × 2-config sweep may need pacing / a rerun if a request
  is rate-limited. Watch `run-eval.ts` output for HTTP 429.
- **Latency** is not comparable in absolute terms (local GPU vs. shared hosted
  endpoint over the internet) — report it, but frame it as such.
- **Framing**: the story is local/private small model vs. hosted frontier
  models — a capability-vs-privacy/cost trade-off, not just a quality ranking.
