# Monitor-agent experiment — instructions for an agent

You run the Monitor-agent experiment on the SECASSURED attack → detect → respond
demo and report the results. Work on branch `viet-monitor-agent`. Do **not**
change application code; if something is broken, stop and report it (with the
exact error). Be token-efficient: filter command output, don't dump logs.

## What is being measured

Pipeline: MAG (attack) → CI-SIM (target) ← MMT sidecar (secAnoD: real mmt-probe +
mmt-security) → Kafka → AI4SOAR. The **Monitor agent** (server, `server/src/agent/monitor/`)
reads MMT security reports from the pod logs, groups them into an incident,
triages it with a small model (`MONITOR_MODEL`, default `qwen3:4b`), and the
**Boss Agent** proposes a response (proposal only, nothing is executed).

Metrics: detection rate, **MTTD** (attack start → incident opened), triage
latency, Boss-proposal latency, triage correctness (MITRE vs reference,
severity), triage fallback rate, **false-positive incidents** (no-attack runs).

Run matrix (default, ~1 h 15 min):

| Set                                     | Command flags                  | Runs |
| --------------------------------------- | ------------------------------ | ---- |
| Attack #1 (HTTP/SYN flood, MMT rule 56) | `--mode=attack --profile=0`    | 5    |
| No attack (false positives)             | `--mode=benign --duration=300` | 3    |

## Rules

- Node ≥ 22.12: run `source ~/.nvm/nvm.sh && nvm use 22` in every shell first.
- Install with `npm ci` only (never bun). Never commit with `--no-verify`.
- Keep the Mac awake: prefix long commands with `caffeinate -dims`.
- One experiment at a time (runs share the local Ollama/GPU; parallel runs distort latency).
- Use the dedicated kubeconfig `~/.kube/secsim-kind.yaml`; never touch `~/.kube/config`.

## 1. Preflight (all must pass)

```bash
cd /Users/vietpham/Documents/thesis/code/mi-digitaltwin-management-service
git branch --show-current                      # viet-monitor-agent
docker info >/dev/null && echo docker-ok
kind get clusters | grep -x secsim             # cluster exists
kubectl --kubeconfig ~/.kube/secsim-kind.yaml get nodes   # Ready
docker exec secsim-control-plane crictl images | grep -E "secsim-e2e-stub|secanod-mmt-image"   # both present
curl -s localhost:11434/api/tags | grep -oE '"(qwen3:4b|qwen3:14b|mxbai-embed-large:latest)"' | sort -u   # 3 models
lsof -nP -iTCP:27017 -sTCP:LISTEN | head -2    # MongoDB (Homebrew mongod) listening
lsof -nP -iTCP:3000 -sTCP:LISTEN               # must be EMPTY (stop any dev server first)
```

Recovery if a check fails:

- **No cluster**: `kind create cluster --name secsim --kubeconfig ~/.kube/secsim-kind.yaml`,
  then load images (next item) and run the driver once (step 2 note).
- **Images missing**: `docker build -t secsim-e2e-stub:local scripts/e2e-kind/stub` and
  `docker build -t secanod-mmt-image:kafka scripts/secanod-kafka`, then
  `kind load docker-image <image> --name secsim` for both. (Loading Docker Hub images such as
  `apache/kafka` may fail with "content digest not found" — harmless, the cluster pulls them.)
- **Model missing**: `ollama pull qwen3:4b` (or the missing one).
- **Catalog images**: the local DB must point MAG / CI-SIM / AI4SOAR / HTTP-SIM at
  `secsim-e2e-stub:local` and SECANOD at `secanod-mmt-image:kafka`. Running the repo driver once
  sets the stub images: `ADMIN_PASSWORD='IntactAdmin2026!' E2E_KUBECONFIG=$HOME/.kube/secsim-kind.yaml node scripts/e2e-kind/run-e2e.js`
  (needs the server running, step 2; expect `PASS` lines and exit 0). If a CI-SIM pod fails with
  `InvalidImageName`, fix SECANOD's image in MongoDB (`services` collection, `shortName: 'SECANOD'`,
  `versions.0.dockerImage = 'secanod-mmt-image:kafka'`).

