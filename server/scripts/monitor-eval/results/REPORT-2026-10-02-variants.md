# Monitor-agent experiment — variants (2026-10-02)

Two variants addressing the limits of the main report (`REPORT-2026-10-02.md`).

## Variant 1 — triage without the MITRE reference (grounding ablation)

The 6/6 MITRE agreement of the main runs was measured with the rule's reference
(name, description, MITRE technique) in the triage prompt. Here the same 5 real
incidents recorded in the live runs (`attack-incident-audit.json`) are replayed
through the triage, 5 times each, with and without that reference
(`MONITOR_TRIAGE_REFERENCE`, script `triage-ablation.ts`). Without it the model
only sees MMT's own cause text ("Probable SYN flooding attack (Half TCP handshake
without TCP RST)"). Temperature 0, thinking off (as in the live Monitor).

| Model     | Reference | MITRE answered (25 triages)         | Correct (T1499.001) | Severity   | FP likelihood | Median latency |
| --------- | --------- | ----------------------------------- | ------------------- | ---------- | ------------- | -------------- |
| qwen3:4b  | yes       | T1499.001 ×25                       | **25/25**           | high ×25   | low ×25       | 2.8 s          |
| qwen3:4b  | no        | T1078 _Valid Accounts_ ×25          | **0/25**            | high ×25   | medium ×25    | 3.0 s          |
| qwen3:14b | yes       | T1499.001 ×25                       | **25/25**           | high ×25   | low ×25       | 7.7 s          |
| qwen3:14b | no        | T1560.001 _Archive via Utility_ ×25 | **0/25**            | medium ×25 | medium ×25    | 8.2 s          |

Findings:

- Without grounding, both models map a SYN flood to an unrelated technique
  (credential abuse / data collection), consistently (25/25 identical answers).
  The live 6/6 agreement therefore comes entirely from the rule reference.
- A larger model does not fix it (4B → 14B both 0/25), and the 14B model also
  under-rates severity (medium). Grounding the triage in the detection rules
  (and, more generally, in the digital twin) is required, not optional.
- Caveat: thinking was disabled (fast, bounded triage); a reasoning-enabled
  model is a possible further condition.

## Variant 2 — false positives under normal user traffic

The main benign runs observed an idle scenario. Here a legitimate client pod in
the scenario namespace sends complete HTTP requests to CI-SIM (`/`, `/api/status`,
`/api/metrics`, random 0.3–1.0 s think time, ~1.5 req/s — below the target's flood
threshold) for the whole window (`--mode=benign --traffic=normal`).

| Run       | Window    | Legitimate requests (HTTP 200) | Incidents |
| --------- | --------- | ------------------------------ | --------- |
| smoke     | 60 s      | 92                             | 0         |
| 1         | 300 s     | 446                            | 0         |
| 2         | 300 s     | 459                            | 0         |
| 3         | 300 s     | 456                            | 0         |
| **total** | **960 s** | **1453**                       | **0**     |

Findings:

- No false-positive incident over 16 min of normal traffic (1453 requests, all
  served). With the idle runs: 0 incidents over 31 min in total.
- Limits: one traffic profile (moderate, single client, complete requests); MMT
  rules 20/51/56 target floods, so bursty-but-legitimate traffic (many clients,
  retries) is the next stress case. 0 observed ≠ 0 operational FP rate.

## Environment

Branch `viet-monitor-agent`; kind `secsim`; MMT (`secanod-mmt-image:kafka`) real,
MAG/CI-SIM/AI4SOAR stand-in; `MONITOR_MODEL=qwen3:4b` (live), Ollama local; Node 22.23.3.
