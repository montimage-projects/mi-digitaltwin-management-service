# Kubernetes Execution

Direct deployment of a scenario topology to a Kubernetes cluster.

## Overview

Executing a scenario deploys its topology **directly** to the Kubernetes cluster
of the scenario's assigned infrastructure. The platform talks to the cluster API
itself (via `@kubernetes/client-node`) — there is no external orchestrator in the
path.

Each execution gets its own namespace. Every topology node becomes one
single-container `Deployment` plus one `NodePort` `Service`. Progress and live
pod logs stream back to the browser over Server-Sent Events (SSE), and a teardown
deletes the namespace to reclaim everything.

The deploy engine lives in
[`server/src/services/kubernetesDeploy.ts`](../../server/src/services/kubernetesDeploy.ts);
the HTTP surface is in
[`server/src/routes/scenarios.routes.ts`](../../server/src/routes/scenarios.routes.ts).

```mermaid
sequenceDiagram
  participant U as User
  participant C as React Client
  participant S as Express Server
  participant K as Kubernetes

  U->>C: Click "Execute"
  C->>S: POST /api/scenarios/:id/execute
  S->>S: Resolve topology nodes to images
  S->>K: Create namespace
  S->>K: Create Deployment + NodePort Service per node
  K-->>S: Created (nodePort assigned)
  S-->>C: { executionId, namespace, status, services }

  C->>S: GET .../executions/:executionId/events (SSE)
  loop Poll until settled
    S->>K: Read deployment status + pod logs
    K-->>S: Replica counts, log lines
    S-->>C: event: progress / event: log
  end
  S-->>C: event: end

  U->>C: Click "Tear Down"
  C->>S: DELETE .../executions/:executionId
  S->>K: Delete namespace (cascades)
```

## Execution Flow

When a user clicks **Execute** on a scenario:

1. The server loads the scenario and its assigned infrastructure. A scenario with
   no `infrastructureId` is rejected (`400`).
2. It resolves the services referenced by the topology nodes' `data.serviceId`
   and picks a concrete `dockerImage` from each service's `versions[]` (matching
   the node's requested `version`, else `currentVersion`, else the newest
   version). A node with no service or no deployable image is rejected (`400`).
3. An execution record is appended to the scenario (`status: pending`) so it has
   an `_id` before anything reaches the cluster. The namespace name is derived
   from the scenario and execution ids.
4. The topology is deployed (see below). On success the execution flips to
   `running` and stores the namespace and per-service records; on failure it is
   persisted as `failed` and the error is surfaced.

### Endpoint

- **POST** `/api/scenarios/:id/execute`
- **Auth:** Required
- **Response:**

  ```json
  {
    "executionId": "665f…",
    "namespace": "secsim-<scenario>-<execution>",
    "status": "running",
    "services": [
      {
        "nodeId": "mmt-probe",
        "serviceId": "662a…",
        "name": "mmt-probe",
        "uiType": "web",
        "status": "pending",
        "nodePort": 31840,
        "dashboardUrl": "http://cluster-host:31840"
      }
    ]
  }
  ```

## Kubernetes Resource Model

The engine is intentionally thin. Edge wiring, env vars and volumes are out of
scope — each node maps to exactly one workload plus one service.

| Topology concept | Kubernetes resource          | Notes                                                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Execution        | `Namespace`                  | One per execution, named `secsim-<scenario>-<execution>` (DNS-1123, ≤63 chars). Deleting it cascades to everything below. |
| Topology node    | `Deployment` (`apps/v1`)     | Single container, `replicas: 1`, image resolved from the service version.                                                 |
| Topology node    | `Service` (`v1`, `NodePort`) | Same name as the Deployment, selects it by `app` label, exposes the container port.                                       |

- **Resource naming:** each node's `id` is normalised to an RFC-1035 label
  (lowercase, starting with a letter, ≤50 chars); the Deployment and Service
  share that name.
- **Port:** a single port is mapped per node, defaulting to `80` for both the
  container and the service.
- **Labels:** every managed object carries
  `app.kubernetes.io/managed-by: secsim`; Deployments also carry
  `secsim.io/node: <nodeId>`.
- **Service type `NodePort`** is deliberate: it makes each service reachable
  without an Ingress controller, which is what powers the per-service URLs.

## SSE Events Protocol

Live progress and logs are streamed from a Server-Sent Events endpoint. The
server polls the cluster every 2 seconds, emitting a `progress` snapshot and any
new pod log lines, until every service has settled (all `running` or `failed`)
or the client disconnects.