## 2. Start the server (dedicated terminal / background)

```bash
cd server && MONITOR_MODEL=qwen3:4b nohup npm start > /tmp/monitor-eval-server.log 2>&1 &
until curl -s localhost:3000/api/health | grep -q ok; do sleep 2; done; echo up
cd ..
```

## 3. Smoke test (validates benign mode, ~4 min)

```bash
export SCENARIO_ID=6ab0ebc62753372b7ac5b989 ADMIN_PASSWORD='IntactAdmin2026!'
R=server/scripts/monitor-eval/results
node server/scripts/monitor-eval/run-monitor-demo.mjs --mode=benign --duration=60 --out=$R/smoke-benign.json
```

Expect `benign: N incident(s)` and a JSON summary. If `SCENARIO_ID` is not found, look it up:
the scenario titled "CI attack → MMT detection → AI4SOAR block" (project MONTIMAGE-DEMO).

## 4. Run the matrix

```bash
caffeinate -dims node server/scripts/monitor-eval/run-monitor-demo.mjs --mode=attack --profile=0 --runs=5 --out=$R/attack1-5runs.json
caffeinate -dims node server/scripts/monitor-eval/run-monitor-demo.mjs --mode=benign --duration=300 --runs=3 --out=$R/benign-3runs.json
node server/scripts/monitor-eval/summarize.mjs $R/run1.json $R/attack1-5runs.json $R/benign-3runs.json
```

Each attack run deploys the scenario (~1–2 min), starts the Monitor, runs MAG's profile, waits for
the Boss proposal (~1 min) and tears down. If a run fails (timeout, deploy failed), note it, check
`/tmp/monitor-eval-server.log` (`grep -E "ERROR|WARN" | tail`), and re-run only the missing runs
into a new file. Verify no namespace is left behind:
`kubectl --kubeconfig ~/.kube/secsim-kind.yaml get ns | grep secsim-` (should be empty).

## 5. Report back

Write `server/scripts/monitor-eval/results/REPORT-<YYYY-MM-DD>.md` with:

1. The table printed by `summarize.mjs`.
2. Per-run anomalies (failed runs, fallback triage, wrong MITRE id, unexpected severity,
   any false-positive incident with its rule/source).
3. Two example Boss proposals (copy the `proposal` field) and one sentence on their quality
   (does it name a catalog service that can act, e.g. AI4SOAR, and stay a proposal?).
4. Environment: date, git commit (`git rev-parse --short HEAD`), `MONITOR_MODEL`, Node version.

Then stop the server (`kill $(lsof -tiTCP:3000 -sTCP:LISTEN)`), commit the `results/` files on
`viet-monitor-agent` (`test(eval): monitor-agent experiment results <date>`), and **do not push**
unless asked. Reply with the table and the anomalies.

## Office variant: real Montimage images (optional, company network only)

On the company network `registry.montimage.eu` may resolve. Check first:
`dscacheutil -q host -a name registry.montimage.eu` and
`docker pull registry.montimage.eu/montimage-mti/mag:v1.0.0` (may need `docker login registry.montimage.eu`).
If the pull works: pull mag, ci-sim, ai4soar, `kind load docker-image` each into `secsim`
(the deploy engine attaches no pull secret, so images must be preloaded), point the catalog
versions back to the `registry.montimage.eu/...` references, and repeat steps 3–5. Real MAG adds
attack profiles for MMT rules 20 (ICMP flood) and 51 (ping of death): run each with
`--profile=<index>` (list them via `GET /api/scenarios/<id>/executions/<eid>/profiles`). If the
pull fails, report the exact error — do not keep retrying.

Known limits to mention in the report: attacks come from a stand-in MAG (HTTP flood only →
rule 56); benign mode observes an idle scenario (kubelet probes only), not realistic user traffic;
incidents are in memory (a server restart loses them).
