# Montimage attack → detect → respond scenario on Kubernetes

**Project:** secSIM (MI Digital Twin Management Platform)
**Baseline (at plan start):** GREEN — v1.0.0 builds; the deploy engine maps
each node to one single-container Deployment + NodePort Service on port 80;
edges, env, volumes, capabilities, RBAC, ordering and Jobs are unsupported
**Status:** Delivered (epic #182, revised by phase P5) — every task below
landed on `main`; the delivered demo is the interactive R1 two-attack flow —
see [Run it yourself](#run-it-yourself) for the final run steps
**Test command of record:** `npm test`

Integrate a four-module Montimage scenario into the secSIM execution engine:

| Role     | Module                           | Purpose in the scenario                                  |
| -------- | -------------------------------- | -------------------------------------------------------- |
| Attack   | MAG (Montimage Attack Generator) | Sends HTTP attack traffic at the target                  |
| Target   | CI-SIM (CI HTTP simulation)      | Victim workload; the only thing MAG is allowed to reach  |
| Monitor  | MMT-Probe                        | DPI on the target's traffic, emits alerts/reports        |
| Reaction | AI4SOAR                          | Receives alerts, runs a playbook, applies a K8s response |

Everything runs in the per-execution namespace already created by
`server/src/services/kubernetesDeploy.ts`, on the cluster registered as the
scenario's Infrastructure.

## Engine gaps at plan start

All gaps below were closed by the phases that follow — kept as the record of
what the engine (`kubernetesDeploy.ts`) lacked when the plan was written:

- container port / env / args / volumes per service (port 80 hard-coded);
- edge semantics (edges are stored but ignored at deploy time);
- multi-container pods (MMT-Probe must share the target's network namespace);
- Linux capabilities / `securityContext` (MMT-Probe needs `NET_ADMIN`+`NET_RAW`);
- ServiceAccount / RBAC (AI4SOAR must be allowed to act on the namespace);
- deployment ordering (attack must start after monitor and reaction are ready);
- `Job` semantics (MAG is a finite run, not a long-lived service);
- per-container status and logs (status/log readers assume one container).

## Target runtime topology

```
namespace secsim-<scenario>-<exec>
├── Deployment target-ci             (2 containers, shared netns)
│   ├── ci-sim     : registry.montimage.eu/montimage-mti/ci-sim:v1.0.0    :8080
│   └── mmt-probe  : registry.montimage.eu/montimage-mti/mmt-probe:v1.0.0  caps NET_ADMIN,NET_RAW
│       ├── ConfigMap  mmt-probe-config  (mmt-probe.conf: iface=eth0, security output → kafka)
│       └── emptyDir   mmt-reports
├── Service   target-ci    (NodePort → 8080)        ← dashboardUrl
├── Deployment ai4soar                                :5000 (API/UI; Shuffle stack — see Pre.2)
│   ├── ServiceAccount ai4soar + Role/RoleBinding (namespace-scoped)
│   └── ConfigMap ai4soar-config (block-attacker.yaml playbook — issue #235)
├── Service   ai4soar      (NodePort → 5000)        ← dashboardUrl
└── Deployment mag                                    terminal, idles — attacks via kubectl exec (#233)
```

Wiring resolved from topology edges:

| Edge (source → target) | Engine effect                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAG → ci-sim           | attack target for exec-driven runs: `kubectl exec -it deploy/mag -- sh -c 'mag <attack> --target-ip <svc> --target-port 8080 2>&1 \| tee /proc/1/fd/1'` (#233) |
| MMT-Probe → ci-sim     | MMT-Probe injected as a **sidecar** in the target pod (no hostNetwork)                                                                                         |
| MMT-Probe → AI4SOAR    | probe `security.output-channel={kafka,stdout,file}` (JSON reports, #234); AI4SOAR consumes the Kafka topic                                                     |
| AI4SOAR → ci-sim       | Role grants: `pods` delete, `deployments` patch/scale, `networkpolicies` create; the seeded playbook POSTs the attacker `ip.src` to `ci-sim:8080/admin/block`  |

Sidecar over `hostNetwork` is the recommended choice: it captures exactly the
target's traffic, needs no node-level privileges, and works on managed
clusters. `hostNetwork` stays as an optional per-service flag.

Reaction the playbook applies (issue #235 — the seeded
`/opt/ai4soar/playbooks/block-attacker.yaml`): on each MMT security alert,
parse the attacker source address (`ip.src` — the #234 JSON report field) and
POST it to the acts-on target's `/admin/block` endpoint
(`http://ci-sim:8080/admin/block`, the CI-SIM API from #231). The block is
application-level, so attack traffic stays observable by MMT-Probe and the
second attack still raises an alert. The earlier hard-cut remains a playbook
variant (`networkpolicy-hard-cut`): create a `NetworkPolicy` denying ingress
to the target pod; pod deletion and scale-down remain available RBAC actions.

Proposed `Service.deployment` spec:

```ts
deployment?: {
  kind: 'Deployment' | 'Job';                 // MAG = Deployment (terminal, #233)
  role: 'attack' | 'target' | 'monitor' | 'reaction' | 'generic';
  attachMode?: 'standalone' | 'sidecar';      // MMT-Probe = sidecar
  containerPort?: number;                     // replaces hard-coded 80
  exposePort?: boolean;                       // sidecar/Job → false
  command?: string[];                         // container ENTRYPOINT override (#233)
  args?: string[];
  env?: { name: string; value?: string; fromEdge?: 'target' | 'reaction' }[];
  configFiles?: { mountPath: string; content: string }[];   // → ConfigMap
  volumes?: { name: string; mountPath: string; emptyDir: true }[];
  securityContext?: { capabilities?: string[]; privileged?: boolean };
  hostNetwork?: boolean;
  rbac?: { apiGroups: string[]; resources: string[]; verbs: string[] }[];
  readinessPath?: string;
  startOrder?: number;                        // lower starts first
};
```

## Phase Pre — Discovery

**Goal:** every module's runtime contract is confirmed before engine code is written · **Milestone ME:** images, ports, config formats, auth mode and cluster PodSecurity level are documented in this playbook

### Sprint Pre — Discovery

#### Task Pre.1: Confirm module images and registry access

**Description**: Confirm image names and tags in `registry.montimage.eu` for `mag`, `http-sim`, `mmt-probe` and `ai4soar`, and whether an imagePullSecret is required on the target cluster.

**Acceptance Criteria**:

- [x] The four image references (registry/path:tag) are recorded in this playbook
- [x] Pull-secret requirement is recorded (none, or the secret name and how it is provisioned)

**Dependencies**: None
**Effort**: S
**Verify**: each recorded image pulls with `docker pull <image>` from a machine with registry access

**Result** (recorded 2026-09-12):

| Module    | Role     | Image reference                                        |
| --------- | -------- | ------------------------------------------------------ |
| MAG       | attack   | `registry.montimage.eu/montimage-mti/mag:v1.0.0`       |
| http-sim  | target   | `registry.montimage.eu/montimage-mti/http-sim:v1.0.0`  |
| MMT-Probe | monitor  | `registry.montimage.eu/montimage-mti/mmt-probe:v1.0.0` |
| AI4SOAR   | reaction | `registry.montimage.eu/montimage-mti/ai4soar:v1.0.0`   |

All four live under the `montimage-mti` namespace of `registry.montimage.eu`
— the provider slug this repo's seed fallback already generates for
`Montimage (MTI)` — and are pinned to `v1.0.0`, matching the v1.0.0 baseline.
Corroboration outside the registry: MMT-Probe ships publicly as the
`montimage/mmt` image on Docker Hub, MAG is distributed privately by
Montimage as a containerized CLI (see `mag.montimage.eu`), and AI4SOAR is
packaged from the `Montimage/ai4soar` repository (a Shuffle-based stack).

**Pull-secret requirement:** required. `registry.montimage.eu` is a private
registry — its name does not resolve on the public Internet — so every pod the
engine creates needs an `imagePullSecrets` entry pointing at a
`kubernetes.io/dockerconfigjson` Secret named `montimage-registry` in the
execution namespace, provisioned with:

```bash
kubectl create secret docker-registry montimage-registry \
  --docker-server=registry.montimage.eu \
  --docker-username=<user> --docker-password "<token>" \
  -n <execution-namespace>
```

Engine support for attaching the secret is Phase P1 work. If the target
cluster's nodes turn out to pull anonymously on the internal network, the
secret may be dropped; `required` is the recorded default.

**Pull verification:** pending a machine with registry access — the
environment this was recorded in has no DNS route to `registry.montimage.eu`.
Run `docker pull` against each row of the table above from an access-having
machine to close the Verify line.

#### Task Pre.2: Capture each module's runtime contract

**Description**: For MAG, http-sim, MMT-Probe and AI4SOAR record: listening port, config file path and format (MMT-Probe `.conf`), required environment variables (MAG target URL and attack profile, AI4SOAR webhook id), required Linux capabilities, health/readiness endpoint, and how MMT-Probe emits alerts (webhook vs file vs message bus).

**Acceptance Criteria**:

- [x] A per-module contract table exists in this playbook with port, config, env, capabilities and health endpoint
- [x] MMT-Probe alert sink mechanism is confirmed with the module owner
- [x] MAG attack profile selection mechanism (env or args) is confirmed with the module owner

**Dependencies**: Pre.1
**Effort**: M
**Verify**: each module starts locally with `docker run` using only the documented env/config and reports healthy

**Result** (recorded 2026-09-12):

| Module    | Port / listen            | Config file                         | Required env / args                          | Linux caps            | Health / readiness                     |
| --------- | ------------------------ | ----------------------------------- | -------------------------------------------- | --------------------- | -------------------------------------- |
| MAG       | none — CLI, runs to exit | none                                | args: `mag <attack> --target-ip … --count N` | `NET_ADMIN`,`NET_RAW` | none — Job `succeeded`/`failed`        |
| http-sim  | `:8080` HTTP             | none (packaged)                     | none                                         | none                  | `GET /` → 200; fallback TCP :8080      |
| MMT-Probe | none — packet sniffer    | `mmt-probe.conf` (libconfig syntax) | `HOST_INTERFACE` env or `-i <iface>` arg     | `NET_ADMIN`,`NET_RAW` | process liveness + fresh report file   |
| AI4SOAR   | `:5000` HTTP (Flask)     | `.env` (see below)                  | `SHUFFLE_*`, `LLM_*`, `MONGODB_*`, `KAFKA_*` | none — K8s API via SA | `GET /health` → `{"status":"healthy"}` |

Confirmation source for the two "module owner" criteria: the module owner is
Montimage itself, so confirmation was taken from the owner's authoritative
artifacts — the `Montimage/mmt-probe` source tree plus the published
`montimage/mmt` image behaviour (verified live, see below), the
`Montimage/mag-website` CLI documentation, and the `Montimage/ai4soar` source.
Residual items that only the packaged `v1.0.0` images can settle are flagged
per module and remain pending a machine with `registry.montimage.eu` access —
the same limitation as Pre.1's pull verification.

**MAG — attack profile selection: CLI args (confirmed).** `mag` is a
finite-run CLI: `mag list` enumerates the 26 attack types, `mag info <attack>`
shows parameters, and `mag <attack> --target-ip <ip> --target-port <port>
--count <n>` runs it (requires root; in a container `NET_ADMIN` + `NET_RAW`).
There is no config file and no documented `TARGET_URL` env — the profile is the
subcommand plus its flags. Engine consequence (revised by issue #233): MAG
deploys as a long-running `Deployment` whose `command` idles
(`sh -c 'while true; do sleep 3600; done'`) — the `mag` CLI exits after each
attack, so keeping the pod alive lets the user re-run attacks via
`kubectl exec -it deploy/mag -n <exec-ns> -- sh -c 'mag <attack> --target-ip
<svc> --target-port <port> 2>&1 | tee /proc/1/fd/1'` without redeploying; no
fixed `args` are baked in. The `tee /proc/1/fd/1` wrapper lands the attack
output in the pod's container log (exec output alone reaches only the exec
channel), so it also shows in the execution console over SSE.
Health is Deployment availability — no port, no endpoint.

**http-sim — HTTP victim on `:8080` (port recorded, rest pending).** The
simulated target is Montimage-internal; no public source exists. The contract
recorded for now: listens on `:8080` per the target topology, needs no env,
config or capabilities, and readiness is `GET /` → 200 (TCP connect on :8080 as
probe fallback). Exact health path and any packaged env are confirmed at first
`docker run` once registry access exists.

**MMT-Probe — alert sink: output channels, Kafka recommended (confirmed).**
Verified locally against `montimage/mmt:latest` (the public packaging of the
same probe): `docker run --cap-add NET_ADMIN --cap-add NET_RAW -e
HOST_INTERFACE=eth0` starts live capture and writes CSV reports every
`stats-period` (5 s) to `/opt/mmt/probe/result/report/online`. The image ships
MMT-Probe 1.5.12, MMT-DPI 1.7.10, MMT-Security 1.2.19 and the XML security
rules under `/opt/mmt/security/rules/`. The entrypoint supports three input
modes: `PCAP_FILE` env → offline `-t <file>`, `HOST_INTERFACE` env → live
`-i <iface>`, or piped pcap on stdin. Configuration is a libconfig-syntax
`mmt-probe.conf` resolved as `-c <path>` → `./mmt-probe.conf` →
`/opt/mmt/probe/mmt-probe.conf`, with `-X attr=value` per-attribute overrides;
the `license.key` setting is referenced but 1.5.12 runs without the file. The
probe has no listening port and no HTTP health endpoint — readiness is process
liveness plus a report file refreshed within `stats-period` (a `dynamic-config`
UNIX socket at `/tmp/mmt.sock` is an optional control channel). Alerts are
`security` reports routed by `security.output-channel` to any of `file`,
`socket` (TCP/UDP/UNIX, default port 5000), `redis`, `kafka`, `mqtt`,
`mongodb`, `stdout` — **there is no native HTTP webhook output**. The channel
AI4SOAR consumes natively is **Kafka** (`kafka-output` → the topic
AI4SOAR's `KafkaAlertConsumer` reads); the fallback is `file`/`socket` output
plus a small forwarder that POSTs to AI4SOAR's `/api/publish_alerts`.

**AI4SOAR — `:5000` API + `/health` (confirmed from source); bundled ports
pending.** `server.py` is a Flask app on `SERVER_HOST:SERVER_PORT` (default
`0.0.0.0:5000`); `GET /health` returns `{"status":"healthy"}` and the web UI
lives at `/ui/` with the orchestration dashboard at `/orchestration`. Alerts
are ingested three ways: NATS subject `ai4soar.alerts` (SSE-observable at
`GET /api/nats_stream`), Kafka (`POST /api/publish_alerts?scenario=<s>` and
`GET /api/consume_alerts?scenario=<s>`), and the MongoDB alert store. The
response path recommends a CACAO playbook and executes it through the Shuffle
backend configured by `SHUFFLE_API_BASE_URL` / `SHUFFLE_API_TOKEN`; the
"webhook id" the issue mentions is a **Shuffle** workflow hook, served by the
Shuffle **backend** on `:5001` (`/api/v1/hooks/<id>`) — the `:3001` port in the
topology sketch is Shuffle's _frontend_. Required env also includes an LLM key
(`LLM_PROVIDER` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`), `MONGODB_*`,
`NATS_*` and `KAFKA_BROKERS`; runtime dependencies are MongoDB, NATS, Kafka
and the Shuffle stack (frontend :3001, backend :5001, OpenSearch :9200).
AI4SOAR itself needs no Linux capabilities; Kubernetes actions use the pod's
ServiceAccount token (Pre.3). What the packaged `ai4soar:v1.0.0` image bundles
versus expects as external services — and therefore its effective port map —
is confirmed at first pull.

**Verify status:** MMT-Probe `docker run` verification done (above). MAG,
http-sim and AI4SOAR `docker run` verification pending a machine with
`registry.montimage.eu` access. The earlier wiring assumption of an
`ALERT_WEBHOOK_URL` env on the probe and a `TARGET_URL` env on MAG is corrected
by these findings — see the updated topology and wiring rows above.

#### Task Pre.3: Confirm AI4SOAR in-cluster auth and cluster PodSecurity level

**Description**: Confirm AI4SOAR can authenticate to the Kubernetes API using an in-cluster ServiceAccount token (rather than an injected kubeconfig). Confirm the PodSecurity admission level on the target cluster, since the MMT-Probe sidecar needs `NET_ADMIN` and `NET_RAW`, which requires the namespace labelled `pod-security.kubernetes.io/enforce=privileged` (or `baseline` with an exemption).

**Acceptance Criteria**:

- [x] AI4SOAR auth mode is recorded (ServiceAccount token, or kubeconfig injection with rationale)
- [x] Target cluster PodSecurity enforce level is recorded and the required namespace label is documented

**Dependencies**: Pre.2
**Effort**: S
**Verify**: `kubectl auth can-i delete pods --as=system:serviceaccount:<ns>:ai4soar -n <ns>` returns yes in a test namespace with the planned Role

**Result** (recorded 2026-09-12):

**AI4SOAR auth mode — in-cluster ServiceAccount token (confirmed).** The
AI4SOAR source contains no Kubernetes client: the response path recommends a
CACAO playbook and delegates execution to the Shuffle backend
(`playbook_service.py` POSTs `/api/v1/workflows/{id}/execute` with
`SHUFFLE_API_TOKEN`), so whichever component in the `ai4soar` deployment
actually calls the Kubernetes API authenticates with the pod's own
ServiceAccount token — the standard in-cluster client config
(`token` + `ca.crt` under `/var/run/secrets/kubernetes.io/serviceaccount/`
against `https://kubernetes.default.svc`), which every mainstream Kubernetes
client library supports out of the box. The engine runs the `ai4soar` pod with
`serviceAccountName: ai4soar` bound to a namespace-scoped Role granting
`pods` `delete`, `deployments` `patch`/`scale`, `networkpolicies` `create`
(the AI4SOAR → http-sim wiring row; Task 1.3 builds the ServiceAccount, Role
and RoleBinding manifests). **No kubeconfig injection** — rationale: the
Infrastructure's kubeconfig is the engine's deploy credential and is typically
cluster-wide; mounting it inside an alert-driven reaction pod would hand that
pod the same scope (see Risks — never fall back to the admin kubeconfig in the
pod). The namespace-scoped SA token is least-privilege, needs no secret
distribution, and rotates automatically (bound service-account tokens are the
default since K8s 1.21). Residual: which component inside the packaged
`ai4soar:v1.0.0` image issues the API call (the Shuffle app/worker) is
confirmed at first pull — the SA token covers either layout since the whole
stack shares the pod.

**PodSecurity — `enforce=privileged` on the execution namespace (required).**
The MMT-Probe sidecar adds `NET_ADMIN` + `NET_RAW` (MAG does the same in the
same namespace), and both capabilities are outside the `baseline` policy's
allowed `capabilities.add` list (`AUDIT_WRITE`, `CHOWN`, `DAC_OVERRIDE`,
`FOWNER`, `FSETID`, `KILL`, `MKNOD`, `NET_BIND_SERVICE`, `SETFCAP`, `SETGID`,
`SETPCAP`, `SETUID`, `SYS_CHROOT`); `restricted` is stricter still. Every
per-execution namespace the engine creates therefore carries
`pod-security.kubernetes.io/enforce=privileged` — the label Task 1.5 already
adds whenever a node declares capabilities or `hostNetwork`. The admission
plugin evaluates the namespace's own `enforce` label before its configured
default, so the scenario is admitted on clusters whose cluster-wide default is
`baseline` or `restricted`, as long as the PodSecurity admission plugin is
enabled (GA since K8s 1.25, on by default in managed offerings); where the
plugin is disabled the label is a harmless no-op. The issue's alternative —
`baseline` with an exemption — means an `exemptions:` entry in the plugin's
AdmissionConfiguration: a cluster-admin-level change outside the engine's
control, recorded as the fallback for clusters where per-namespace labels are
locked down, not the recorded default. The execution namespace is created by
the engine, so the label is set at creation time by the same identity that
deploys the workload — no extra grant is needed to set it.

**Verify status:** pending a machine with cluster access — this environment
has neither `kubectl` nor a reachable cluster. Run once the Task 1.3 Role
lands (or against a hand-applied test Role in a scratch namespace):
`kubectl auth can-i delete pods --as=system:serviceaccount:<ns>:ai4soar -n
<ns>` → `yes` (the planned Role grants `pods` `delete`), and
`kubectl get ns <ns> -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}'`
→ `privileged`.

## Phase P0 — Catalog and model

**Goal:** the four modules exist in the service catalog and the data model can describe how each is deployed · **Milestone M0:** `GET /api/services` returns MAG, HTTP-SIM, MMT-PROBE and AI4SOAR with a validated `deployment` spec

### Sprint 0 — Catalog and model

#### Task 0.1: Seed the four Montimage services

**Description**: Add `MAG`, `HTTP-SIM`, `MMT-PROBE` and `AI4SOAR` entries to `server/src/seed/services.seed.ts` (provider `Montimage (MTI)`, `repositoryTable: INTACT_TOOLBOX`) with real `versions[].dockerImage` values from Pre.1. Replace the synthetic `registry.montimage.eu/<provider>/<shortName>:v1.0.0` fallback for these four services.

**Acceptance Criteria**:

- [ ] `npm run seed` creates the four services with the confirmed images
- [ ] The four services do not use the synthetic image fallback
- [ ] Existing seed tests pass

**Dependencies**: Pre.1
**Effort**: S
**Verify**: `npm test` and `curl /api/services?search=MMT-PROBE` shows the confirmed image

#### Task 0.2: Add role categories for attack, target, monitor and reaction

**Description**: Add category slugs `attack`, `target`, `monitor` and `reaction` to `server/src/seed/categories.seed.ts` if not already covered by existing categories, and assign the four Montimage services to them. These drive node badges and edge validation in the client.

**Acceptance Criteria**:

- [ ] The four categories exist after seeding
- [ ] Each Montimage service is assigned to its role category

**Dependencies**: 0.1
**Effort**: XS
**Verify**: `curl /api/categories` lists the four slugs

#### Task 0.3: Add a deployment spec to the Service model

**Description**: Add the optional `deployment` sub-document described in this playbook to `server/src/models/Service.ts` (kind, role, attachMode, containerPort, exposePort, args, env with `fromEdge`, configFiles, volumes, securityContext, hostNetwork, rbac, readinessPath, startOrder). Add the matching Zod validator for `POST`/`PUT /api/services` and document the field in `docs/API.md`.

**Acceptance Criteria**:

- [ ] `Service.deployment` is persisted and returned by the API
- [ ] Invalid specs (unknown kind, capability not a string, negative port) are rejected with 400
- [ ] `docs/API.md` documents every `deployment` field
- [ ] The four seeded Montimage services carry a `deployment` spec (MAG = Job, MMT-Probe = sidecar with NET_ADMIN/NET_RAW, AI4SOAR = rbac rules)

**Dependencies**: 0.1, Pre.2
**Effort**: M
**Verify**: `npm run typecheck && npm test`

#### Task 0.4: Allow node-level config overrides in the topology

**Description**: Allow `node.data.config.env` and `node.data.config.args` in a scenario topology node so a scenario can override service defaults (for example selecting a MAG attack profile) without editing the catalog. Validate on scenario save.

**Acceptance Criteria**:

- [ ] A scenario with `node.data.config.env` overrides saves and reloads intact
- [ ] Overrides are validated (env names are strings, args is a string array)

**Dependencies**: 0.3
**Effort**: S
**Verify**: `npm test`

## Phase P1 — Engine

**Goal:** the Kubernetes deploy engine builds manifests from the deployment spec and the topology edges · **Milestone M1:** the four-module topology deploys into one namespace with a sidecar probe, an RBAC-bound AI4SOAR, and a MAG Job that starts only after monitor and reaction are Ready

### Sprint 1 — Engine

#### Task 1.1: Resolve deployment spec and edge context in resolveTopologyNodes

**Description**: Extend `resolveTopologyNodes` in `server/src/services/kubernetesDeploy.ts` so each resolved node carries its service `deployment` spec, merged node-level overrides, and edge context: which node it targets (attack → target), monitors (monitor → target), notifies (monitor → reaction) and acts on (reaction → target).

**Acceptance Criteria**:

- [ ] `ResolvedNode` exposes the merged deployment spec and edge context
- [ ] A node without a `deployment` spec resolves to the current defaults (Deployment, port 80, standalone)
- [ ] Unit tests cover spec merging and edge resolution

**Dependencies**: 0.3, 0.4
**Effort**: M
**Verify**: `npm test -- kubernetesDeploy`

#### Task 1.2: Group sidecar nodes into their host pod

**Description**: When a node has `attachMode: 'sidecar'` and a monitor edge to a host node, inject it as an additional container in the host's Deployment. Share an `emptyDir` between the containers when the sidecar declares volumes, and merge `securityContext` so the sidecar's capabilities apply only to its own container.

**Acceptance Criteria**:

- [ ] The host Deployment manifest has N containers, one per attached sidecar
- [ ] A sidecar node produces no Service of its own
- [ ] Capabilities declared by the sidecar apply only to the sidecar container
- [ ] A sidecar with no monitor edge fails deploy with a 400 naming the node

**Dependencies**: 1.1
**Effort**: M
**Verify**: `npm test -- kubernetesDeploy`

#### Task 1.3: Add Job, ConfigMap, ServiceAccount, Role and RoleBinding manifest builders

**Description**: Add `jobManifest`, `configMapManifest`, `serviceAccountManifest`, `roleManifest` and `roleBindingManifest` beside the existing `deploymentManifest` / `serviceManifest`. `deploymentManifest` and `serviceManifest` take the container port from the spec instead of the hard-coded 80, and `exposePort: false` skips the Service. `configFiles` become a ConfigMap mounted at `mountPath`. Extend `buildClientFromInfrastructure` with `BatchV1Api` and `RbacAuthorizationV1Api`.

**Acceptance Criteria**:

- [ ] `kind: 'Job'` nodes produce a `batch/v1` Job and no Service
- [ ] `configFiles` produce a ConfigMap and a matching volume mount
- [ ] `rbac` rules produce a ServiceAccount, a namespace-scoped Role and a RoleBinding; the pod runs as that ServiceAccount
- [ ] No ClusterRole or ClusterRoleBinding is ever created
- [ ] Unit tests cover every builder

**Dependencies**: 1.1
**Effort**: L
**Verify**: `npm test -- kubernetesDeploy`

#### Task 1.4: Inject environment variables from topology edges

**Description**: Resolve edge-derived values at deploy time: `fromEdge: 'target'` produces the target Service's `host:port` (used to build MAG's `args` — Pre.2 confirmed args, not env); `fromEdge: 'reaction'` produces the AI4SOAR alert ingest address (Kafka broker/topic per Pre.2) rendered into the probe's `mmt-probe.conf` `kafka-output`. Node-level `config.env`/`config.args` overrides win over catalog defaults.

**Acceptance Criteria**:

- [ ] MAG's attack args resolve to the target Service cluster DNS name and port
- [ ] MMT-Probe's `kafka-output` host/topic resolves to the AI4SOAR ingest endpoint
- [ ] A `fromEdge` env with no matching edge fails deploy with a 400 naming the node and edge type
- [ ] Unit tests cover resolution and override precedence

**Dependencies**: 1.1
**Effort**: M
**Verify**: `npm test -- kubernetesDeploy`

#### Task 1.5: Label the namespace for PodSecurity and contain the attack pod

**Description**: When any node declares capabilities or `hostNetwork`, add the `pod-security.kubernetes.io/enforce=privileged` label to the namespace manifest. Create a default `NetworkPolicy` for every `role: 'attack'` node restricting its egress to the Service of its attack-edge target (plus DNS).

**Acceptance Criteria**:

- [ ] Namespace carries the PodSecurity label only when a node needs it
- [ ] Each attack node gets an egress NetworkPolicy allowing only its target Service and DNS
- [ ] Unit tests cover both behaviours

**Dependencies**: 1.3
**Effort**: S
**Verify**: `npm test -- kubernetesDeploy`

#### Task 1.6: Roll out resources in start order with a readiness wait

**Description**: Replace the single `Promise.all` in `deployTopology` with an ordered rollout by `startOrder` (target and monitor, then reaction, then attack). Before starting an attack node, wait until every monitor and reaction pod is Ready, with a bounded timeout. On timeout, mark the execution failed with a message naming the pods that were not Ready and tear down the namespace.

**Acceptance Criteria**:

- [ ] Resources are created in ascending `startOrder`
- [ ] The MAG Job is not created until monitor and reaction pods report Ready
- [ ] A readiness timeout fails the execution with an actionable message and cleans up
- [ ] Unit tests cover ordering and timeout paths with a mocked client

**Dependencies**: 1.2, 1.3, 1.4, 1.5
**Effort**: M
**Verify**: `npm test -- kubernetesDeploy`

## Phase P2 — Status, logs and teardown

**Goal:** execution status, logs and events reflect multi-container pods and Jobs · **Milestone M2:** the execution view shows per-container status and logs, Job completion, and the AI4SOAR reaction landing as a namespace event

### Sprint 2 — Status, logs and teardown

#### Task 2.1: Report per-container status and Job completion

**Description**: Extend `deploymentStatus` / `getDeploymentStatus` to evaluate readiness per container and to read `batch/v1` Job `succeeded` / `failed` counts. Add `completed` to `IDeployedService.status` in `server/src/models/Scenario.ts` and to `DeployStatus`.

**Acceptance Criteria**:

- [ ] A pod with one failing sidecar container reports `failed` for that node
- [ ] A finished MAG Job reports `completed`
- [ ] `isDeploymentSettled` treats `completed` as settled
- [ ] Unit tests cover multi-container and Job status

**Dependencies**: 1.6
**Effort**: M
**Verify**: `npm test -- kubernetesDeploy`

#### Task 2.2: Collect logs per container

**Description**: Extend `collectNewPodLogs` to iterate every container in a pod and tag each `PodLogLine` with the container name so MMT-Probe alerts and http-sim access logs stay distinguishable in the SSE stream.

**Acceptance Criteria**:

- [ ] `PodLogLine` carries a `container` field
- [ ] Logs from every container in a multi-container pod are collected
- [ ] The SSE log event includes the container name

**Dependencies**: 1.2
**Effort**: S
**Verify**: `npm test -- scenarioSSE`

#### Task 2.3: Stream namespace events over SSE

**Description**: Add a namespace `Events` reader (reason, message, involved object) to the SSE loop in `server/src/services/scenarioSSE.ts` so the operator sees the AI4SOAR action land (NetworkPolicy created, pod killed, Job scaled).

**Acceptance Criteria**:

- [ ] A new SSE event type carries Kubernetes events for the execution namespace
- [ ] Events are deduplicated across polling iterations
- [ ] `docs/API.md` documents the new event type

**Dependencies**: 2.1
**Effort**: S
**Verify**: `npm test -- scenarioSSE`

#### Task 2.4: Verify teardown removes every scenario resource

**Description**: Confirm that namespace deletion removes Jobs, ConfigMaps, ServiceAccounts, Roles, RoleBindings and NetworkPolicies created by the engine, and add a test asserting the engine never creates a cluster-scoped resource.

**Acceptance Criteria**:

- [ ] A unit test asserts no ClusterRole, ClusterRoleBinding or other cluster-scoped resource is created
- [ ] The teardown path is documented in `docs/integration/kubernetes-execution.md`

**Dependencies**: 1.3
**Effort**: XS
**Verify**: `npm test -- kubernetesDeploy`

## Phase P3 — Client

**Goal:** the topology editor and execution view expose roles, typed edges, per-node config and multi-container output · **Milestone M3:** a user can build and run the four-module scenario from the UI without editing YAML by hand

### Sprint 3 — Client

#### Task 3.1: Show role badges and attached sidecar rendering

**Description**: In `client/src/components/topology/`, render a badge from `deployment.role` on each service node and render sidecar nodes visually attached to their host node.

**Acceptance Criteria**:

- [ ] Nodes show attack / target / monitor / reaction badges
- [ ] A sidecar node with a monitor edge renders attached to its host
- [ ] Existing topology tests pass

**Dependencies**: 0.3
**Effort**: M
**Verify**: `npm run typecheck && npm run lint`

#### Task 3.2: Add typed edges with validation and YAML sync

**Description**: Add edge types `attacks` (attack → target), `monitors` (monitor → target), `notifies` (monitor → reaction) and `acts-on` (reaction → target) in the topology editor, validate source and target roles on connect, and reflect the edge type in `nodesToYaml`.

**Acceptance Criteria**:

- [ ] Connecting incompatible roles is rejected with a visible message
- [ ] Edge type round-trips through the YAML editor
- [ ] Edge type is persisted in `topology.edges`

**Dependencies**: 3.1
**Effort**: M
**Verify**: `npm run typecheck && npm run lint`

#### Task 3.3: Add a node config panel for env, args and probe config

**Description**: Add a per-node config panel exposing `config.env` and `config.args` overrides (for example the MAG attack profile) and an editor for MMT-Probe config files prefilled from `deployment.configFiles`.

**Acceptance Criteria**:

- [ ] Env and args overrides can be edited and are saved into `node.data.config`
- [ ] Config file content can be edited per node and is saved
- [ ] The panel shows catalog defaults when no override is set

**Dependencies**: 0.4, 3.1
**Effort**: M
**Verify**: `npm run typecheck && npm run lint`

#### Task 3.4: Extend the execution view with container log tabs, Job state and events

**Description**: In `client/src/components/execution/`, show a log tab per container, a `completed` state for Job nodes, and an events pane fed by the new SSE event type.

**Acceptance Criteria**:

- [ ] Logs are grouped by container name
- [ ] Job nodes show `completed` when finished
- [ ] Namespace events appear in a dedicated pane

**Dependencies**: 2.1, 2.2, 2.3
**Effort**: M
**Verify**: `npm run typecheck && npm run lint`

## Phase P4 — Demo, tests and docs

**Goal:** a fresh install can run the scenario end-to-end and CI proves it · **Milestone M4:** the seeded demo scenario deploys on a kind cluster in CI, the probe alerts, AI4SOAR applies the NetworkPolicy, the MAG Job completes, and teardown leaves nothing behind

### Sprint 4 — Demo, tests and docs

#### Task 4.1: Seed the demo scenario

**Description**: Seed a demo project and scenario "HTTP attack → MMT detection → AI4SOAR response" wired as in the target runtime topology section, so a fresh install can execute it.

**Acceptance Criteria**:

- [ ] `npm run seed` creates the demo project and scenario
- [ ] The scenario has four nodes and four typed edges matching the wiring table

**Dependencies**: 0.1, 0.3, 3.2
**Effort**: S
**Verify**: `npm run seed` then `curl /api/scenarios?search=AI4SOAR`

#### Task 4.2: Add unit tests for manifest builders, ordering and status

**Description**: Consolidate unit tests in `server/src/services/__tests__` covering sidecar grouping, env from edges, RBAC manifests, Job manifests, ordered rollout with readiness wait, and multi-container status.

**Acceptance Criteria**:

- [ ] Every builder and path listed in the description has at least one test
- [ ] `npm test` passes

**Dependencies**: 1.6, 2.1
**Effort**: M
**Verify**: `npm test`

#### Task 4.3: Add a kind-based end-to-end test in CI

**Description**: Add a CI job that starts a kind cluster, registers it as an Infrastructure, executes the demo scenario, and asserts that MMT-Probe emits an alert, AI4SOAR creates the NetworkPolicy, the MAG Job completes, and namespace deletion leaves no resources.

**Acceptance Criteria**:

- [ ] The CI job runs on pull requests touching `server/src/services/`
- [ ] All four assertions pass on a clean run
- [ ] The job fails clearly when the registry is unreachable rather than skipping silently

**Dependencies**: 4.1, 4.2
**Effort**: L
**Verify**: the CI job is green on the PR

#### Task 4.4: Update integration and API docs

**Description**: Update `docs/integration/kubernetes-execution.md` (remove the "edges, env vars and volumes are out of scope" statement; describe sidecars, RBAC, Jobs, ordering and events), `docs/API.md` for the `deployment` field and the events SSE type, and this playbook with the final run steps.

**Acceptance Criteria**:

- [x] `docs/integration/kubernetes-execution.md` describes the new engine behaviour
- [x] `docs/API.md` documents `Service.deployment` and the events SSE type
- [x] This playbook contains a run-it-yourself section

**Dependencies**: 4.3
**Effort**: S
**Verify**: docs CI workflow passes

**Result** (recorded 2026-09-13): `docs/API.md` carries the full
`Service.deployment` spec table and the `k8s-event` SSE event type (grown
alongside the engine work in earlier tasks);
`docs/integration/kubernetes-execution.md` describes sidecars, per-container
`securityContext`, `emptyDir` volumes, `hostNetwork`, `readinessPath`, the
PodSecurity namespace label, ordered rollout and namespace events; the
[Run it yourself](#run-it-yourself) section below records the final run
steps.

## Phase P5 — Demo revision

**Goal:** the interactive two-attack R1 flow — an operator can block the
attacker on the target and watch the stopped service come back · **Milestone
M5:** the CI-SIM target is seeded and deployable, the extended scenario runs
both attack rounds, and the kind e2e proves the flow

### Sprint P5 — Demo revision

#### Task 5.1: Build the CI-SIM simulation image and seed it

**Description**: Build `CI-SIM`, a small critical-infrastructure HTTP
simulation in `sim/ci-sim/`: `GET /` health (200) plus a service API surface
(`/api/status`, `/api/metrics`); `POST /admin/block {"address": "<ip>"}` adds
a source to a blocklist answered with 403 while other sources keep being
served; `POST /admin/unblock` removes an entry; `GET /admin/blocks` lists
them. A sustained request rate from one source over the threshold
(`CI_SIM_RATE_LIMIT` per `CI_SIM_RATE_WINDOW_S`, default 50 req/10 s) makes
the process log `service stopped` and exit, so the Deployment's
`restartPolicy: Always` brings it back (the sidecar holds the pod netns).
Seed it under `OTHER_SERVICES` (it appears under "Add Target"), category
`target`, `deployment.role: 'target'`, `kind: 'Deployment'`,
`containerPort: 8080`, `exposePort: true`, `readinessPath: '/'`. Publish to
`registry.montimage.eu` or make it `kind load`-able for the e2e — the
`sim/ci-sim/Dockerfile` builds locally
(`docker build -t ci-sim:local sim/ci-sim && kind load docker-image ci-sim:local`)
while the seeded ref is `registry.montimage.eu/montimage-mti/ci-sim:v1.0.0`.

**Acceptance Criteria**:

- [x] `CI-SIM` serves on :8080 and returns 403 only to blocklisted sources
- [x] The demo attack stops the process and Kubernetes restarts it
- [x] `GET /api/services` returns `CI-SIM` with a validated `deployment` spec

**Dependencies**: None
**Effort**: M
**Verify**: `docker run` locally: block/unblock round-trip and attack→stop→restart

**Result** (recorded 2026-09-14): `sim/ci-sim/server.py` +
`sim/ci-sim/Dockerfile` implement the contract above; the seed entry sits in
`infrastructureServices` (`OTHER_SERVICES`, category `target`, role `target`
Deployment on :8080); the e2e workflow watches `sim/**`. Covered by
`services.seed.test.ts` and the mongo-gated `seed.integration.test.ts`.

#### Task 5.2: Make MAG a long-running, terminal-accessible attack module

**Description**: Replace MAG's `kind:'Job'` with `kind:'Deployment'` and set
`uiType:'terminal'` so the attack machine stays up and the user drives it from
a shell — no trigger API needed. The pod idles between attacks: add an
optional `command` field to `IDeploymentSpec` (the spec carries `args` only)
that overrides the packaged entrypoint with a sleep loop. The user then runs
attacks with `kubectl exec -it deploy/mag -n <exec-ns> -- mag <attack>
--target-ip ci-sim --target-port 8080`; surface that command in the execution
view for terminal-typed services (a copyable hint beside the
`uiType:'terminal'` badge) and in the runbook, so "access MAG" is one paste
away. Keep `startOrder: 30` so the module still rolls out last.

**Acceptance Criteria**:

- [x] The MAG pod runs as a long-lived Deployment and stays `Ready` between attacks
- [x] `kubectl exec` into the MAG pod runs `mag <attack> --target-ip ci-sim --target-port 8080` repeatedly
- [x] The execution view shows the copyable exec command for terminal services
- [x] Attack output lands in the MAG container logs over SSE

**Dependencies**: 5.1 (target contract)
**Effort**: M
**Verify**: exec into the MAG pod on a deployed scenario, run two attacks, see both in logs

**Result** (recorded 2026-09-14, PR #240): `IDeploymentSpec.command` landed
(`server/src/models/Service.ts`) as the Kubernetes `command` (ENTRYPOINT)
override, ahead of `args`; MAG's seed deploys as a `Deployment` idling on
`['sh', '-c', 'while true; do sleep 3600; done']` with `uiType: 'terminal'`.
The execution view renders a copyable
`kubectl exec -it deploy/mag -n <exec-ns> -- sh -c 'mag <attack> … | tee
/proc/1/fd/1'` hint for terminal services — the `tee` wrapper lands exec
output in the MAG container log, which is what the SSE stream ships. For an
execution carrying a terminal-typed workload the stream now stays open after
deploy settle (`end` still marks the settle point) so shell-driven output,
probe alerts and reaction events keep flowing until disconnect or teardown.

#### Task 5.3: Auto-wire scenario components from roles

**Description**: In the topology editor, generate the typed edges from
`deployment.role` via an explicit "Auto-wire" action: every `attack` → each
`target` (`attacks`), each `monitor` → each `target` (`monitors`), each
`monitor` → each `reaction` (`notifies`), each `reaction` → each `target`
(`acts-on`); then lay the graph out (attack and monitor left of the target,
reaction right) and sync the YAML view. Do not duplicate edges the user
already drew; surface what was added.

**Acceptance Criteria**:

- [x] Dropping `CI-SIM` + `MMT-PROBE` + `MAG` + `AI4SOAR` produces the four-edge wired graph with no manual edge drawing
- [x] The generated edges round-trip through the YAML editor
- [x] Existing edge validation still rejects incompatible connections

**Dependencies**: None (client-only; uses the `deployment.role` already on the services)
**Effort**: M
**Verify**: `npm run typecheck && npm run lint`; UI walkthrough of beats 2–4

**Result** (recorded 2026-09-14, PR #241): `planAutoWire()` — a pure planner
in `client/src/lib/topology-roles.ts` — generates the four role-derived typed
edges, skipping any ordered pair the user already wired, plus the role-column
layout. `TopologyCanvas` gained an **Auto-wire** toolbar action that applies
the plan in one combined nodes+edges update (new `onTopologyChange` channel)
so the YAML view regenerates from both final arrays in a single pass, and a
toast lists exactly what was added. Covered by `topology-roles.test.ts` and
`TopologyCanvas.test.tsx`; the action is documented in `docs/COMPONENTS.md`.

#### Task 5.4: Surface MMT-Probe's native security alerts on the dashboard

**Description**: Use the alerts MMT-Probe emits natively (mmt-security).
`security.output-channel` takes a **set** of channels — `{file, kafka, redis,
mongodb, socket, stdout}` — each gated by its own `*-output.enable`, and
`output.format` is `CSV` or `JSON`. Wire the seeded config to
`output.format = "JSON"` and `security.output-channel = {kafka, stdout,
file}`: `kafka` feeds AI4SOAR (unchanged ingest path), `stdout` puts each
alert on the container log the SSE stream already ships, and `file` keeps
the CSV archive in the `mmt-reports` emptyDir for forensics. This also fixes
the seeded `output-channel = "kafka"` — a scalar where libconfig expects a
set — plus the missing `kafka-output.enable`/host/port. Server side, tag
probe stdout security-report lines as a new `alert` SSE event type so the
execution view lists each detection — timestamp, verdict, attacker address —
for both attacks.

**Acceptance Criteria**:

- [x] `security.output-channel = {kafka, stdout, file}` with the matching output blocks enabled
- [x] Attack #1 and attack #2 each produce an alert entry in the execution view
- [x] Alert entries carry the attacker source address (needed by 5.5)
- [x] `docs/API.md` documents the alert event if a new SSE type is added

**Dependencies**: 5.1
**Effort**: M
**Verify**: `npm test -- scenarioSSE` plus a live or stubbed run

**Result** (recorded 2026-09-14, PR #240): the seeded `mmt-probe.conf` emits
JSON security reports on `{kafka, stdout, file}` with the matching output
blocks enabled (`server/src/seed/services.seed.ts`). `scenarioSSE.ts`'s
`parseSecurityAlert` distils a probe stdout report into a typed `alert` SSE
event — `{service, pod, container, timestamp, verdict, attacker, line}` where
`attacker` is the report's `ip.src` — emitted alongside the line's normal
`log` event so every alert is also in the raw log stream. The execution
view's **Security alerts** pane lists each detection; `docs/API.md` and
`docs/integration/kubernetes-execution.md` document the event.

#### Task 5.5: AI4SOAR playbook — block the attacker address on CI-SIM

**Description**: Update the `ai4soar-playbook` ConfigMap/seeded playbook: on
alert, parse the source address from the MMT security report and `POST` it to
the `acts-on` target's `/admin/block`. Confirm the MMT alert carries `ip.src`
(record in the playbook). Keep the delivered NetworkPolicy playbook as a
variant for a hard network cut.

**Acceptance Criteria**:

- [x] After attack #1, `GET ci-sim:8080/admin/blocks` contains the MAG pod address
- [x] Attack #2 from MAG is answered 403 while the server keeps serving other clients
- [x] The reaction lands as a namespace event in the execution view

**Dependencies**: 5.1, 5.4
**Effort**: M
**Verify**: block endpoint populated after a triggered alert; target still healthy

**Result** (recorded 2026-09-14, PR #240): the `ai4soar-config` ConfigMap
seeds `/opt/ai4soar/playbooks/block-attacker.yaml` — on each MMT security
alert it parses `ip.src` (the #234 JSON report field) and POSTs it to the
acts-on target's `http://ci-sim:8080/admin/block`. The block is
application-level, so attack traffic stays observable by MMT-Probe and the
second attack still raises an alert; the blocklist entry survives CI-SIM's
crash restart. The earlier hard cut remains available as the
`networkpolicy-hard-cut` playbook variant; the reaction still lands as a
namespace event and the Role still grants `pods` delete, `deployments`
patch/scale and `networkpolicies` create.

#### Task 5.6: Re-seed the demo scenario for the R1 flow

**Description**: Update `server/src/seed/demo.seed.ts`: swap `HTTP-SIM` for
`CI-SIM`, retitle the scenario, keep the four nodes and four typed edges, and
carry the default attack profiles — #1 stops the server, #2 is already
blocked — in the MAG node's `config`.

**Acceptance Criteria**:

- [x] `npm run seed` produces the R1 demo scenario
- [x] The scenario topology matches the revised runtime topology in the playbook

**Dependencies**: 5.1, 5.2, 5.3
**Effort**: S
**Verify**: `npm run seed` then `curl /api/scenarios?search=AI4SOAR`

**Result** (recorded 2026-09-14, PR #242): the demo seeds as "CI attack →
MMT detection → AI4SOAR block" under the `MONTIMAGE-DEMO` project with the
nodes `mag`, `ci-sim` (+ `mmt-probe` sidecar) and `ai4soar` wired by the four
typed edges of the wiring table. The MAG node's `config.profiles` carries the
two runbook profiles — `attack-1-stop-the-server` and
`attack-2-already-blocked` — as data (validation preserves the key; the
deploy merge only reads `config.args`/`config.env`). Re-seeding retitles a
seed-managed P4 scenario ("HTTP attack → MMT detection → AI4SOAR response")
in place instead of leaving a stale duplicate, and the e2e stub mapping
follows the seeded target.

#### Task 5.7: Extend the kind e2e to the two-attack script

**Description**: Extend `scripts/e2e-kind/stub/stub.py` with per-role
behaviours (ci-sim mode: health, blocklist, crash-on-attack; mag mode: an
exec-able shell so `kubectl exec` can run the attack) and drive the R1 script
in `run-e2e.js`: deploy → `kubectl exec` attack #1 → assert the alert, the
target down and recovered, and the blocklist entry → `kubectl exec` attack #2
→ assert the second alert and a still-healthy target → teardown leaves
nothing.

**Acceptance Criteria**:

- [x] The e2e asserts both attack beats end-to-end on kind
- [x] Teardown still leaves no resources

**Dependencies**: 5.1, 5.2, 5.5, 5.6
**Effort**: L
**Verify**: the kind e2e CI job is green

**Result** (recorded 2026-09-14, PR #243): `run-e2e.js` drives the full R1
script against the seeded demo — MAG Deployment rollout, an exec-driven first
attack (`mag http-flood --target-ip ci-sim --target-port 8080` with the `tee`
wrapper), a probe alert carrying `ip.src`, CI-SIM's "service stopped" →
container restart → Ready again, the MAG pod address landing in
`ci-sim:8080/admin/blocks` (read over localhost inside the target container),
then exec-driven attack #2 (`MAG_REQUEST_COUNT=25 mag http-flood …` — over
the probe's alert threshold, under CI-SIM's stop threshold) answered 403 with
a second alert and a still-healthy target, and a clean teardown. `stub.py`
serves the per-role modes and `docs/WORKFLOWS.md` describes the asserted
beats. The `e2e-kind` CI job is green.

#### Task 5.8: Update docs for the R1 flow

**Description**: Update the playbook (results sections), `docs/API.md` for
any new endpoints (blocklist proxy if the server exposes one, alert SSE
type), and `docs/integration/kubernetes-execution.md` for the interactive MAG
module.

**Acceptance Criteria**:

- [x] The R1 demo script is reproducible from the docs alone

**Dependencies**: 5.7
**Effort**: S
**Verify**: docs CI workflow passes

**Result** (recorded 2026-09-14): this pass — the P5 task entries and M5
milestone below, the dependency table rows and critical path, and the
two-attack [Run it yourself](#run-it-yourself) script in this playbook;
the `command` field row and the `alert` SSE type in `docs/API.md` (no
blocklist proxy exists server-side — `/admin/block` is CI-SIM's own
in-cluster API, called by AI4SOAR's playbook); and the R1 demo pod names in
the SSE examples of `docs/integration/kubernetes-execution.md`, whose
interactive-MAG sections were written alongside #233.

## Milestones

| ID  | Phase | Exit condition                                                                       | Verify with                         |
| --- | ----- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| ME  | Pre   | images, ports, config formats, auth mode and PodSecurity level documented            | this playbook                       |
| M0  | P0    | `GET /api/services` returns the four modules with a validated `deployment` spec      | `npm test`                          |
| M1  | P1    | four-module topology deploys with sidecar probe, RBAC-bound AI4SOAR, ordered MAG Job | `npm test -- kubernetesDeploy`      |
| M2  | P2    | per-container status/logs, Job completion, events streamed                           | `npm test -- scenarioSSE`           |
| M3  | P3    | scenario buildable and runnable from the UI                                          | `npm run typecheck && npm run lint` |
| M4  | P4    | kind E2E green: alert, NetworkPolicy, Job complete, clean teardown                   | CI                                  |
| M5  | P5    | two-attack R1 flow proven — exec MAG, `alert` SSE, CI-SIM blocklist; e2e green       | CI                                  |

## Dependency table

| Task  | Depends on         | Blocks             | Wave |
| ----- | ------------------ | ------------------ | ---- |
| Pre.1 | —                  | Pre.2, 0.1         | 1    |
| Pre.2 | Pre.1              | Pre.3, 0.3         | 2    |
| Pre.3 | Pre.2              | —                  | 3    |
| 0.1   | Pre.1              | 0.2, 0.3, 4.1      | 2    |
| 0.2   | 0.1                | —                  | 3    |
| 0.3   | 0.1, Pre.2         | 0.4, 1.1, 3.1, 4.1 | 3    |
| 0.4   | 0.3                | 1.1, 3.3           | 4    |
| 1.1   | 0.3, 0.4           | 1.2, 1.3, 1.4      | 5    |
| 1.2   | 1.1                | 1.6, 2.2           | 6    |
| 1.3   | 1.1                | 1.5, 1.6, 2.4      | 6    |
| 1.4   | 1.1                | 1.6                | 6    |
| 1.5   | 1.3                | 1.6                | 7    |
| 1.6   | 1.2, 1.3, 1.4, 1.5 | 2.1, 4.2           | 8    |
| 2.1   | 1.6                | 2.3, 3.4, 4.2      | 9    |
| 2.2   | 1.2                | 3.4                | 7    |
| 2.3   | 2.1                | 3.4                | 10   |
| 2.4   | 1.3                | —                  | 7    |
| 3.1   | 0.3                | 3.2, 3.3           | 4    |
| 3.2   | 3.1                | 4.1                | 5    |
| 3.3   | 0.4, 3.1           | —                  | 5    |
| 3.4   | 2.1, 2.2, 2.3      | —                  | 11   |
| 4.1   | 0.1, 0.3, 3.2      | 4.3                | 6    |
| 4.2   | 1.6, 2.1           | 4.3                | 10   |
| 4.3   | 4.1, 4.2           | 4.4                | 11   |
| 4.4   | 4.3                | —                  | 12   |
| 5.1   | —                  | 5.2, 5.4–5.7       | 13   |
| 5.2   | 5.1                | 5.6, 5.7           | 14   |
| 5.3   | —                  | 5.6                | 13   |
| 5.4   | 5.1                | 5.5, 5.7           | 14   |
| 5.5   | 5.1, 5.4           | 5.7                | 15   |
| 5.6   | 5.1, 5.2, 5.3      | 5.7                | 15   |
| 5.7   | 5.1, 5.2, 5.5, 5.6 | 5.8                | 16   |
| 5.8   | 5.7                | —                  | 17   |

**Critical path:** Pre.1 → Pre.2 → 0.3 → 0.4 → 1.1 → 1.3 → 1.5 → 1.6 → 2.1 → 4.2 → 4.3 → 4.4
**P5 tail:** 5.1 → 5.2 → 5.6 → 5.7 → 5.8 (5.4 → 5.5 joins at 5.7)

## Risks

- **Capabilities on managed clusters.** If the target cluster forbids `NET_RAW`, MMT-Probe cannot capture. Mitigation: detect the PodSecurity level at deploy time and fail early with an actionable message.
- **AI4SOAR credentials.** Giving a reaction pod a namespace-scoped Role is safe; never fall back to the Infrastructure's admin kubeconfig inside the pod.
- **Attack containment.** MAG must only reach the target: the default egress NetworkPolicy in 1.5 enforces this.
- **Module contracts (residual).** Pre.2 confirmed the runtime contracts from the owner's artifacts and a live MMT-Probe run: MAG is args-driven (no `TARGET_URL` env), MMT-Probe alerts leave via `security.output-channel` (Kafka recommended — no native webhook), AI4SOAR serves on :5000 with `/health`. Residual: packaged `v1.0.0` image specifics (entrypoint env aliases, AI4SOAR bundled ports) confirmed at first pull.

## Run it yourself

Everything above is delivered — this is the final run procedure on a fresh
install.

1. **Start the platform** with the required secrets exported (`JWT_SECRET`,
   `ADMIN_PASSWORD`, `ENCRYPTION_KEY` — see
   [docs/AGENT_ENV.md](../AGENT_ENV.md)) and MongoDB reachable at
   `MONGODB_URI`: `npm run dev` from the repo root (API on `:3000`). The
   server auto-seeds on first boot; `npm run seed` re-seeds manually. Seeding
   creates the demo catalog services (`MAG`,
   `CI-SIM`, `MMT-PROBE`, `AI4SOAR`) and the `MONTIMAGE-DEMO` project
   holding the scenario "CI attack → MMT detection → AI4SOAR block".
2. **Register a cluster** as an Infrastructure (or
   `POST /api/infrastructures`) with the cluster endpoint and a kubeconfig or
   bearer token as credentials — see
   [Kubernetes Execution](../integration/kubernetes-execution.md#cluster-credentials).
   A throwaway [kind](https://kind.sigs.k8s.io/) cluster is enough:
   `kind create cluster --name secsim-demo`.
3. **Assign the Infrastructure** to the scenario (in the scenario editor, or
   `PUT /api/scenarios/:id` with `infrastructureId`).
4. **Execute** — click **Execute** in the UI, or
   `POST /api/scenarios/:id/execute`. The engine rolls the topology out in
   `startOrder` tiers and holds the MAG Deployment until the target pod (with
   its MMT-Probe sidecar) and AI4SOAR report `Ready` inside the readiness
   gate. MAG comes up idling — its pod entrypoint is the seeded sleep loop.
5. **Run attack #1 — stop the service.** The MAG service row shows a
   copyable exec hint (issue #233); the seeded `attack-1-stop-the-server`
   profile (the MAG node's `config.profiles`, issue #236) runs:

   ```bash
   kubectl exec -it deploy/mag -n <exec-ns> -- \
     sh -c 'mag http-flood --target-ip ci-sim --target-port 8080 2>&1 | tee /proc/1/fd/1'
   ```

   The `tee /proc/1/fd/1` wrapper puts the run's output into the MAG pod's
   container log so it also streams into the console, and the Deployment
   stays up between attacks. Watch the R1 beats land in the Execution tab:
   an `alert` event in the **Security alerts** pane (verdict +
   `src=<ip.src>` attacker address, issue #234); CI-SIM logging
   `service stopped` as the flood crosses its rate threshold, then its
   container restarting (the `mmt-probe` sidecar holds the pod's network
   namespace); and the AI4SOAR reaction landing in the **Namespace events**
   pane — the playbook POSTs the attacker address to
   `ci-sim:8080/admin/block` (issue #235).

6. **Confirm the block.** Read the blocklist from inside the target
   container — a request sourced from the MAG pod would itself be answered
   403 once the entry lands:

   ```bash
   kubectl exec -n <exec-ns> deploy/ci-sim -c ci-sim -- \
     python3 -c "import urllib.request as u; print(u.urlopen('http://127.0.0.1:8080/admin/blocks').read().decode())"
   ```

   The MAG pod's address is in the list.

7. **Run attack #2 — already blocked.** Re-run the profile (the seeded
   `attack-2-already-blocked` entry is the same command), capped so the
   second run still trips the probe without pushing CI-SIM over its stop
   threshold — `--count 25` on the real `mag` CLI, `MAG_REQUEST_COUNT=25`
   under the e2e stub:

   ```bash
   kubectl exec -it deploy/mag -n <exec-ns> -- \
     sh -c 'mag http-flood --target-ip ci-sim --target-port 8080 --count 25 2>&1 | tee /proc/1/fd/1'
   ```

   CI-SIM answers the attack with 403 while other sources keep being
   served, a second alert lands in the **Security alerts** pane, and the
   target stays healthy.

8. **Watch the Execution tab** throughout: `progress` events drive the bar,
   per-container log tabs keep MMT-Probe output and ci-sim access logs
   separate, the **Security alerts** pane lists each detection the probe
   reports, and the **Namespace events** pane shows the AI4SOAR reaction
   landing. The event stream stays open after deploy settle so the
   exec-driven attacks and the reaction keep flowing into the console.
9. **Tear down** — **Tear Down** in the UI or
   `DELETE /api/scenarios/:id/executions/:executionId`; deleting the
   `secsim-<scenario>-<execution>` namespace removes every resource the
   engine created.

> **Real images:** the four module images live in the private
> `registry.montimage.eu` and the engine does not attach `imagePullSecrets`
> — on a cluster that cannot pull them the pods fail with
> `ImagePullBackOff`. Provision a node-level pull credential, preload the
> images (`kind load docker-image …`), or use the e2e stub path below.

### Scripted end-to-end setup — one machine, kind + stub

The numbered flow above assumes a running platform and a registered cluster.
This variant provisions everything on a single machine with copyable
snippets — the same path `scripts/e2e-kind/run-e2e.js` drives, executed by
hand so each step can be shown live.

**Prerequisites:** Docker, [kind](https://kind.sigs.k8s.io/), `kubectl`, and
Python 3 (for the API snippets).

1. **Create the cluster and load the stub image.** The four module images
   live in the private `registry.montimage.eu` which does not resolve
   publicly, so the e2e stub (`scripts/e2e-kind/stub/`) stands in for all
   four roles:

   ```bash
   kind create cluster --name secsim-e2e
   docker build -t secsim-e2e-stub:local scripts/e2e-kind/stub
   kind load docker-image secsim-e2e-stub:local --name secsim-e2e
   ```

   > `kind load` skips the copy when the image ID is already on the node —
   > after changing `stub/`, rebuild first so the tag carries a new ID.
   > `kubectl exec deploy/mag -- which mag` must print
   > `/usr/local/bin/mag` in a running pod.

2. **Start the platform.** Either run the server on the host — kind's
   published `127.0.0.1:<port>` API endpoint is then directly reachable:

   ```bash
   export JWT_SECRET="$(openssl rand -base64 48)"
   export ADMIN_PASSWORD="<strong-password>"
   export ENCRYPTION_KEY="$(openssl rand -hex 16)"
   export MONGODB_URI="mongodb://127.0.0.1:27017/intact"
   npm run dev          # auto-seeds the catalog + demo scenario on first boot
   ```

   …or run the containerized stack (`docker-compose.prod.yml`). The app
   container cannot see the host's loopback, so attach it to the `kind`
   docker network and rewrite the kubeconfig server to the node container
   name — `secsim-e2e-control-plane` is a DNS SAN on the kind API cert, so
   TLS still verifies:

   ```bash
   docker network connect kind montimage-app
   sed -E 's|server: https://127\.0\.0\.1:[0-9]+|server: https://secsim-e2e-control-plane:6443|' \
     ~/.kube/config > ~/.kube/secsim-e2e-container.yaml
   ```

   Use `~/.kube/secsim-e2e-container.yaml` (not `~/.kube/config`) as the
   credentials below, and `https://secsim-e2e-control-plane:6443` as the
   endpoint — the server inside the kubeconfig wins over the endpoint
   field. The `kind` attachment can also be declared as an external
   network in a compose override so it survives container recreation.

3. **Register the cluster, repoint the services, assign the infra and
   execute** — one script driving the public API (the same repointing
   `run-e2e.js` applies: `STUB_ROLE` selects each module's behaviour,
   `MMT_ALERT_URL` wires the probe's alert delivery to the reaction):

   ```bash
   export ADMIN_PASSWORD DEMO_KUBECONFIG=~/.kube/config   # or the container
                                                         # kubeconfig from step 2
   python3 - <<'PY'
   import json, os, re, urllib.request

   BASE = os.environ.get('BASE_URL', 'http://localhost:3000')
   KC   = os.path.expanduser(os.environ['DEMO_KUBECONFIG'])

   def api(method, path, body=None, token=None):
       req = urllib.request.Request(
           BASE + path, method=method,
           headers={'Content-Type': 'application/json',
                    **({'Authorization': f'Bearer {token}'} if token else {})},
           data=json.dumps(body).encode() if body is not None else None)
       with urllib.request.urlopen(req) as r:
           return json.load(r)

   token = api('POST', '/api/auth/login',
               {'username': os.environ.get('ADMIN_USERNAME', 'admin'),
                'password': os.environ['ADMIN_PASSWORD']})['token']

   kc = open(KC).read()
   server = re.search(r'^\s*server:\s*(\S+)', kc, re.M).group(1)
   infra = api('POST', '/api/infrastructures',
               {'name': 'kind-secsim-e2e', 'type': 'kubernetes',
                'endpoint': server, 'credentials': kc}, token)
   print('infrastructure:', infra['_id'], '→', server)

   for short, role in {'MAG': 'attack', 'CI-SIM': 'target',
                       'MMT-PROBE': 'monitor', 'AI4SOAR': 'reaction'}.items():
       res = api('GET', f'/api/services?search={short}', token=token)
       lst = res if isinstance(res, list) else res.get('services') or res.get('data') or []
       svc = next(s for s in lst if s['shortName'] == short)
       dep = dict(api('GET', f"/api/services/{svc['_id']}", token=token).get('deployment') or {})
       env = [e for e in dep.get('env', [])
              if e.get('name') not in ('STUB_ROLE', 'MMT_ALERT_URL')]
       env.append({'name': 'STUB_ROLE', 'value': role})
       if role == 'monitor':
           env.append({'name': 'MMT_ALERT_URL', 'fromEdge': 'reaction'})
       dep['env'] = env
       api('PUT', f"/api/services/{svc['_id']}",
           {'currentVersion': 'v1.0.0',
            'versions': [{'version': 'v1.0.0', 'dockerImage': 'secsim-e2e-stub:local'}],
            'deployment': dep}, token)
       print(f'{short} → secsim-e2e-stub:local (STUB_ROLE={role})')

   projects = api('GET', '/api/projects?limit=100', token=token)
   plist = projects if isinstance(projects, list) else projects.get('projects') or []
   proj = next(p for p in plist if p.get('shortName') == 'MONTIMAGE-DEMO')
   scenarios = api('GET', f"/api/projects/{proj['_id']}/scenarios", token=token)
   scen = next(s for s in scenarios if 'AI4SOAR block' in s.get('title', ''))
   api('PUT', f"/api/scenarios/{scen['_id']}", {'infrastructureId': infra['_id']}, token)
   res = api('POST', f"/api/scenarios/{scen['_id']}/execute", token=token)
   print('executing → namespace:', res['namespace'])
   PY
   ```

4. **Wait for Ready, then run the two attacks** (namespace printed by the
   script above):

   ```bash
   NS=<secsim-…>
   kubectl get pods -n "$NS" -w        # all Ready, then Ctrl-C

   # Attack #1 — flood until CI-SIM stops
   kubectl exec -it deploy/mag -n "$NS" -- \
     sh -c 'mag http-flood --target-ip ci-sim --target-port 8080 2>&1 | tee /proc/1/fd/1'

   # Confirm: attacker address on the blocklist, ci-sim restarted (RESTARTS=1)
   kubectl exec deploy/ci-sim -c ci-sim -n "$NS" -- \
     python3 -c "import urllib.request as u; print(u.urlopen('http://127.0.0.1:8080/admin/blocks').read().decode())"
   kubectl get pods -n "$NS"

   # Attack #2 — same profile, capped; every request answered 403/refused
   kubectl exec -it deploy/mag -n "$NS" -- \
     sh -c 'mag http-flood --target-ip ci-sim --target-port 8080 --count 25 2>&1 | tee /proc/1/fd/1'
   ```

   Expected beats: a JSON alert from the `mmt-probe` sidecar (surfaced in the
   console's **Security alerts** pane), `service stopped` → container restart,
   the AI4SOAR playbook POSTing `ip.src` to `ci-sim:8080/admin/block`, then a
   second alert while the target stays healthy on attack #2.

5. **Tear down:**

   ```bash
   kubectl delete ns "$NS"    # or Tear Down in the UI
   ```

> **Stub quirks worth knowing:** the probe sidecar counts every connection
> to `:8080` — including kubelet readiness probes arriving via the pod
> gateway — so an alert reaction can land the gateway address on the
> blocklist and wedge CI-SIM's readiness (probes answered 403). Recover with
> `POST /admin/unblock` for that address; the MAG pod address stays blocked.

### CI equivalent — kind e2e

`.github/workflows/e2e-kind.yml` runs this whole flow on pull requests that
touch the engine or the seed: it starts a kind cluster, boots the server
(auto-seed included), then `scripts/e2e-kind/run-e2e.js` drives the public
REST API — login, register the cluster as an Infrastructure, execute the demo
scenario — and asserts the R1 two-attack beats (issue #237): the MAG
Deployment rollout, an exec-driven attack #1 (`kubectl exec` into the idling
pod), the probe alert, CI-SIM's "service stopped" → Deployment restart, the
attacker address landing on the ci-sim `/admin/block` blocklist, then an
exec-driven attack #2 answered 403 with a second alert and a still-healthy
target, and a clean teardown. Because CI
runners cannot reach `registry.montimage.eu`, the driver repoints the
services at a locally-built stub image (`scripts/e2e-kind/stub/`) loaded with
`kind load`; set `SECSIM_E2E_REQUIRE_REAL_IMAGES=1` to fail instead of
falling back. To replay it locally:

```bash
kind create cluster --name secsim-e2e
docker build -t secsim-e2e-stub:local scripts/e2e-kind/stub
kind load docker-image secsim-e2e-stub:local --name secsim-e2e
npm run dev          # auto-seeds catalog, demo scenario and admin
ADMIN_PASSWORD=<your-admin-password> node scripts/e2e-kind/run-e2e.js
```
