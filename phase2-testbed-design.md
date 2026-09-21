# Phase 2 Testbed Design — RQ3 Closed-Loop Incident Response

**Status:** design draft (2026-06-22). Installer Agent (RQ2) deferred; this phase targets RQ3.
**Scope:** the defensive closed loop **simulated attack → detect → react/mitigate → report**, with
the human _validating decisions_ (not executing them), built on Montimage's own tools.

## Tool choice

| Stage                                   | Tool                                                                  | Repo                               |
| --------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| Attack simulation                       | **NetworkFuzzer**                                                     | github.com/Montimage/NetworkFuzzer |
| Detection                               | **MMT-probe**                                                         | github.com/Montimage/mmt-probe     |
| Decision (baseline) + execution backend | **AI4Soar** (+ Shuffle SOAR, CACAO playbooks)                         | github.com/Montimage/ai4soar       |
| Decision (contribution)                 | **your local multi-agent layer** (Boss + Monitor + Mitigator, Ollama) | this project                       |

**Key strategic point — AI4Soar is itself an LLM decision engine** (alert → MITRE ATT&CK attribution →
CACAO playbook selection → execute), defaulting to a _cloud_ LLM (OpenAI/Anthropic). So it is used in
**two distinct roles**:

- **Baseline (B):** stock AI4Soar = the full decision engine to benchmark against.
- **Contribution (A):** reuse only its **execution backend** (and CACAO playbook library); your local
  multi-agent layer replaces its brain.

This keeps the local-LLM / data-sovereignty thesis intact, avoids reinventing playbook execution, and
gives a real comparison baseline + security metrics — exactly what the Phase 1 reviewers said was missing.

**Verified against the repo (2026-06-22) — what the seam actually looks like:**

- **The executor is cleanly decoupled.** `core/orchestration_engine/playbook_service.py` →
  `execute_playbook(workflow_id, params)` and the route `POST /api/playbooks/<id>/execute` have **zero
  imports from the LLM / orchestration code** — they just `POST {SHUFFLE}/workflows/{id}/execute`. Your
  Mitigator calls this directly. ✅ swap confirmed feasible.
