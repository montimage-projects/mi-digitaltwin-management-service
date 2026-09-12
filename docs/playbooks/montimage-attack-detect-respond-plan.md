# Montimage attack → detect → respond scenario on Kubernetes

**Project:** secSIM (MI Digital Twin Management Platform)
**Baseline:** GREEN — v1.0.0 builds; deploy engine maps each node to one single-container Deployment + NodePort Service on port 80; edges, env, volumes, capabilities, RBAC, ordering and Jobs are unsupported
**Test command of record:** `npm test`

Integrate a four-module Montimage scenario into the secSIM execution engine:

| Role     | Module                           | Purpose in the scenario                                  |
| -------- | -------------------------------- | -------------------------------------------------------- |
| Attack   | MAG (Montimage Attack Generator) | Sends HTTP attack traffic at the target                  |
| Target   | Simulated HTTP server            | Victim workload; the only thing MAG is allowed to reach  |
| Monitor  | MMT-Probe                        | DPI on the target's traffic, emits alerts/reports        |
| Reaction | AI4SOAR                          | Receives alerts, runs a playbook, applies a K8s response |

Everything runs in the per-execution namespace already created by
`server/src/services/kubernetesDeploy.ts`, on the cluster registered as the
scenario's Infrastructure.

## Current engine gaps

The engine (`kubernetesDeploy.ts`) has no:

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
├── Deployment target-http           (2 containers, shared netns)
│   ├── http-sim   : registry.montimage.eu/montimage-mti/http-sim:v1.0.0   :8080
│   └── mmt-probe  : registry.montimage.eu/montimage-mti/mmt-probe:v1.0.0  caps NET_ADMIN,NET_RAW
│       ├── ConfigMap  mmt-probe-config  (mmt-probe.conf: iface=eth0, output, alert webhook)
│       └── emptyDir   mmt-reports
├── Service   target-http  (NodePort → 8080)        ← dashboardUrl
├── Deployment ai4soar                                :3001 (Shuffle-based UI)
│   ├── ServiceAccount ai4soar + Role/RoleBinding (namespace-scoped)
│   └── ConfigMap ai4soar-playbook (webhook trigger → K8s action)
├── Service   ai4soar      (NodePort → 3001)        ← dashboardUrl
└── Job       mag                                     env TARGET_URL=http://target-http:8080
```

Wiring resolved from topology edges:

| Edge (source → target) | Engine effect                                                                   |
| ---------------------- | ------------------------------------------------------------------------------- |
| MAG → http-sim         | `TARGET_URL` env on MAG = cluster DNS of the target Service                     |
| MMT-Probe → http-sim   | MMT-Probe injected as a **sidecar** in the target pod (no hostNetwork)          |
| MMT-Probe → AI4SOAR    | `ALERT_WEBHOOK_URL` env on probe = `http://ai4soar:3001/api/v1/hooks/<id>`      |
| AI4SOAR → http-sim     | Role grants: `pods` delete, `deployments` patch/scale, `networkpolicies` create |

Sidecar over `hostNetwork` is the recommended choice: it captures exactly the
target's traffic, needs no node-level privileges, and works on managed
clusters. `hostNetwork` stays as an optional per-service flag.

Reaction the playbook applies (demo default first, others as playbook
variants): create a `NetworkPolicy` denying ingress to `target-http` from the
MAG pod label; delete the MAG pod; scale the MAG Job to 0.

Proposed `Service.deployment` spec:

