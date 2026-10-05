# Monitor-agent experiment — real Montimage images on the DGX, 2026-10-05

First run of the full SECASSURED workflow with **real attacker and target
images**, and with the Boss/triage LLM served by the **company DGX Spark**
(vLLM, `montimage-dgx-spark` = Qwen3.6-35B-A3B) instead of the laptop's Ollama.
Embeddings stayed on the laptop (`mxbai-embed-large`) so retrieval is unchanged.

## What is real now

| Component              | 2026-10-02 (laptop)                               | 2026-10-05 (this run)                                   |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Attacker (MAG)         | stub (`secsim-e2e-stub`, mimics `mag http-flood`) | **real MAG** `mag:local`, built from `../mag`           |
| Target (CI-SIM)        | stub                                              | **real CI-SIM** `ci-sim:local`, built from `sim/ci-sim` |
| Detector (MMT/secAnoD) | real `secanod-mmt-image:kafka`                    | real `secanod-mmt-image:kafka`                          |
| Kafka bus              | real `apache/kafka`                               | real `apache/kafka`                                     |
| Reaction (AI4SOAR)     | stub (`/admin/block`)                             | stub (`/admin/block`) — unchanged                       |
| Triage + Boss model    | laptop Ollama (qwen3:4b / qwen3:14b)              | **DGX vLLM** `montimage-dgx-spark` (35B)                |

The attack is `mag http-flood --url http://ci-sim:8080 --count 20000
--i-am-authorized`. The real MMT probe raises rule 56 (SYN flooding) on the
flood's TCP connection volume, exactly as the stub did, so the detection target
is the same while the attacker and target are now the real tools.

## Attack runs (n=5)

| Metric                         | Value                                       |
| ------------------------------ | ------------------------------------------- |
| Detection (incident opened)    | 5/5                                         |
| Boss proposals produced        | 5/5                                         |
| MTTD (attack start → incident) | median 2.1 s (min 2.1, max 2.2)             |
| Triage latency (DGX)           | median 1.8 s (min 1.8, max 2.0)             |
| Boss-proposal latency (DGX)    | median 2.4 s (min 2.0, max 2.8)             |
| Alerts per incident            | 92, 106, 107, 109, 106                      |
| MITRE technique                | T1499.001 × 5 (correct, reference-grounded) |
| Severity                       | low × 5                                     |
| Confidence                     | 0.6 × 5                                     |
| Triage source                  | model × 5 (no fallback)                     |

The headline change from the laptop is **Boss-proposal latency: ~2.4 s on the
DGX vs 26–55 s for laptop qwen3:14b** — a 10–20× speedup from the GPU server,
with triage and detection unchanged.

## Benign run (false positives)

| Metric                     | Value                         |
| -------------------------- | ----------------------------- |
| Mode                       | benign, normal client traffic |
| Duration                   | 600 s                         |
| Successful client requests | 914 (all HTTP 200)            |
| False-positive incidents   | 0                             |

Zero false positives over ten minutes of legitimate traffic against the **real**
CI-SIM with the **real** MMT probe. As before this is an observed count under
one moderate traffic profile, not a proven operational false-positive rate.

## Triage grounding ablation on the 35B model (25 replays per condition)

Replays the recorded (fully aggregated) incidents through triage, varying only
what the prompt carries. Compare with the 2026-10-02 qwen3:4b/14b ablation.

| Triage prompt contains                                 | exact T1499.001 | T1499 family | median latency |
| ------------------------------------------------------ | --------------- | ------------ | -------------- |
| rule name + description + technique label (**full**)   | 25/25           | 25/25        | 1.9 s          |
| rule name + description, no MITRE label (**no-mitre**) | 1/25            | 7/25         | 1.9 s          |
| detector cause text only (**none**)                    | 0/25            | 0/25         | 1.9 s          |

Without the explicit label the 35B model drifts to T1498 (Network DoS, 18/25)
or the T1499 parent, and on detector-text-only it misses entirely
(T1071 C2-over-HTTP 17/25, T1078, T1059, T1190). Same **grounding, not scale**
pattern as the 4B and 14B models: a 9× larger model does not recover the
ATT&CK mapping on its own.

The 35B is, however, more _graded_ than the smaller models when it has the full
card: severity split {high: 15, medium: 10} across the replayed incidents, where
qwen3:14b answered high on all 25.

## A new observation: live triage fires on the opening evidence

In the ablation (replayed, fully aggregated incidents) the 35B returns high/medium
severity. In the **live** runs above it returns **low** severity with confidence
0.6, its summary noting "a single … alert … low volume". Triage runs when the
incident _opens_ — on the first alert(s), before aggregation — so the live model
reasons from thin evidence and hedges, while qwen3:4b/14b returned "high"
regardless. This is a model-behaviour difference, not a detector difference
(detection and alert counts are identical), and argues for either triaging after
a short aggregation window or passing the running alert rate into the prompt.

## Environment

- Date: 2026-10-05, Europe/Paris (CEST). Application code commit: `273b557` + uncommitted provider/vLLM changes on `viet-monitor-agent`.
- Models: triage + Boss `montimage-dgx-spark` (Qwen3.6-35B-A3B, NVFP4) on the DGX Spark vLLM router (`http://192.168.0.124:8001/v1`, no auth); reasoning disabled (`enable_thinking=false`). Embeddings `mxbai-embed-large` on the laptop.
- `CHAT_PROVIDER=openai`, `CHAT_DISABLE_THINKING=true`, `MONITOR_MODEL=montimage-dgx-spark`.
- Cluster: local kind `secsim` (k8s v1.37.0). Images: `mag:local`, `ci-sim:local`, `secanod-mmt-image:kafka`, `apache/kafka:3.9.1`, AI4SOAR `secsim-e2e-stub:local`.
- Scenario `6ab0ebc62753372b7ac5b989`; MAG profiles repointed to the real `mag http-flood` CLI for the run (seed left on the stub CLI).
- Vector store: local MongoDB with cosine fallback (Atlas `$vectorSearch` unavailable).

## Interpretation limits

- Still only one attack type / one detection rule (rule 56). Real MAG also
  offers `syn-flood`, `icmp-flood`, `udp-flood`, but `syn-flood`/`icmp-flood`
  need raw-socket capabilities (`NET_RAW`/`NET_ADMIN`, not granted to the MAG
  pod) and a numeric target IP (they reject the `ci-sim` DNS name). Exercising
  rules 20/51 needs the MAG service to request those capabilities first.
- The AI4SOAR reaction is still the stub (`/admin/block`); the Boss keeps
  proposing a Kubernetes NetworkPolicy from the catalog text, which the stub does
  not implement — the same live-grounding gap noted on 2026-10-02.
- DGX latencies are from a shared machine (colleagues' jobs, ~89/119 GB used);
  they show the GPU is fast, not a controlled benchmark.
- Severity has no independent ground truth.