- **Caveat — execution is keyed on Shuffle _workflow IDs_, not CACAO documents.** There is **no
  CACAO→Shuffle translator** in the repo (they flag it themselves: _"Default workflow … until CACAO→Shuffle
  mapping is in place"_). So "reuse the playbook library" = build/import the corresponding **Shuffle
  workflows** once; the CACAO YAMLs (`playbooks/tXXXX_*.yaml`) stay the recommendation templates.
- **Local attribution already exists.** AI4Soar attributes raw MMT alerts via **ML Path C
  (scikit-learn `.joblib`, fully local, no cloud)**; the LLM client (`utils/llm/client.py`) is a one-line
  `base_url` change from running the _whole_ baseline on Ollama → a fully-local B is possible.
- **Baseline input shim.** AI4Soar's `MMTAdapter` wants a JSON envelope
  `{type, payload:{probeId,timestamp,code,status,category,description,srcIp,dstIp,…}}`; MMT's native file
  output is **CSV security report (format id 10)**. A small harness shim reshapes CSV→envelope and
  `POST`s to `/api/recommend`. (Contribution path A skips this — the Monitor parses the CSV directly.)

## The closed loop

```
   ┌───────────── EXPERIMENTER HARNESS  (per-scenario scripts) ──────────────┐
   │   reset env → start benign traffic → fire LABELED attack @T0 → score      │
   └──────┬───────────────────────────────────────────────────┬──────────────┘
          │ trigger                                            │ timestamps → metrics
          ▼                                                    ▲
 ┌──────────────────┐    ┌──────────┐    ┌────────────────┐    │
 │  NetworkFuzzer   │───►│  TARGET  │◄──►│   MMT-probe    │────┼──► alert (JSON)
 │  ATTACK (sim)    │    │ svc + DB │    │  DETECT (DPI)  │    │
 └──────────────────┘    └────▲─────┘    └────────────────┘    │
        ▲ seed corpus          │ enforce mitigation             │
        │                      │                                │
 ┌──────┴──────────┐   ┌───────┴─────────┐                      │
 │ Benign-traffic  │   │ Shuffle + CACAO │◄──── chosen playbook  │
 │ generator       │   │ EXECUTE/ACTUATE │                      │
 └─────────────────┘   └───────▲─────────┘                      │
                               │                                │
        DECISION LAYER  (swappable; reads MMT alert) ───────────┘
        ┌──────────────────────────────────────────────────┐
        │ (A) CONTRIBUTION: your multi-agent layer           │
        │     Monitor → Boss → Mitigator   (local, Ollama)   │
        │     + tiered human-in-the-loop approval gate       │
        │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
        │ (B) BASELINE: stock AI4Soar  (cloud LLM, as-is)    │
        └──────────────────────────────────────────────────┘
```

## Components by layer

### Static environment (`docker-compose`)

| Component         | Tool                                                                                                           | Role                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target            | **primary:** Orthanc DICOM/PACS server (one container) · **flagship (later, server):** Open5GS core + UERANSIM | what's defended; protocol NetworkFuzzer can inject **and** MMT can inspect                                                                                          |
| Detector          | **MMT-probe** (`security` module on)                                                                           | DPI on the target network → CSV **security report (format id 10)** to a shared volume ("detect" stage)                                                              |
| Alert transport   | **shared Docker named volume** (`mi_report_storage`)                                                           | MMT writes one complete `.csv` per ~5s flush + a `.sem` marker; Monitor mounts it **read-only**, watches for new `*.csv.sem`, reads the matching `.csv`. No broker. |
| Actuation surface | gateway/firewall container + **Shuffle SOAR** (M1: a thin direct executor)                                     | where playbooks enforce mitigations (block IP, isolate host)                                                                                                        |
| Benign traffic    | small "normal user" generator                                                                                  | baseline for FPR **and** seed corpus for NetworkFuzzer                                                                                                              |
| Support infra     | OpenSearch + MongoDB (AI4Soar deps, **baseline only**)                                                         | persistence for the (B) baseline; not needed for path (A)                                                                                                           |

### Dynamic harness (scripts, triggered per scenario — _not_ permanent services)

| Component           | Tool              | Role                                                                      |
| ------------------- | ----------------- | ------------------------------------------------------------------------- |
| Attacker            | **NetworkFuzzer** | fires a labeled attack at T0 (injection/fuzz/replay of the benign corpus) |
| Scenario runner     | your script       | reset → benign traffic → labeled attack → run loop → record               |
| Ground-truth labels | your script       | what attack, when, against what — the scoring key                         |
| Scorer / telemetry  | your script       | timestamps, pcaps, logs → metrics                                         |

## Decision-layer swap

Both configurations consume the **same MMT alert feed** and emit a **CACAO playbook to the same Shuffle
backend** — only the brain changes:

- **(A) Contribution:** Monitor ingests the MMT alert → Boss reasons/attributes → Mitigator selects +
  parameterizes a CACAO playbook → tiered HITL gate (low = auto / medium = notify / high =
  block-and-justify) → Shuffle executes. All on **local Ollama models**.
- **(B) Baseline:** stock AI4Soar does alert → ATT&CK attribution → playbook selection → execution, on
  its **cloud LLM**.

## What gets measured (timestamps)

T0 attack launched → T1 MMT alert → T2 decision made → T3 mitigation executed → T4 verification
(re-probe: did the attack still work?).

- **MTTD** = T1 − T0 · **MTTR** = T3 − T0 · **decision latency** = T2 − T1
- **Detection rate / FPR** (needs benign traffic) · **ATT&CK-attribution accuracy** ·
  **mitigation success** (T4) · **% auto-resolved vs escalated**

Run A and B over the same labeled scenarios → head-to-head security evaluation.

## Agent's world vs experimenter's controls

- **Agents read:** MMT alerts only.
- **Agents write:** CACAO playbook → Shuffle.
- **Experimenter controls (agents never see):** NetworkFuzzer, benign traffic, reset, labels, scoring.

Keeps the evaluation honest — the agent can't "cheat" by seeing ground truth.

## Decisions (resolved 2026-06-22, against the cloned repos)

1. **MMT alert channel/format → FILE, CSV security report (format id 10).** Default config
   (`sample-file = true`) writes one complete `.csv` per flush period + a `.sem` completion marker.
   Transport = a **shared Docker named volume** (MMT's own documented pattern), Monitor mounts read-only.
   STIX/JSON deferred (MMT can switch `output.format = JSON`; AI4Soar has a STIX KB for later).
2. **Target + protocol → DICOM/Orthanc primary (attack _and_ detect both wired); 5G core a later flagship (attack ready, detect NOT).**
   NetworkFuzzer injects `SCTP/UDP/HTTP2/TCP/DICOM` (**no HTTP/1.1**). **DICOM has both ends covered:**
   ~50 attack rules + ML/RL fuzzer + a live CVE (`CVE-2024-23914`), **and** mmt-security DICOM detection
   rules exist + a reference NetworkFuzzer RL env already consumes MMT alerts for DICOM
   (`fuzzer/rl/aggressive_env.py`). One container, laptop-friendly, healthcare = CI.
   **The 5G branch's _attack_ tooling is production-grade** (NGAP/NAS/SBI/PFCP/GTP-U adapters, CVE-mapped,
   3.8 MB spec-mutation catalog) **but its "detection" is a crash/coverage/log oracle for _fuzzing /
   vuln-discovery_ (the tool's own "RQ1 NGAP-track"), NOT an MMT-IDS pipeline** — `ngap/mmt_bridge.py` is
   only an ASN.1 codec, not MMT-probe. So 5G gives the _attack_ stage but not the _detect_ stage RQ3 needs,
   plus heavy infra (bare-metal Open5GS+ASAN, kernel SCTP, no compose, no UE sim). **Decision:** prove the
   loop on DICOM first; pursue 5G as a **server-based flagship** scenario _iff_ the team has mmt-security 5G
   rules (see remaining-to-confirm). Architecture is protocol-agnostic — only the target + rules change.
3. **CACAO/Shuffle reuse → YES, via `PlaybookService.execute_playbook` (no LLM dependency).** Caveat:
   keyed on Shuffle _workflow IDs_; build the Shuffle workflows once (no CACAO→Shuffle translator exists).
4. **AI4Soar local option → YES.** ML Path C attributes MMT alerts locally; LLM client is one `base_url`
   line from full Ollama. Enables an optional fully-local baseline.

### Remaining to confirm in-house

- ~~Detection rules for the chosen attack.~~ **Resolved (2026-06-22):** mmt-security DICOM detection
  rules exist → the DICOM scenario is viable end-to-end (attack + detect).
- **(5G flagship, later) both ends live in the Montimage ecosystem.** Use **5GReplay** (Montimage's
  dedicated 5G fuzzer) for the _attack_ stage + **mmt-security 5G rules** (Viet: confident MMT has NGAP/etc.
  rules) for _detect_ — cleaner than repurposing NetworkFuzzer's `5G` branch, whose loop is a crash/coverage
  oracle, not an IDS. Target = stock **dockerized** Open5GS + UERANSIM, on the server. Confirm the exact
  mmt-security 5G rules and stand it up when the DICOM loop is green.
- **Reversible actuation** — mitigations (iptables, isolation) must be flushed on `reset` for
  reproducibility. (Design constraint, not a blocker.)
- **Live capture in Docker** — MMT live-sniffing a container bridge needs `NET_ADMIN`/shared netns or
  host networking; otherwise feed it a span/mirror or replay a pcap. Pick one when wiring compose.

## Compute & deployment

**Two-machine split.** Develop on the laptop; run the _measured_ experiments on a Linux GPU server.
Latency (MTTD/MTTR/decision-latency) is a research variable (SQ3.6), so the numbers must come from
**stable, representative hardware** — not a throttling laptop also running Docker + OpenSearch. (Phase 1
already committed to GPU-server measurements.)

**Rough memory budget — full A-vs-B loop at once (Q4 quants):**

| Layer     | Items                                                                                                 | RAM/VRAM      |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| Models    | Boss 14B ≈9 · Monitor 7B ≈4.5 · Mitigator 1–3B ≈1–2 · embedder ≈0.7 · KV cache +1–3                   | **~16–18 GB** |
| Infra     | OpenSearch ~2 · Shuffle (3 containers) ~2 · MongoDB ~1 · MMT ~0.5 · NetworkFuzzer ~0.5 · target+DB ~1 | **~7–8 GB**   |
| **Total** |                                                                                                       | **~24–26 GB** |

Fits a 32 GB laptop with **no headroom**, and the three models contend for **one** GPU → sequential
agent calls trigger model reload thrash. Fine for a trimmed dev loop; too tight + too noisy for the eval.

- **Laptop (dev / Milestone 1):** small models only (defer the 14B Boss), the thin direct iptables
  executor (skip Shuffle + OpenSearch), one target, one scenario. Validates the plumbing.
- **Eval server (secured 2026-07): NVIDIA DGX Spark (`montimage-dgx-spark`).** Grace-Blackwell GB10,
  **128 GB unified LPDDR5X** (35B fits easily), ARM64/DGX OS, NVMe. Model present: `qwen3.6:35B`. Memory
  bandwidth (~273 GB/s) is the tok/s limiter, so **measure inference latency on it** (RQ3 variable).
  **Open items:** (i) the team may swap **Ollama → llama.cpp** — llama.cpp serves the **OpenAI `/v1`** API,
  not Ollama's `/api/*`, so the platform's LLM gateway would need a small adapter (not just a URL change);
  (ii) with llama.cpp (one model per instance) the **embedding model** needs its own server or stays local.
  Verify the model name + API at the server's models endpoint (`/api/tags` for Ollama, `/v1/models` for
  llama.cpp) and use it verbatim. Host inference + containerized testbed — same split as the laptop.

**OS note.** MMT / AI4Soar / NetworkFuzzer are Linux-only, but they are already **containerized**
(`FROM ubuntu:22.04`). Docker Desktop on macOS _is_ a Linux VM, so they run as Linux containers with no
hand-built VM needed. Two Mac-only frictions: (i) Apple silicon is **arm64** — build from source (the
Dockerfiles do) to get native images; avoid amd64-only prebuilt images / slow QEMU emulation; (ii) live
packet capture / `network_mode: host` is limited on Mac — put MMT in the **target's network namespace**
(`network_mode: "container:target"`) or replay a pcap offline. The Linux server removes both frictions.

## Step 1 (first milestone) — prove the read path, stop at the Boss

**Scope: attack → detect → parse → Boss. No Mitigator / executor / HITL gate yet.** This validates the
risky plumbing (does an attack actually surface as a well-formed alert in the Boss?) before adding action.

```
NetworkFuzzer ──DICOM attack@T0──► Orthanc ◄──inspects── MMT-probe (security module, DICOM rules)
  (experimenter/harness)                                    │ writes security report (CSV id=10)
                                                            ▼
                                                shared volume (.csv + .sem)
                                                            │
                                          PARSER  (deterministic code, NOT an LLM):
                                          watch *.csv.sem → map format-id-10 → alert JSON
                                                            │
                                                            ▼
                                          BOSS AGENT (LLM): reason about the alert → decision object
```

Compose: **Orthanc** target + **MMT-probe** (security module on, DICOM rules, file output to the shared
volume).

**Chosen step-1 scenario: DICOM association flood** — NetworkFuzzer `rules/56.dicom_association_flood.xml`,
backed by the labeled `dicom_dataset/abnormal/high_volume_traffic.pcap`. Picked because the signal is
unambiguous (easy to confirm MMT detection fires), it's reproducible (replay the labeled pcap for identical
runs, or fire the rule live), the mitigation is obvious (block/rate-limit the source IP → clean step 2), and
it maps to a clear MITRE technique (Endpoint/Network DoS, T1499). NetworkFuzzer ships a **labeled
`dicom_dataset/`** (normal + ~20 abnormal pcaps + cicflowmeter CSVs) — free ground truth for the harness.