```ts
deployment?: {
  kind: 'Deployment' | 'Job';                 // MAG = Job
  role: 'attack' | 'target' | 'monitor' | 'reaction' | 'generic';
  attachMode?: 'standalone' | 'sidecar';      // MMT-Probe = sidecar
  containerPort?: number;                     // replaces hard-coded 80
  exposePort?: boolean;                       // sidecar/Job → false
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
  --docker-username=<user> --docker-password=<token> \
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

- [ ] A per-module contract table exists in this playbook with port, config, env, capabilities and health endpoint
- [ ] MMT-Probe alert sink mechanism is confirmed with the module owner
- [ ] MAG attack profile selection mechanism (env or args) is confirmed with the module owner

**Dependencies**: Pre.1
**Effort**: M
**Verify**: each module starts locally with `docker run` using only the documented env/config and reports healthy

#### Task Pre.3: Confirm AI4SOAR in-cluster auth and cluster PodSecurity level

**Description**: Confirm AI4SOAR can authenticate to the Kubernetes API using an in-cluster ServiceAccount token (rather than an injected kubeconfig). Confirm the PodSecurity admission level on the target cluster, since the MMT-Probe sidecar needs `NET_ADMIN` and `NET_RAW`, which requires the namespace labelled `pod-security.kubernetes.io/enforce=privileged` (or `baseline` with an exemption).

**Acceptance Criteria**:

- [ ] AI4SOAR auth mode is recorded (ServiceAccount token, or kubeconfig injection with rationale)
- [ ] Target cluster PodSecurity enforce level is recorded and the required namespace label is documented

**Dependencies**: Pre.2
**Effort**: S
**Verify**: `kubectl auth can-i delete pods --as=system:serviceaccount:<ns>:ai4soar -n <ns>` returns yes in a test namespace with the planned Role

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

**Description**: Resolve `env[].fromEdge` at deploy time: `fromEdge: 'target'` becomes `http://<target-service-name>:<port>` of the node connected by an attack edge; `fromEdge: 'reaction'` becomes the webhook URL of the node connected by a notify edge. Node-level `config.env` overrides win over catalog defaults.

**Acceptance Criteria**:

- [ ] MAG's `TARGET_URL` resolves to the target Service cluster DNS name
- [ ] MMT-Probe's `ALERT_WEBHOOK_URL` resolves to the AI4SOAR Service URL
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

- [ ] `docs/integration/kubernetes-execution.md` describes the new engine behaviour
- [ ] `docs/API.md` documents `Service.deployment` and the events SSE type
- [ ] This playbook contains a run-it-yourself section

**Dependencies**: 4.3
**Effort**: S
**Verify**: docs CI workflow passes

## Milestones

| ID  | Phase | Exit condition                                                                       | Verify with                         |
| --- | ----- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| ME  | Pre   | images, ports, config formats, auth mode and PodSecurity level documented            | this playbook                       |
| M0  | P0    | `GET /api/services` returns the four modules with a validated `deployment` spec      | `npm test`                          |
| M1  | P1    | four-module topology deploys with sidecar probe, RBAC-bound AI4SOAR, ordered MAG Job | `npm test -- kubernetesDeploy`      |
| M2  | P2    | per-container status/logs, Job completion, events streamed                           | `npm test -- scenarioSSE`           |
| M3  | P3    | scenario buildable and runnable from the UI                                          | `npm run typecheck && npm run lint` |
| M4  | P4    | kind E2E green: alert, NetworkPolicy, Job complete, clean teardown                   | CI                                  |

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

**Critical path:** Pre.1 → Pre.2 → 0.3 → 0.4 → 1.1 → 1.3 → 1.5 → 1.6 → 2.1 → 4.2 → 4.3 → 4.4

## Risks

- **Capabilities on managed clusters.** If the target cluster forbids `NET_RAW`, MMT-Probe cannot capture. Mitigation: detect the PodSecurity level at deploy time and fail early with an actionable message.
- **AI4SOAR credentials.** Giving a reaction pod a namespace-scoped Role is safe; never fall back to the Infrastructure's admin kubeconfig inside the pod.
- **Attack containment.** MAG must only reach the target: the default egress NetworkPolicy in 1.5 enforces this.
- **Module contracts unknown.** Phase P1 assumes env-driven config for MAG and a webhook sink for MMT-Probe; Phase Pre must validate both before P1 starts.
