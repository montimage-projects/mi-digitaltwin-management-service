# Boss Agent vs. open frontier model — SECASSURED catalog (2026-09-24)

Only the chat generator differs; retrieval (mxbai-embed-large, top-k=4), prompts
and the embedding intent classifier are identical. Conversation titles use the
non-LLM fallback during evals (`AGENT_LLM_TITLES=false`). Question set:
`questions-secassured.json` (30 Qs: 10 factual / 8 comparative / 6 adversarial /
6 casual, ground truth per question) + `questions-memory.json` (4 two-turn
dialogues). 3 repetitions × RAG/Cold. Grades are **drafts** (auto-graded
mechanical cases + manual decisions in `*/overrides.json`) — to be reviewed.

| RAG config                      | qwen3:14b (local, Mac)      | Nemotron 3 Ultra 550B (OpenRouter free) |
| ------------------------------- | --------------------------- | --------------------------------------- |
| Factual accuracy                | 30/30 (100%)                | 30/30 (100%)                            |
| Comparative                     | 12 correct + 9 partial / 24 | 12 correct + 9 partial / 24             |
| Adversarial (correct decline)   | 18/18 (100%)                | 18/18 (100%)                            |
| Hallucination (fact+comp+adv)   | 0/72                        | 0/72                                    |
| Intent routing                  | 90/90                       | 90/90 (same classifier)                 |
| Latency median / p90            | 23.6 s / 42.5 s             | 12.0 s / 43.8 s                         |
| Memory: recalls prior turn      | 10/12                       | 12/12                                   |
| Memory: fully correct follow-up | 7/12                        | 12/12                                   |

Cold config (no retrieval): both models refuse factual/comparative questions
(0% factual, grounded prompt) and correctly decline adversarial ones; in memory
dialogues both recall the entity but cannot supply facts (none were retrieved).

## Findings

1. On grounded catalog Q&A the local 14B model matches the 550B frontier model:
   retrieval, not model size, determines accuracy.
2. Remaining errors are retrieval-bound and shared: comparative lists truncated
   by top-k=4 (C1 Montimage 8 services, etc.) and C8 (TRL-3 services never
   retrieved) — a larger generator does not fix them.
3. Multi-turn context use differs: qwen3:14b often recalls _which_ service was
   discussed but refuses to reuse its own previous answer, because the fresh
   RAG context for the follow-up (unrelated services) is prompted as
   superseding earlier context; it also answers "I can reference our chat"
   without content (M4). Nemotron integrates history and fresh context in all
   dialogues.
4. Ceiling effect: most categories are at 100% for both — the set is too easy
   to discriminate models; see `questions-hard.json` (tool selection, scenario
   configuration, agent safety, ambiguity, constraints, multi-hop).

## Caveats

- Latency is not comparable in absolute terms (local Apple GPU vs. shared
  hosted endpoint; hosted p90 includes overload retries).
- Nemotron free tier was frequently overloaded; failed rows were re-run until
  answered (failures are not billed). 2 Cold memory dialogues remain unanswered.
- Draft grades by the assistant; ground truth written from the catalog snapshot
  `../../catalog-secassured.json` (31 active services).