Harness fires the attack at T0. **Log T0→T1 (MTTD)** and assert the Boss received a well-formed alert.
That's the milestone — a green read path.

**Then step 2:** add the Mitigator + a thin direct iptables executor (block the source) → T3 / MTTR; then
graduate the executor to Shuffle, add scenarios, and stand up the (B) AI4Soar baseline.

**Later, richer scenario (healthcare-privacy angle):** DICOM **C-FIND patient enumeration**
(`rules/65.dicom_cfind_patient_enum.xml`) — an attacker harvesting patient records; gives an _exfiltration_
case (MITRE Collection/Exfiltration) beyond DoS, and a strong narrative for a medical PACS. The 5G flagship
scenario comes after that, on the server.

## Agent architecture

Pattern (**SQ3.2**): a **supervisor state-graph** (LangGraph-style, borrowed from LanG/Khaldi). A single
shared **state object** is threaded through the nodes — `alert → context → decision → gate verdict →
execution result → verification` — and the agents are **stateless**, reading/writing that state (Khaldi's
SSOT-M). The Boss is the supervisor; Monitor senses, Mitigator acts.

```
                         ┌──────────────────────────────────────────────────┐
                         │  DT KNOWLEDGE BASE  (RAG, local)                   │
                         │  service catalog (Phase 1) + ATT&CK + playbook idx │
                         └───────────────────▲────────────────────────────────┘
                                             │ retrieve / ground
  MMT-probe security report                  │
  CSV id=10  ──► shared volume ──►  ┌─────────┴──┐ alert  ┌──────────────┐
  ( watch *.csv.sem, read .csv )    │  MONITOR   │───────►│    BOSS      │
                                    │  3–7B      │        │   14B+       │
                                    │ parse +    │        │ reason /     │
                                    │ triage     │        │ attribute /  │
                                    └────────────┘        │ decide       │
                                                          └──────┬───────┘
                                            decision (technique, target, intent)
                                                                 ▼
                                                          ┌──────────────┐
                                                          │  MITIGATOR   │
                                                          │  1–3B        │
                                                          │ select +     │
                                                          │ parameterize │
                                                          │ playbook     │
                                                          └──────┬───────┘
                                                    proposed action
                                                                 ▼
                                   ┌─────────────────────────────────────────┐
                                   │ TIERED HITL GATE (orchestrator, no model)│
                                   │  low → auto · med → auto+notify          │◄── human VALIDATES
                                   │  high → block, require approval          │     the decision
                                   └──────────────────┬──────────────────────┘
                                            approved action
                                                                 ▼
                       AI4Soar  PlaybookService.execute_playbook(workflow_id, params)
                                          │  POST /workflows/{id}/execute
                                                                 ▼
                          ┌──────────────┐
                          │ Shuffle SOAR │ ─► iptables block / host isolate on gateway ─► TARGET
                          └──────────────┘   (M1: thin direct executor stands in for Shuffle)
```