- **GET** `/api/scenarios/:id/executions/:executionId/events`
- **Auth:** Required
- **Content-Type:** `text/event-stream`

If nothing was deployed, or the execution already reached a terminal state, the
stream emits a single `progress` snapshot followed by `end` and closes. Bad
credentials fail as a normal JSON error _before_ the stream opens, rather than as
a half-open connection.

### Event types

| Event      | When                           | Payload                                                                                                                                                             |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `progress` | Each poll                      | `{ progress: number, services: [{ name, status }] }` — `progress` is the percentage of services that are `running`; `status` is `pending` \| `running` \| `failed`. |
| `log`      | Per new pod log line           | `{ service: string, pod: string, line: string }`                                                                                                                    |
| `end`      | Deploy settled                 | `{ status: "completed" \| "failed", services: [{ name, status }] }`                                                                                                 |
| `error`    | Cluster read failed mid-stream | `{ message: string }` (the stream then closes)                                                                                                                      |

```text
event: progress
data: {"progress":50,"services":[{"name":"mmt-probe","status":"running"},{"name":"kafka","status":"pending"}]}

event: log
data: {"service":"mmt-probe","pod":"mmt-probe-7c9f-abcde","line":"probe started on eth0"}

event: end
data: {"status":"completed","services":[{"name":"mmt-probe","status":"running"},{"name":"kafka","status":"running"}]}
```

The **Execution** tab's `ExecutionConsole` component consumes this stream: a
progress bar driven by `progress`, an auto-scrolling `[service]`-prefixed log
console driven by `log`, and a per-service status list.

## Per-Service URLs

There are no embedded dashboards or simulated terminals — services expose real,
clickable URLs backed by their NodePort.

- On deploy, each service's `dashboardUrl` is built from the cluster endpoint
  host and the assigned NodePort: `http://<cluster-host>:<nodePort>`.
- **Web-facing services** (`uiType: "web"` or `"both"`) render an **Open
  interface** link to that URL once the service is running.
- **Terminal-only services** (`uiType: "terminal"`) show a plain status badge —
  no link, no fake terminal.

## Teardown

Tearing down an execution deletes its namespace, which cascades to the
Deployments, Services and Pods within it. Deleting an already-gone namespace is
treated as success (idempotent). The execution record is marked `completed`.

- **DELETE** `/api/scenarios/:id/executions/:executionId`
- **Auth:** Required
- **Response:** `{ executionId, namespace, status: "completed", message }`

The cluster is only contacted when the execution actually has a namespace; a
never-deployed or already-torn-down execution short-circuits.

## Cluster Credentials

The infrastructure's encrypted `credentials` field holds either full kubeconfig
content or a bearer token:

- **Kubeconfig content** (detected by an `apiVersion:` / `{` / `clusters:`
  prefix) is loaded as-is.
- **A bearer token** is combined with the infrastructure `endpoint` into an
  in-cluster-style config (`skipTLSVerify` on).

Credentials are decrypted server-side only and never leave the backend. See the
[Connection Testing](external-services.md#connection-testing) section for the
real cluster liveness probe used by `POST /api/infrastructures/:id/test`.

## Error Handling

Kubernetes API failures surface as `502 Bad Gateway` (the cluster is an upstream
dependency); other unexpected errors become `500`. Common deploy failure causes:

- Topology node without a `serviceId` or without a deployable docker image
  (`400`, before any cluster call).
- Cluster unreachable, bad credentials, or TLS error (`502`).
- Per-pod failure reasons detected during status polling —
  `CrashLoopBackOff`, `ImagePullBackOff`, `ErrImagePull`,
  `CreateContainerError`, `CreateContainerConfigError`, `RunContainerError`,
  `InvalidImageName` — mark that service `failed`.

## Migration Note

Earlier revisions of the platform embedded the **MAESTRO** orchestrator in an
iframe and exchanged `postMessage` `DEPLOYMENT_*` events with it, while the
frontend faked progress bars and mock service dashboards. That protocol is gone:
the platform now deploys to Kubernetes directly and streams real status and logs
over SSE. Some unused orchestrator configuration keys may still linger in
environment files pending a follow-up cleanup, but nothing in the execution path
uses them.

## Related Documentation

- [External Services](external-services.md)
- [Architecture Overview](../architecture/overview.md)
- [Data Flow](../architecture/data-flow.md)
- [Deployment Playbook](../playbooks/deployment.md)