**Seams (verified against the repos):**

- **Read** — Monitor watches the shared volume for new `*.csv.sem`, parses the matching format-id-10
  record (`property_id, verdict, type∈{attack,security,test,evasion}, cause, history`) → internal alert.
  Runs in its own container, volume mounted **read-only**. _(Answers the isolated-container concern.)_
- **Reason** — Boss does RAG over the DT knowledge base (the Phase-1 service catalog + ATT&CK technique
  descriptions + the CACAO playbook index) to ground attribution and the mitigation decision. This is the
  grounded-reasoning core that ties RQ3 back to RQ1.
- **Act** — Mitigator maps technique → CACAO template → **Shuffle workflow ID + params** →
  `execute_playbook`. (M1: maps straight to a direct iptables executor.)
- **Human-in-the-loop** — tiered risk matrix (ED-ASOC) enforced by the orchestrator, _not_ a model; the
  human validates the **decision**, never executes — exactly the RQ3 framing.

**Model sizing (SQ3.4, all local/Ollama):** Monitor 3–7B (deterministic CSV parse + light triage — could
even be non-LLM), Boss 14B+ (multi-step reasoning + RAG + tool choice), Mitigator 1–3B (constrained
selection + parameter-filling). **Tool-use reliability (SQ3.3)** lives at the Mitigator→executor seam:
structured/schema'd action calls + atomic rollback (ED-ASOC) and output validation (LanG) before anything
reaches Shuffle.

**Baseline (B)** swaps the whole Monitor→Boss→Mitigator block for stock AI4Soar (its Path A/B/C/D),
fed by the CSV→envelope shim, emitting to the **same** Shuffle backend → head-to-head on the same labeled
scenarios. See the borrowable patterns in `literature/RQ3_bibliography.md`.

## Next design step

Specify the **shared state object schema** (the fields each node reads/writes) and the **Monitor parsing
contract** (MMT format-id-10 CSV → internal alert), then wire the M1 docker-compose (HTTP/2 target + MMT +
benign generator + gateway executor + harness).
