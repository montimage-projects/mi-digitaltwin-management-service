import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  ApiException,
  type V1ConfigMap,
  type V1Container,
  type V1ContainerStatus,
  type V1Deployment,
  type V1Job,
  type V1Namespace,
  type V1NetworkPolicy,
  type V1Pod,
  type V1PodSpec,
  type V1Role,
  type V1RoleBinding,
  type V1SecurityContext,
  type V1Service,
  type V1ServiceAccount,
  type V1Volume,
  type V1VolumeMount,
} from '@kubernetes/client-node';
import type { IInfrastructure } from '../models/Infrastructure.js';
import type { IDeploymentSpec } from '../models/Service.js';
import type { INodeConfig } from '../models/Scenario.js';
import { decrypt } from '../utils/encryption.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Kubernetes deploy engine.
 *
 * Deploys a scenario topology directly to a Kubernetes cluster instead of
 * delegating to the MAESTRO orchestrator. Each topology node maps to a
 * workload — an `apps/v1` Deployment, or a `batch/v1` Job for finite runs —
 * plus a `v1` NodePort Service when the spec exposes a port (NodePort so the
 * service is reachable without an Ingress controller). A node with
 * `attachMode: 'sidecar'` owns no workload of its own: it is injected as an
 * extra container into the pod of the node its `monitors` edge points at.
 * `resolveTopologyNodes` resolves each node's merged deployment spec (service
 * `deployment` defaults merged with `node.data.config` overrides) and its
 * typed-edge context; `planWorkloads` then groups the resolved nodes into
 * pods. Nodes may also emit a `v1` ConfigMap (`configFiles`) and a
 * namespace-scoped `ServiceAccount`/`Role`/`RoleBinding` triple (`rbac`) —
 * never a ClusterRole or ClusterRoleBinding. The namespace itself carries the
 * PodSecurity `enforce=privileged` admission label only when a node declares
 * `capabilities`, `privileged` or `hostNetwork`; every `role: 'attack'` node
 * is contained by a `networking.k8s.io/v1` NetworkPolicy restricting its
 * egress to its attack-edge targets' Service ports plus DNS (task 1.5).
 * Workloads roll out in ascending `startOrder` tiers (task 1.6): an attack
 * workload is created only once every already-deployed workload's pods
 * report Ready, so the attack never starts ahead of the monitor and
 * reaction it depends on.
 */

/** Coarse per-service deploy status; `completed` marks a finished Job. */
export type DeployStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Per-container status inside one workload's pods (task 2.1). */
export interface ContainerDeployStatus {
  /** Container name — the node name for host and sidecar containers alike. */
  name: string;
  status: DeployStatus;
}

/** Kubernetes API clients scoped to a single cluster. */
export interface K8sClients {
  core: CoreV1Api;
  apps: AppsV1Api;
  /** Job creation and status for `kind: 'Job'` nodes. */
  batch: BatchV1Api;
  /** Egress NetworkPolicies containing `role: 'attack'` nodes (task 1.5). */
  networking: NetworkingV1Api;
  /** ServiceAccount-bound Role/RoleBinding for nodes declaring `rbac`. */
  rbac: RbacAuthorizationV1Api;
}

/**
 * Structural view of a `Service` document — only the fields the engine needs
 * to resolve a deployable image. Keeps the engine decoupled from Mongoose.
 */
export interface ServiceImageSource {
  _id: unknown;
  currentVersion?: string;
  versions: { version: string; dockerImage: string }[];
  uiType?: 'web' | 'terminal' | 'both';
  /** Optional Kubernetes deployment spec (models/Service.ts `IDeploymentSpec`). */
  deployment?: IDeploymentSpec;
}

/**
 * Deployment spec as resolved for one node: the service catalog spec merged
 * with the node's `data.config` overrides, with engine defaults filled in for
 * the fields a manifest builder always needs. `kind` and `role` are already
 * required on `IDeploymentSpec`; `attachMode`, `containerPort` and
 * `exposePort` are defaulted here so downstream tasks never re-check them.
 */
export interface ResolvedDeploymentSpec extends IDeploymentSpec {
  attachMode: 'standalone' | 'sidecar';
  containerPort: number;
  exposePort: boolean;
}

/**
 * Typed-edge context for one resolved node — the node ids it is wired to by
 * each scenario edge kind (`attacks`: attack → target, `monitors`:
 * monitor → target, `notifies`: monitor → reaction, `acts-on`:
 * reaction → target; see the wiring table in
 * docs/playbooks/montimage-attack-detect-respond-plan.md). Lists hold node
 * ids in edge order; a node with no matching outgoing edges gets empty lists.
 */
export interface ResolvedEdgeContext {
  /** Node ids this node attacks (`attacks` edges, attack → target). */
  targets: string[];
  /** Node ids this node monitors (`monitors` edges, monitor → target). */
  monitors: string[];
  /** Node ids this node notifies (`notifies` edges, monitor → reaction). */
  notifies: string[];
  /** Node ids this node acts on (`acts-on` edges, reaction → target). */
  actsOn: string[];
}

/** A topology node resolved to a concrete, deployable image. */
export interface ResolvedNode {
  nodeId: string;
  serviceId: string;
  /** Kubernetes resource name shared by the node's Deployment and Service. */
  name: string;
  image: string;
  uiType: 'web' | 'terminal' | 'both';
  containerPort: number;
  /** Merged deployment spec (service spec + node `data.config` overrides). */
  deployment: ResolvedDeploymentSpec;
  /** Typed-edge wiring context for this node. */
  edgeContext: ResolvedEdgeContext;
}

/** Result of deploying a single topology node. */
export interface DeployedServiceResult {
  nodeId: string;
  serviceId: string;
  name: string;
  uiType: 'web' | 'terminal' | 'both';
  status: DeployStatus;
  dashboardUrl?: string;
  nodePort?: number;
}

export interface DeployResult {
  namespace: string;
  services: DeployedServiceResult[];
}

export interface DeployTopologyOptions {
  namespace: string;
  nodes: unknown[];
  /** Topology edges (React Flow `{ source, target, type?, data? }` records). */
  edges?: unknown[];
  services: ServiceImageSource[];
  /** Cluster API endpoint; its host is used to build reachable NodePort URLs. */
  endpoint: string;
  /**
   * Bound on the pre-attack readiness wait (task 1.6): how long the rollout
   * waits for already-deployed workload pods to report Ready before starting
   * an attack workload. Defaults to {@link READINESS_TIMEOUT_MS}.
   */
  readinessTimeoutMs?: number;
  /** Delay between pod-list polls while waiting on readiness. */
  readinessPollMs?: number;
}

/** Default container/service port used for the single mapped port per node. */
const DEFAULT_CONTAINER_PORT = 80;

/**
 * Default bound on the pre-attack readiness wait (task 1.6). Five minutes
 * leaves room for a cold pull of the private-registry images; a pod that
 * still has not reported Ready by then almost certainly never will.
 */
const READINESS_TIMEOUT_MS = 300_000;

/** Default delay between pod-list polls during the readiness wait. */
const READINESS_POLL_MS = 2_000;

const MANAGED_BY = 'secsim';

/** Container-status waiting reasons that indicate a hard deploy failure. */
const FAILURE_REASONS = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerError',
  'CreateContainerConfigError',
  'RunContainerError',
  'InvalidImageName',
]);

interface RawTopologyNode {
  id?: string;
  data?: { serviceId?: string; version?: string; label?: string; config?: INodeConfig };
}

/** Structural view of a stored topology edge (React Flow edge record). */
interface RawTopologyEdge {
  source?: unknown;
  target?: unknown;
  type?: unknown;
  data?: { type?: unknown; edgeType?: unknown };
}

/** Canonical scenario edge kinds resolved into {@link ResolvedEdgeContext}. */
type EdgeKind = 'attack' | 'monitor' | 'notify' | 'acts-on';

/**
 * Accepted spellings for each edge kind. Task 3.2 of the playbook persists
 * `attacks`/`monitors`/`notifies`/`acts-on`; the singular aliases are kept so
 * hand-written topologies also resolve.
 */
const EDGE_KIND_ALIASES: Record<string, EdgeKind> = {
  attack: 'attack',
  attacks: 'attack',
  monitor: 'monitor',
  monitors: 'monitor',
  notify: 'notify',
  notifies: 'notify',
  'acts-on': 'acts-on',
  actson: 'acts-on',
};

/** Normalize a raw edge type/label into a canonical {@link EdgeKind}. */
function edgeKindOf(raw: unknown): EdgeKind | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return EDGE_KIND_ALIASES[normalized] ?? null;
}

/**
 * Merge a service catalog deployment spec with a node's `data.config`
 * overrides and fill engine defaults. `env`/`args` are the override surface
 * validated on scenario save (task 0.4): `config.args` replaces the catalog
 * `args` wholesale, while `config.env` merges by name so a node can override
 * one variable without restating the whole list. Other config keys are
 * preserved on the scenario document for forward compatibility (e.g.
 * `configFiles`, task 3.3) but are not merged here — they are unvalidated
 * input, and the spec fields they would touch are security-relevant.
 */
function mergeDeploymentSpec(
  base: IDeploymentSpec | undefined,
  config: INodeConfig | undefined
): ResolvedDeploymentSpec {
  const merged: IDeploymentSpec = {
    kind: 'Deployment',
    role: 'generic',
    attachMode: 'standalone',
    containerPort: DEFAULT_CONTAINER_PORT,
    exposePort: true,
    ...base,
  };

  if (config) {
    if (config.args !== undefined) {
      merged.args = config.args;
    }
    if (config.env) {
      merged.env = mergeEnvByName(base?.env, config.env);
    }
  }

  return merged as ResolvedDeploymentSpec;
}

/**
 * Merge env lists by variable name: an override replaces the catalog entry of
 * the same name in place; new names append. Catalog order is preserved so
 * manifests stay deterministic.
 */
function mergeEnvByName(
  base: IDeploymentSpec['env'],
  overrides: NonNullable<INodeConfig['env']>
): IDeploymentSpec['env'] {
  const merged = [...(base ?? [])];
  for (const override of overrides) {
    const idx = merged.findIndex((e) => e.name === override.name);
    if (idx >= 0) {
      merged[idx] = override;
    } else {
      merged.push(override);
    }
  }
  return merged;
}

/**
 * Build per-node edge context from the topology edges. The edge kind is read
 * from `data.edgeType`, then `data.type`, then `type` (the React Flow field
 * task 3.2 populates). Untyped, malformed and dangling edges (referencing a
 * node that is not part of this resolution) are skipped rather than failing
 * the deploy — today's untyped editor edges must keep deploying unchanged.
 */
function buildEdgeContexts(
  nodeIds: ReadonlySet<string>,
  edges: unknown[]
): Map<string, ResolvedEdgeContext> {
  const contexts = new Map<string, ResolvedEdgeContext>();
  const ensure = (nodeId: string): ResolvedEdgeContext => {
    let ctx = contexts.get(nodeId);
    if (!ctx) {
      ctx = { targets: [], monitors: [], notifies: [], actsOn: [] };
      contexts.set(nodeId, ctx);
    }
    return ctx;
  };

  for (const raw of edges) {
    const edge = (raw ?? {}) as RawTopologyEdge;
    const kind =
      edgeKindOf(edge.data?.edgeType) ?? edgeKindOf(edge.data?.type) ?? edgeKindOf(edge.type);
    const source = typeof edge.source === 'string' ? edge.source : undefined;
    const target = typeof edge.target === 'string' ? edge.target : undefined;
    if (!kind || !source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
      continue;
    }

    const ctx = ensure(source);
    const list =
      kind === 'attack'
        ? ctx.targets
        : kind === 'monitor'
          ? ctx.monitors
          : kind === 'notify'
            ? ctx.notifies
            : ctx.actsOn;
    if (!list.includes(target)) {
      list.push(target);
    }
  }
  return contexts;
}

/**
 * Wrap any thrown value in an `AppError`. Kubernetes API failures surface as
 * `502 Bad Gateway` (the cluster is an upstream dependency); everything else
 * that is not already an `AppError` becomes a `500`.
 */
function toAppError(err: unknown, action: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ApiException) {
    const body = err.body as { message?: string } | string | undefined;
    const detail =
      (typeof body === 'object' && body?.message) ||
      (typeof body === 'string' && body) ||
      err.message;
    return new AppError(`Kubernetes error while ${action} (${err.code}): ${detail}`, 502);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(`Failed while ${action}: ${message}`, 500);
}

/**
 * Maximum characters kept from an id when forming a namespace segment. Sized to
 * fit a full 24-char MongoDB ObjectId so the trailing counter bytes — which are
 * what distinguish ids minted in the same second/process — are preserved rather
 * than sliced off (slicing to 12 hex chars discarded the counter and let two
 * executions of one scenario collide on an identical namespace). Two
 * `secsim-<24>-<24>` segments plus separators stay within the 63-char limit.
 */
const MAX_ID_SEGMENT = 24;

/** Lowercase a string into a DNS label suitable for a Kubernetes name segment. */
function toLabelSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_ID_SEGMENT);
}

/**
 * Derive a deterministic namespace name for an execution. Kubernetes namespace
 * names must be DNS-1123 labels (lowercase alphanumeric or `-`, ≤63 chars).
 */
export function deriveNamespace(scenarioId: string, executionId: string): string {
  const scenario = toLabelSegment(String(scenarioId)) || 'scn';
  const execution = toLabelSegment(String(executionId)) || 'exec';
  return `${MANAGED_BY}-${scenario}-${execution}`.slice(0, 63).replace(/-+$/, '');
}

/**
 * Derive a Kubernetes resource name from a topology node. Names must be
 * RFC-1035 labels (start with a letter, lowercase alphanumeric or `-`, ≤63).
 */
function toResourceName(rawId: string, fallbackIndex: number): string {
  let name = rawId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!name || !/^[a-z]/.test(name)) {
    name = `svc-${name || fallbackIndex}`;
  }
  return name.slice(0, 50).replace(/-+$/, '');
}

/**
 * Resolve each topology node to a concrete deployable image by matching the
 * version the node references against the service's `versions[].dockerImage`.
 * Each resolved node also carries its merged deployment spec (service
 * `deployment` + `node.data.config` overrides over engine defaults) and its
 * typed-edge context from `edges` (which nodes it targets, monitors, notifies
 * and acts on). Throws `AppError(400)` for nodes without a service or without
 * a usable image.
 */
export function resolveTopologyNodes(
  nodes: unknown[],
  services: ServiceImageSource[],
  edges: unknown[] = []
): ResolvedNode[] {
  const byId = new Map(services.map((s) => [String(s._id), s]));
  const nodeIds = new Set(
    nodes.map((raw, index) => ((raw ?? {}) as RawTopologyNode).id ?? `node-${index}`)
  );
  const edgeContexts = buildEdgeContexts(nodeIds, edges);

  const resolved = nodes.map((raw, index) => {
    const node = (raw ?? {}) as RawTopologyNode;
    const nodeId = node.id ?? `node-${index}`;
    const serviceId = node.data?.serviceId;

    if (!serviceId) {
      throw new AppError(`Topology node "${nodeId}" has no serviceId`, 400);
    }

    const service = byId.get(String(serviceId));
    if (!service) {
      throw new AppError(`Service "${serviceId}" referenced by node "${nodeId}" not found`, 400);
    }

    const versions = service.versions ?? [];
    const wanted = node.data?.version ?? service.currentVersion;
    const entry =
      (wanted && versions.find((v) => v.version === wanted)) ||
      (service.currentVersion && versions.find((v) => v.version === service.currentVersion)) ||
      versions[versions.length - 1];

    if (!entry || !entry.dockerImage) {
      throw new AppError(
        `Service "${serviceId}" (node "${nodeId}") has no deployable docker image`,
        400
      );
    }

    const deployment = mergeDeploymentSpec(service.deployment, node.data?.config);

    return {
      nodeId,
      serviceId: String(serviceId),
      name: toResourceName(nodeId, index),
      image: entry.dockerImage,
      uiType: service.uiType ?? 'web',
      containerPort: deployment.containerPort,
      deployment,
      edgeContext: edgeContexts.get(nodeId) ?? {
        targets: [],
        monitors: [],
        notifies: [],
        actsOn: [],
      },
    };
  });

  resolveEdgeEnv(resolved);
  return resolved;
}

/**
 * Resolve `env[].fromEdge` entries against each node's typed-edge context
 * (issue #193 / playbook task 1.4):
 *
 * - `fromEdge: 'target'` → the endpoint of the node the source node reaches
 *   through an attack edge (`edgeContext.targets`), rendered
 *   `http://<service-name>:<port>` — the peer's cluster DNS name and Service
 *   port (e.g. MAG's `TARGET_URL` → `http://http-sim:8080`).
 * - `fromEdge: 'reaction'` → the endpoint of the node a notify edge points
 *   at (`edgeContext.notifies`), rendered the same way (e.g. MMT-Probe's
 *   `ALERT_WEBHOOK_URL` → `http://ai4soar:5000`).
 *
 * Resolution runs after every node has been named, so the peer's resource
 * name is available. Declaring `fromEdge` makes the matching edge required:
 * with no matching edge the deploy fails with a 400 naming the node and the
 * edge type. Node-level `config.env` overrides merge by name before this
 * pass (`mergeEnvByName`), so a literal override replaces the catalog's
 * `fromEdge` entry outright and needs no edge at all — that is the
 * documented override precedence.
 */
function resolveEdgeEnv(resolved: ResolvedNode[]): void {
  const byNodeId = new Map(resolved.map((n) => [n.nodeId, n]));
  for (const node of resolved) {
    const env = node.deployment.env;
    if (!env?.some((e) => e.fromEdge)) continue;
    // Rebuild the list rather than mutating entries in place: catalog env
    // entry objects are shared with the service document when no node-level
    // override merged, and must not be polluted across deploys.
    node.deployment.env = env.map((entry) => {
      if (!entry.fromEdge) return entry;
      const peerIds =
        entry.fromEdge === 'target'
          ? node.edgeContext.targets
          : entry.fromEdge === 'reaction'
            ? node.edgeContext.notifies
            : [];
      const peer = peerIds.length ? byNodeId.get(peerIds[0]) : undefined;
      if (!peer) {
        throw new AppError(
          `Topology node "${node.nodeId}" env "${entry.name}" requires a '${entry.fromEdge}' edge but no matching edge exists`,
          400
        );
      }
      return { ...entry, value: `http://${peer.name}:${peer.containerPort}` };
    });
  }
}

/** Extract the host from a cluster endpoint URL for building NodePort URLs. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  }
}

/**
 * Build the `CoreV1Api` + `AppsV1Api` + `BatchV1Api` +
 * `RbacAuthorizationV1Api` clients for a target infrastructure.
 *
 * The encrypted credential is either full kubeconfig content or a bearer token
 * (per the "API token or kubeconfig content" hint in the infrastructure form).
 * A token is combined with `infrastructure.endpoint` into an in-cluster-style
 * config.
 */
export function buildClientFromInfrastructure(infrastructure: IInfrastructure): K8sClients {
  try {
    const raw = decrypt(infrastructure.credentials).trim();
    const kc = new KubeConfig();

    const looksLikeKubeconfig =
      raw.startsWith('apiVersion:') || raw.startsWith('{') || raw.includes('clusters:');

    if (looksLikeKubeconfig) {
      kc.loadFromString(raw);
    } else {
      kc.loadFromOptions({
        clusters: [
          {
            name: 'secsim-cluster',
            server: infrastructure.endpoint,
            skipTLSVerify: infrastructure.skipTLSVerify ?? false,
          },
        ],
        users: [{ name: 'secsim-user', token: raw }],
        contexts: [{ name: 'secsim-context', cluster: 'secsim-cluster', user: 'secsim-user' }],
        currentContext: 'secsim-context',
      });
    }

    return {
      core: kc.makeApiClient(CoreV1Api),
      apps: kc.makeApiClient(AppsV1Api),
      batch: kc.makeApiClient(BatchV1Api),
      networking: kc.makeApiClient(NetworkingV1Api),
      rbac: kc.makeApiClient(RbacAuthorizationV1Api),
    };
  } catch (err) {
    throw toAppError(err, 'building the Kubernetes client');
  }
}

/**
 * `v1` Namespace for one execution. Carries the PodSecurity admission label
 * `pod-security.kubernetes.io/enforce=privileged` only when a node actually
 * needs it (task 1.5): any resolved node — workload host or sidecar — whose
 * spec declares container `capabilities`, `securityContext.privileged` or
 * `hostNetwork` (e.g. MMT-Probe's NET_ADMIN/NET_RAW sidecar). A topology
 * where nothing needs elevated privileges keeps the cluster's default
 * admission level instead of opting every pod into `privileged`.
 */
function namespaceManifest(namespace: string, resolved: ResolvedNode[]): V1Namespace {
  const needsPrivileged = resolved.some(
    (node) =>
      node.deployment.hostNetwork === true ||
      node.deployment.securityContext?.privileged === true ||
      (node.deployment.securityContext?.capabilities?.length ?? 0) > 0
  );
  const labels: Record<string, string> = { 'app.kubernetes.io/managed-by': MANAGED_BY };
  if (needsPrivileged) {
    labels['pod-security.kubernetes.io/enforce'] = 'privileged';
  }
  return { metadata: { name: namespace, labels } };
}

/**
 * One workload-owning node plus the sidecar containers injected into its pod.
 * A node with `attachMode: 'sidecar'` owns no workload — it rides on the pod
 * of the node its `monitors` edge points at (task 1.2 of the playbook).
 */
interface WorkloadPlan {
  /** The node whose Deployment/Job owns the pod. */
  node: ResolvedNode;
  /** Sidecar nodes injected as extra containers, in resolution order. */
  sidecars: ResolvedNode[];
}

/**
 * Group resolved nodes into pod plans. A `sidecar` node attaches to the first
 * node its `monitors` edge points at — following the edge chain when that
 * target is itself a sidecar — and lands as an extra container in the host's
 * pod. A sidecar with no monitor edge (or a monitor-edge cycle) fails the
 * deploy with a 400 naming the node: a sidecar cannot exist without a host.
 */
function planWorkloads(resolved: ResolvedNode[]): WorkloadPlan[] {
  const byId = new Map(resolved.map((n) => [n.nodeId, n]));
  const attached = new Map<string, ResolvedNode[]>();

  const hostFor = (sidecar: ResolvedNode): ResolvedNode => {
    const seen = new Set<string>([sidecar.nodeId]);
    let cur = sidecar;
    while (cur.deployment.attachMode === 'sidecar') {
      const nextId = cur.edgeContext.monitors[0];
      const next = nextId ? byId.get(nextId) : undefined;
      if (!next) {
        throw new AppError(
          `Topology node "${cur.nodeId}" has attachMode "sidecar" but no monitor edge to a host node`,
          400
        );
      }
      if (seen.has(next.nodeId)) {
        throw new AppError(
          `Topology node "${sidecar.nodeId}" has attachMode "sidecar" but its monitor edges form a cycle`,
          400
        );
      }
      seen.add(next.nodeId);
      cur = next;
    }
    return cur;
  };

  for (const node of resolved) {
    if (node.deployment.attachMode !== 'sidecar') continue;
    const host = hostFor(node);
    const list = attached.get(host.nodeId) ?? [];
    list.push(node);
    attached.set(host.nodeId, list);
  }

  // Plans come back in resolution order, one per non-sidecar node.
  return resolved
    .filter((n) => n.deployment.attachMode !== 'sidecar')
    .map((n) => ({ node: n, sidecars: attached.get(n.nodeId) ?? [] }));
}

/**
 * One `configFiles` entry resolved to its ConfigMap key. `mountPath` is a
 * file path (e.g. `/opt/mmt/probe/mmt-probe.conf`), so the key is the
 * filename — the ConfigMap volume then mounts each file individually via
 * `subPath`. Non-filename-safe or colliding basenames fall back to
 * `file-<index>` so keys stay unique and ConfigMap-key legal
 * (`[-._a-zA-Z0-9]+`).
 */
function configFileEntries(
  node: ResolvedNode
): { key: string; mountPath: string; content: string }[] {
  const used = new Set<string>();
  return (node.deployment.configFiles ?? []).map((file, index) => {
    const base = file.mountPath.split('/').filter(Boolean).pop() ?? '';
    let key = /^[-._a-zA-Z0-9]+$/.test(base) && base !== '.' && base !== '..' ? base : '';
    if (!key || used.has(key)) key = `file-${index}`;
    used.add(key);
    return { key, mountPath: file.mountPath, content: file.content };
  });
}

/** Name of the per-node ConfigMap (and its pod volume) holding configFiles. */
function configMapName(node: ResolvedNode): string {
  return `${node.name}-config`;
}

/**
 * Build the pod container for one node from its merged deployment spec. The
 * declared `securityContext` applies to this container only — a sidecar's
 * capabilities never leak onto the host container. Ports are declared only
 * when the spec exposes the port; `env` values are emitted as resolved by
 * `resolveTopologyNodes` (edge-derived `fromEdge` entries already carry their
 * concrete `value` by then).
 */
function containerFor(node: ResolvedNode): V1Container {
  const spec = node.deployment;
  const container: V1Container = { name: node.name, image: node.image };
  if (spec.exposePort) {
    container.ports = [{ containerPort: node.containerPort }];
  }
  if (spec.args?.length) {
    container.args = spec.args;
  }
  // `fromEdge` entries already carry their resolved `value` (resolveEdgeEnv
  // throws before manifests are built when an edge is missing); a declared
  // env with no value emits an explicitly-empty string.
  if (spec.env?.length) {
    container.env = spec.env.map((e) => ({ name: e.name, value: e.value ?? '' }));
  }
  if (spec.securityContext) {
    const securityContext: V1SecurityContext = {};
    if (spec.securityContext.capabilities?.length) {
      securityContext.capabilities = { add: spec.securityContext.capabilities };
    }
    if (spec.securityContext.privileged !== undefined) {
      securityContext.privileged = spec.securityContext.privileged;
    }
    container.securityContext = securityContext;
  }
  const mounts: V1VolumeMount[] = (spec.volumes ?? []).map((v) => ({
    name: v.name,
    mountPath: v.mountPath,
  }));
  // Each config file mounts individually at its declared file path via
  // subPath off the node's single ConfigMap volume.
  for (const file of configFileEntries(node)) {
    mounts.push({ name: configMapName(node), mountPath: file.mountPath, subPath: file.key });
  }
  if (mounts.length) container.volumeMounts = mounts;
  if (spec.readinessPath) {
    container.readinessProbe = {
      httpGet: { path: spec.readinessPath, port: node.containerPort },
    };
  }
  return container;
}

/**
 * Build the shared pod spec for a workload: the host container plus one
 * container per attached sidecar. `emptyDir` volumes declared by a sidecar
 * are pod-level and are also mounted on the host container, so files the
 * sidecar writes (e.g. MMT-Probe reports) are shared between the containers.
 */
function podSpecFor(plan: WorkloadPlan): V1PodSpec {
  const { node, sidecars } = plan;
  const host = containerFor(node);

  // Share each sidecar's emptyDir volumes with the host container unless it
  // already mounts a volume of that name (in which case it is shared already).
  const hostMounts = new Set((host.volumeMounts ?? []).map((m) => m.name));
  const shared = sidecars
    .flatMap((s) => s.deployment.volumes ?? [])
    .filter((v) => !hostMounts.has(v.name));
  if (shared.length) {
    host.volumeMounts = [
      ...(host.volumeMounts ?? []),
      ...shared.map((v) => ({ name: v.name, mountPath: v.mountPath })),
    ];
  }

  const volumes: V1Volume[] = [];
  const seen = new Set<string>();
  for (const member of [node, ...sidecars]) {
    for (const v of member.deployment.volumes ?? []) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      volumes.push({ name: v.name, emptyDir: {} });
    }
    // One ConfigMap-backed volume per member declaring config files —
    // including sidecars, whose ConfigMaps mount inside the host pod.
    if (configFileEntries(member).length && !seen.has(configMapName(member))) {
      seen.add(configMapName(member));
      volumes.push({ name: configMapName(member), configMap: { name: configMapName(member) } });
    }
  }

  const spec: V1PodSpec = { containers: [host, ...sidecars.map(containerFor)] };
  if (volumes.length) spec.volumes = volumes;
  if (node.deployment.hostNetwork) spec.hostNetwork = true;
  // The pod runs as the host node's ServiceAccount whenever any member —
  // host or sidecar — declares RBAC rules (a pod has a single SA, so the
  // sidecar's rules fold into the host's Role; see roleManifest).
  if (workloadRbacRules(plan).length) spec.serviceAccountName = node.name;
  return spec;
}

/**
 * Union of the RBAC rules declared by every member of the workload — host
 * plus sidecars. A pod carries a single `serviceAccountName`, so a sidecar
 * that needs API access can only get it through the pod's account; folding
 * its rules into the host's Role keeps declared permissions effective
 * instead of silently dropped.
 */
function workloadRbacRules(plan: WorkloadPlan): NonNullable<IDeploymentSpec['rbac']> {
  return [plan.node, ...plan.sidecars].flatMap((n) => n.deployment.rbac ?? []);
}

function deploymentManifest(plan: WorkloadPlan, namespace: string): V1Deployment {
  const node = plan.node;
  const labels = {
    app: node.name,
    'app.kubernetes.io/managed-by': MANAGED_BY,
    'secsim.io/node': node.nodeId,
  };
  return {
    metadata: { name: node.name, namespace, labels },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: node.name } },
      template: {
        metadata: { labels },
        spec: podSpecFor(plan),
      },
    },
  };
}

function serviceManifest(node: ResolvedNode, namespace: string): V1Service {
  return {
    metadata: {
      name: node.name,
      namespace,
      labels: { app: node.name, 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      type: 'NodePort',
      selector: { app: node.name },
      ports: [
        {
          port: node.containerPort,
          targetPort: node.containerPort,
          protocol: 'TCP',
        },
      ],
    },
  };
}

/**
 * `batch/v1` Job for `kind: 'Job'` nodes — a finite run (e.g. MAG's attack
 * profile), so the pod template forces `restartPolicy: 'Never'` and the pod
 * gets the same pod spec (containers, volumes, probes) a Deployment would.
 */
function jobManifest(plan: WorkloadPlan, namespace: string): V1Job {
  const node = plan.node;
  const labels = {
    app: node.name,
    'app.kubernetes.io/managed-by': MANAGED_BY,
    'secsim.io/node': node.nodeId,
  };
  return {
    metadata: { name: node.name, namespace, labels },
    spec: {
      template: {
        metadata: { labels },
        spec: { ...podSpecFor(plan), restartPolicy: 'Never' },
      },
    },
  };
}

/**
 * ConfigMap holding a node's `configFiles`. Keys are the file basenames (or
 * `file-<index>` on collisions) so each file mounts at its declared
 * `mountPath` via `subPath` — a whole-volume mount would shadow the target
 * directory.
 */
function configMapManifest(node: ResolvedNode, namespace: string): V1ConfigMap {
  return {
    metadata: {
      name: configMapName(node),
      namespace,
      labels: { app: node.name, 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    data: Object.fromEntries(configFileEntries(node).map((f) => [f.key, f.content])),
  };
}

/**
 * ServiceAccount for a node declaring `rbac` rules — the pod runs as this
 * account (Pre.3: in-cluster auth, no kubeconfig injection). Named after the
 * node so the RoleBinding and `serviceAccountName` agree by convention.
 */
function serviceAccountManifest(node: ResolvedNode, namespace: string): V1ServiceAccount {
  return {
    metadata: {
      name: node.name,
      namespace,
      labels: { app: node.name, 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
  };
}

/**
 * Namespace-scoped Role named after the host node, carrying the union of the
 * workload's `rbac` rules (host + sidecars — one ServiceAccount per pod).
 * The engine never creates cluster-scoped RBAC (no ClusterRole/
 * ClusterRoleBinding) — a scenario pod must not gain cluster-wide reach.
 */
function roleManifest(plan: WorkloadPlan, namespace: string): V1Role {
  const node = plan.node;
  return {
    metadata: {
      name: node.name,
      namespace,
      labels: { app: node.name, 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    rules: workloadRbacRules(plan).map((rule) => ({
      apiGroups: rule.apiGroups,
      resources: rule.resources,
      verbs: rule.verbs,
    })),
  };
}

/** RoleBinding connecting the node's ServiceAccount to its namespaced Role. */
function roleBindingManifest(node: ResolvedNode, namespace: string): V1RoleBinding {
  return {
    metadata: {
      name: node.name,
      namespace,
      labels: { app: node.name, 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'Role',
      name: node.name,
    },
    subjects: [{ kind: 'ServiceAccount', name: node.name, namespace }],
  };
}

/**
 * `networking.k8s.io/v1` NetworkPolicy containing one `role: 'attack'` node
 * (task 1.5). Egress is limited to the pods backing the Service of each
 * attack-edge target — selected by their `app` label on the target's Service
 * port — plus DNS (port 53, UDP and TCP). A NetworkPolicy cannot select a
 * Service, so the peer selector mirrors the Service's own `app` selector.
 * `podOwner` is the node whose pod the attack actually runs in: itself for a
 * standalone workload, or its monitor-edge host when the attack deploys as a
 * sidecar — containment follows the pod, not the node. An attack node with
 * no attack edge still gets the policy, reduced to DNS-only egress. Ingress
 * is left untouched: nothing the scenario does needs it restricted.
 */
function networkPolicyManifest(
  node: ResolvedNode,
  podOwner: ResolvedNode,
  targets: ResolvedNode[],
  namespace: string
): V1NetworkPolicy {
  return {
    metadata: {
      name: `${node.name}-egress`,
      namespace,
      labels: {
        app: node.name,
        'app.kubernetes.io/managed-by': MANAGED_BY,
        'secsim.io/node': node.nodeId,
      },
    },
    spec: {
      podSelector: { matchLabels: { app: podOwner.name } },
      policyTypes: ['Egress'],
      egress: [
        ...targets.map((target) => ({
          to: [{ podSelector: { matchLabels: { app: target.name } } }],
          ports: [{ port: target.containerPort, protocol: 'TCP' }],
        })),
        {
          ports: [
            { port: 53, protocol: 'UDP' },
            { port: 53, protocol: 'TCP' },
          ],
        },
      ],
    },
  };
}

/**
 * True when the pod counts as Ready for the pre-attack rollout gate: its
 * `Ready` condition is True, or it reached `Succeeded` (a completed Job pod
 * no longer reports Ready once finished).
 */
function podReady(pod: V1Pod): boolean {
  if (pod.status?.phase === 'Succeeded') return true;
  return (pod.status?.conditions ?? []).some(
    (condition) => condition.type === 'Ready' && condition.status === 'True'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pre-attack readiness gate (task 1.6). Polls the pods backing the
 * already-deployed workloads — one `listNamespacedPod` call per tick with a
 * combined `app in (...)` selector — until every workload has at least one
 * pod and all of its pods are Ready. A pod showing a hard failure (Failed
 * phase, CrashLoopBackOff, …) aborts the wait immediately; on timeout the
 * wait throws an `AppError` naming the pods that never reported Ready, which
 * the caller's catch turns into a namespace teardown and a failed execution.
 */
async function waitForWorkloadsReady(
  clients: K8sClients,
  namespace: string,
  names: string[],
  timeoutMs: number,
  pollMs: number
): Promise<void> {
  const unique = [...new Set(names)];
  if (!unique.length) return;
  const selector = `app in (${unique.join(',')})`;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const pods =
      (await clients.core.listNamespacedPod({ namespace, labelSelector: selector })).items ?? [];

    const byApp = new Map<string, V1Pod[]>();
    for (const pod of pods) {
      const app = pod.metadata?.labels?.app ?? '';
      if (!app) continue;
      const list = byApp.get(app) ?? [];
      list.push(pod);
      byApp.set(app, list);
    }

    // Fast-fail on a hard pod failure — waiting out the timeout would only
    // delay the same verdict with a less specific message.
    for (const pod of pods) {
      if (!podFailed(pod)) continue;
      const name = pod.metadata?.name ?? '(unnamed pod)';
      const reason =
        pod.status?.phase === 'Failed'
          ? 'phase Failed'
          : ((pod.status?.containerStatuses ?? [])
              .map((cs) => cs.state?.waiting?.reason)
              .find((r) => r && FAILURE_REASONS.has(r)) ?? 'failed');
      throw new AppError(
        `Pod ${name} failed while waiting for workloads to become Ready (${reason})`,
        502
      );
    }

    const notReady = unique.filter(
      (name) => (byApp.get(name) ?? []).length === 0 || byApp.get(name)!.some((p) => !podReady(p))
    );
    if (!notReady.length) return;

    if (Date.now() >= deadline) {
      // Name the concrete pods still not Ready where the cluster knows them;
      // a workload with no pod at all is named by its workload name.
      const pending = notReady.flatMap((name) => {
        const stuck = (byApp.get(name) ?? []).filter((p) => !podReady(p));
        return stuck.length
          ? stuck.map((p) => p.metadata?.name ?? name)
          : [`${name} (no pod scheduled)`];
      });
      throw new AppError(
        `Readiness timeout after ${Math.round(timeoutMs / 1000)}s waiting for pods to become ` +
          `Ready before starting attack workloads: ${pending.join(', ')}`,
        504
      );
    }
    await sleep(pollMs);
  }
}

/**
 * Deploy a scenario topology into a fresh per-execution namespace: create the
 * namespace (PodSecurity-labelled when a node needs `privileged` admission),
 * then one egress NetworkPolicy per `role: 'attack'` node, then per
 * pod-owning node its RBAC triple (when `rbac` rules are
 * declared), ConfigMaps (`configFiles`, including sidecars'), the workload
 * (`batch/v1` Job or `apps/v1` Deployment), and a NodePort Service when the
 * spec exposes a port. Sidecar nodes own no workload or Service — they land
 * as extra containers in their host's pod; their result rows carry the
 * host's resource name so status and log polling resolve under the pod they
 * actually run in. Job nodes never get a Service.
 *
 * Workloads roll out in ascending `startOrder` tiers (task 1.6): plans in
 * one tier are still created concurrently, but before any plan carrying an
 * attack-role member the gate waits for every already-deployed workload's
 * pods to report Ready — with a bounded timeout that fails the deploy naming
 * the pods that were not Ready. On mid-deploy failure, tears down
 * already-created resources (best-effort) before re-throwing.
 */
export async function deployTopology(
  clients: K8sClients,
  opts: DeployTopologyOptions
): Promise<DeployResult> {
  const resolved = resolveTopologyNodes(opts.nodes, opts.services, opts.edges);
  // Throws AppError(400) for a sidecar with no monitor edge — before any
  // cluster call, so nothing is created for a topology that cannot deploy.
  const plans = planWorkloads(resolved);
  const hostByNode = new Map<string, ResolvedNode>();
  for (const plan of plans) {
    hostByNode.set(plan.node.nodeId, plan.node);
    for (const sidecar of plan.sidecars) hostByNode.set(sidecar.nodeId, plan.node);
  }
  const host = endpointHost(opts.endpoint);

  try {
    await clients.core.createNamespace({
      body: namespaceManifest(opts.namespace, resolved),
    });

    // Attack containment (task 1.5): one egress NetworkPolicy per
    // `role: 'attack'` node, selecting the pod it actually runs in — its own
    // workload pod, or its host's pod when deployed as a sidecar. Policies go
    // up before any workload so an attack pod starts already contained.
    const resolvedById = new Map(resolved.map((n) => [n.nodeId, n]));
    await Promise.all(
      resolved
        .filter((n) => n.deployment.role === 'attack')
        .map((n) =>
          clients.networking.createNamespacedNetworkPolicy({
            namespace: opts.namespace,
            body: networkPolicyManifest(
              n,
              hostByNode.get(n.nodeId) ?? n,
              n.edgeContext.targets
                .map((id) => resolvedById.get(id))
                .filter((t): t is ResolvedNode => t !== undefined),
              opts.namespace
            ),
          })
        )
    );

    // Ordered rollout (task 1.6): workloads go up in ascending `startOrder`
    // tiers — target and monitor first, then reaction, then attack. Plans in
    // one tier are still created concurrently, one lane per pod-owning node;
    // within a lane the supporting resources (ServiceAccount, Role,
    // RoleBinding, ConfigMaps) are created before the workload that
    // references them. Before any plan carrying an attack-role member, the
    // gate waits for every already-deployed workload's pods to report Ready.
    const nodePorts = new Map<string, number | undefined>();

    const createPlanResources = async (plan: WorkloadPlan): Promise<void> => {
      const node = plan.node;
      const namespace = opts.namespace;

      // One SA/Role/RoleBinding triple per pod — named after the host and
      // covering the union of host + sidecar rbac rules.
      if (workloadRbacRules(plan).length) {
        await clients.core.createNamespacedServiceAccount({
          namespace,
          body: serviceAccountManifest(node, namespace),
        });
        await clients.rbac.createNamespacedRole({
          namespace,
          body: roleManifest(plan, namespace),
        });
        await clients.rbac.createNamespacedRoleBinding({
          namespace,
          body: roleBindingManifest(node, namespace),
        });
      }

      await Promise.all(
        [node, ...plan.sidecars]
          .filter((n) => n.deployment.configFiles?.length)
          .map((n) =>
            clients.core.createNamespacedConfigMap({
              namespace,
              body: configMapManifest(n, namespace),
            })
          )
      );

      if (node.deployment.kind === 'Job') {
        await clients.batch.createNamespacedJob({
          namespace,
          body: jobManifest(plan, namespace),
        });
      } else {
        await clients.apps.createNamespacedDeployment({
          namespace,
          body: deploymentManifest(plan, namespace),
        });
      }

      // No Service for Jobs or for specs that don't expose their port.
      if (node.deployment.kind !== 'Job' && node.deployment.exposePort) {
        const created = await clients.core.createNamespacedService({
          namespace,
          body: serviceManifest(node, namespace),
        });
        nodePorts.set(node.nodeId, created.spec?.ports?.[0]?.nodePort);
      }
    };

    // A plan "carries an attack" when the workload node or one of its
    // sidecars has `role: 'attack'` — a sidecar attack starts with the host
    // pod, so the gate applies to the whole plan.
    const carriesAttack = (plan: WorkloadPlan): boolean =>
      [plan.node, ...plan.sidecars].some((n) => n.deployment.role === 'attack');

    const tiers = new Map<number, WorkloadPlan[]>();
    for (const plan of plans) {
      const order = plan.node.deployment.startOrder ?? 0;
      const tier = tiers.get(order) ?? [];
      tier.push(plan);
      tiers.set(order, tier);
    }

    const deployedNames: string[] = [];
    for (const order of [...tiers.keys()].sort((a, b) => a - b)) {
      const tier = tiers.get(order) ?? [];
      // Non-attack plans of the tier go up first so an attack sharing the
      // tier still trails the workloads it may depend on.
      const regular = tier.filter((p) => !carriesAttack(p));
      const attack = tier.filter(carriesAttack);
      await Promise.all(regular.map(createPlanResources));
      deployedNames.push(...regular.map((p) => p.node.name));
      if (attack.length) {
        await waitForWorkloadsReady(
          clients,
          opts.namespace,
          deployedNames,
          opts.readinessTimeoutMs ?? READINESS_TIMEOUT_MS,
          opts.readinessPollMs ?? READINESS_POLL_MS
        );
        await Promise.all(attack.map(createPlanResources));
        deployedNames.push(...attack.map((p) => p.node.name));
      }
    }

    // One result row per topology node, in resolution order. A sidecar row
    // points at its host's resource name (no workload of its own exists to
    // poll) and carries no port — the host's Service is the only endpoint.
    const results = resolved.map((node) => {
      const owner = hostByNode.get(node.nodeId) ?? node;
      const nodePort =
        node.deployment.attachMode === 'sidecar' ? undefined : nodePorts.get(owner.nodeId);
      return {
        nodeId: node.nodeId,
        serviceId: node.serviceId,
        name: owner.name,
        uiType: node.uiType,
        status: 'pending' as DeployStatus,
        nodePort,
        dashboardUrl: nodePort ? `http://${host}:${nodePort}` : undefined,
      };
    });

    return { namespace: opts.namespace, services: results };
  } catch (err) {
    // Best-effort teardown of resources already created.
    void clients.core.deleteNamespace({ name: opts.namespace }).catch(() => undefined);
    throw toAppError(err, `deploying topology to namespace ${opts.namespace}`);
  }
}

/** Pods carrying `app=<name>` — the pre-fetched batch map, else a live list. */
async function podsFor(
  clients: K8sClients,
  namespace: string,
  name: string,
  pods?: Map<string, V1Pod[]>
): Promise<V1Pod[]> {
  const cached = pods?.get(name) ?? [];
  if (cached.length > 0) return cached;
  return (
    (
      await clients.core.listNamespacedPod({
        namespace,
        labelSelector: `app=${name}`,
      })
    ).items ?? []
  );
}

/**
 * Pod-level failure scan shared by Deployment- and Job-backed services:
 * a `Failed` phase or *any* container stuck on a hard waiting reason or
 * terminated non-zero marks the service failed. Every containerStatus is
 * checked, so a failing sidecar container fails the node it rides on even
 * when the host container is healthy (task 2.1).
 */
function podFailed(pod: V1Pod): boolean {
  if (pod.status?.phase === 'Failed') return true;
  return (pod.status?.containerStatuses ?? []).some((cs) => {
    const reason = cs.state?.waiting?.reason;
    if (reason && FAILURE_REASONS.has(reason)) return true;
    const terminated = cs.state?.terminated;
    return terminated !== undefined && terminated.exitCode !== 0;
  });
}

/**
 * Status of one container: a hard waiting reason or a non-zero termination
 * is `failed`; a clean termination is `completed` (a Job container exits 0);
 * a Ready container is `running`; anything else is still `pending` — a
 * started-but-not-Ready container is not yet ready to serve, so it does not
 * count as running either.
 */
function containerStatusOf(cs: V1ContainerStatus): DeployStatus {
  const reason = cs.state?.waiting?.reason;
  if (reason && FAILURE_REASONS.has(reason)) return 'failed';
  const terminated = cs.state?.terminated;
  if (terminated) return terminated.exitCode === 0 ? 'completed' : 'failed';
  return cs.ready === true ? 'running' : 'pending';
}

/**
 * Per-container status breakdown for the pods backing one workload. Container
 * names repeat across a workload's pods, so the worst status wins — a
 * container failing in any pod reads `failed` even when a sibling pod's copy
 * of it is fine.
 */
function containersFor(pods: V1Pod[]): ContainerDeployStatus[] {
  const rank: Record<DeployStatus, number> = {
    failed: 0,
    pending: 1,
    running: 2,
    completed: 3,
  };
  const byName = new Map<string, DeployStatus>();
  for (const pod of pods) {
    for (const cs of pod.status?.containerStatuses ?? []) {
      if (!cs.name) continue;
      const status = containerStatusOf(cs);
      const prev = byName.get(cs.name);
      if (prev === undefined || rank[status] < rank[prev]) {
        byName.set(cs.name, status);
      }
    }
  }
  return [...byName.entries()].map(([name, status]) => ({ name, status }));
}

/**
 * Status of a `batch/v1` Job node: a `Failed` condition or a saturated
 * `backoffLimit` means `failed`; a `Complete` condition, a `succeeded` count
 * or a `Succeeded` pod means `completed` — the Job ran to the end, which is
 * distinct from `running` (task 2.1). A Running pod still reads `running`
 * while the job is in flight. Pod-level failure reasons short-circuit to
 * `failed` while the job retries. A Job that 404s propagates — the caller
 * maps it to `pending`.
 */
async function jobStatus(
  clients: K8sClients,
  namespace: string,
  name: string,
  pods?: Map<string, V1Pod[]>
): Promise<DeployStatus> {
  const job = await clients.batch.readNamespacedJob({ name, namespace });
  const conditions = job.status?.conditions ?? [];
  if (conditions.some((c) => c.type === 'Failed' && c.status === 'True')) {
    return 'failed';
  }
  if (
    conditions.some((c) => c.type === 'Complete' && c.status === 'True') ||
    (job.status?.succeeded ?? 0) >= 1
  ) {
    return 'completed';
  }
  if ((job.status?.failed ?? 0) >= (job.spec?.backoffLimit ?? 6)) {
    return 'failed';
  }
  for (const pod of await podsFor(clients, namespace, name, pods)) {
    if (podFailed(pod)) return 'failed';
    if (pod.status?.phase === 'Succeeded') return 'completed';
    if (pod.status?.phase === 'Running') return 'running';
  }
  return 'pending';
}

/**
 * Compute the coarse status of a single service workload in a namespace —
 * its `apps/v1` Deployment, or its `batch/v1` Job when the node is
 * `kind: 'Job'` (a Deployment 404 falls through to the Job read).
 *
 * When `pods` is provided, uses the pre-fetched pod list (from a combined
 * label-selector query) instead of issuing a per-service `listNamespacedPod`
 * call, reducing API traffic from N calls to 1 per status poll tick.
 */
async function deploymentStatus(
  clients: K8sClients,
  namespace: string,
  name: string,
  pods?: Map<string, V1Pod[]>
): Promise<DeployStatus> {
  let deployment: V1Deployment;
  try {
    deployment = await clients.apps.readNamespacedDeployment({ name, namespace });
  } catch (err) {
    if (err instanceof ApiException && err.code === 404) {
      return jobStatus(clients, namespace, name, pods);
    }
    throw err;
  }
  const desired = deployment.spec?.replicas ?? 1;
  const available = deployment.status?.availableReplicas ?? 0;
  if (desired > 0 && available >= desired) {
    return 'running';
  }

  for (const pod of await podsFor(clients, namespace, name, pods)) {
    if (podFailed(pod)) {
      return 'failed';
    }
  }
  return 'pending';
}

/**
 * A workload's coarse status plus the per-container breakdown of its pods
 * (task 2.1): `containers` lists every container the pods report — host and
 * sidecars alike — so a sidecar's state is visible instead of being folded
 * into the workload row. It is empty until the cluster reports pod status.
 */
export interface DeploymentServiceStatus {
  name: string;
  status: DeployStatus;
  containers: ContainerDeployStatus[];
}

/**
 * Query the current per-service status of a deployed execution and compute an
 * overall progress percentage (share of services that are `running` or
 * `completed` — a finished Job counts as done, not still-running).
 *
 * Uses a single `listNamespacedPod` call per tick with a combined label
 * selector (`app in (...)`) instead of one call per service, replacing the
 * prior serial-loop pattern (F-PERF-003, F-PERF-004).
 */
export async function getDeploymentStatus(
  clients: K8sClients,
  opts: { namespace: string; names: string[] }
): Promise<{ statuses: DeploymentServiceStatus[]; progress: number }> {
  try {
    const statuses: DeploymentServiceStatus[] = [];

    // Build a combined "app in (a,b,c)" selector so a single list call
    // replaces the prior per-service serial loop. Names are deduplicated —
    // sidecar rows share their host's resource name, and Kubernetes rejects
    // duplicate values in a set-based selector.
    const combinedSelector = `app in (${[...new Set(opts.names)].join(',')})`;

    // Fetch all pods for the requested services in one API call.
    const allPods = await clients.core.listNamespacedPod({
      namespace: opts.namespace,
      labelSelector: combinedSelector,
    });

    // Index pods by their `app` label for quick lookup.
    const podsByApp = new Map<string, typeof allPods.items>();
    for (const pod of allPods.items ?? []) {
      const appLabel = pod.metadata?.labels?.app ?? '';
      if (!appLabel) continue;
      const existing = podsByApp.get(appLabel) ?? [];
      existing.push(pod);
      podsByApp.set(appLabel, existing);
    }

    // Evaluate status for each requested service using the cached pods.
    // Sidecar rows share their host's resource name — memoize per name so a
    // duplicated row does not cost a second workload read per tick.
    const statusByName = new Map<string, DeployStatus>();
    for (const name of opts.names) {
      let status = statusByName.get(name);
      if (status === undefined) {
        try {
          status = await deploymentStatus(clients, opts.namespace, name, podsByApp);
        } catch (err) {
          // A not-yet-created / already-removed deployment reads as pending.
          if (err instanceof ApiException && err.code === 404) {
            status = 'pending';
          } else {
            throw err;
          }
        }
        statusByName.set(name, status);
      }
      statuses.push({ name, status, containers: containersFor(podsByApp.get(name) ?? []) });
    }

    const done = statuses.filter((s) => s.status === 'running' || s.status === 'completed').length;
    const progress = statuses.length ? Math.round((done / statuses.length) * 100) : 0;
    return { statuses, progress };
  } catch (err) {
    throw toAppError(err, `reading deployment status in namespace ${opts.namespace}`);
  }
}

/**
 * True once every service has left `pending` (all `running`, `completed` or
 * `failed`), i.e. the deploy has settled and there is nothing left to poll
 * for. `completed` — a finished Job — counts as settled like any other
 * terminal state (task 2.1). An empty list is trivially settled (nothing was
 * deployed).
 */
export function isDeploymentSettled(statuses: { status: DeployStatus }[]): boolean {
  return statuses.every((s) => s.status !== 'pending');
}

/** A single line of pod log output tagged with its originating service/pod. */
export interface PodLogLine {
  /** Service resource name (shared Deployment/Service name) the pod belongs to. */
  name: string;
  /** Concrete pod name the line came from. */
  pod: string;
  /** One line of container log output (no trailing newline). */
  line: string;
  /**
   * Container the line came from (task 2.2) — the node name for host and
   * sidecar containers alike, so e.g. MMT-Probe alerts and http-sim access
   * logs stay distinguishable in the stream. Absent only for the unqualified
   * fallback read on a pod that declares no containers.
   */
  container?: string;
}

/**
 * Collect pod log output for the given service names and return only the lines
 * not yet emitted. `seen` is a caller-owned map of `<pod>/<container>` ->
 * count of lines already surfaced; it is mutated in place so successive calls
 * yield only new output. The full log is re-read each call (scenario pods are
 * short-lived and low-volume) so the line-count offset is always relative to
 * a stable base.
 *
 * Every container of a pod is read individually and tagged (task 2.2): a pod
 * carrying sidecars would fail an unqualified read with a 400 ("a container
 * name must be specified"), silently dropping all of its output. Container
 * names come from the pod spec, falling back to reported container statuses;
 * a pod that declares neither still gets one unqualified read, preserving the
 * prior single-container behavior. A container that is missing or not yet
 * ready to serve logs (404 / 400) is skipped rather than throwing, so one
 * transient container does not tear down a tail loop or starve its siblings.
 * Any other cluster error is wrapped in an `AppError` and surfaced to the
 * caller so the stream can report it and clean up.
 */
export async function collectNewPodLogs(
  clients: K8sClients,
  opts: { namespace: string; names: string[]; seen: Map<string, number> }
): Promise<PodLogLine[]> {
  const out: PodLogLine[] = [];
  try {
    for (const name of opts.names) {
      const pods = await clients.core.listNamespacedPod({
        namespace: opts.namespace,
        labelSelector: `app=${name}`,
      });
      for (const pod of pods.items ?? []) {
        const podName = pod.metadata?.name;
        if (!podName) continue;

        const containerNames = [
          ...new Set(
            [
              ...(pod.spec?.containers ?? []).map((c) => c.name),
              ...(pod.status?.containerStatuses ?? []).map((cs) => cs.name),
            ].filter((n): n is string => Boolean(n))
          ),
        ];

        for (const containerName of containerNames.length ? containerNames : [undefined]) {
          let raw: string;
          try {
            raw = await clients.core.readNamespacedPodLog({
              name: podName,
              namespace: opts.namespace,
              ...(containerName ? { container: containerName } : {}),
            });
          } catch (err) {
            // A container that has not started yet (400) or has already been
            // removed (404) simply has no readable logs — skip it.
            if (err instanceof ApiException && (err.code === 400 || err.code === 404)) {
              continue;
            }
            throw err;
          }

          const lines = raw.split('\n');
          if (lines.length && lines[lines.length - 1] === '') {
            lines.pop();
          }
          const seenKey = containerName ? `${podName}/${containerName}` : podName;
          const already = opts.seen.get(seenKey) ?? 0;
          for (let i = already; i < lines.length; i++) {
            out.push({ name, pod: podName, container: containerName, line: lines[i] });
          }
          opts.seen.set(seenKey, lines.length);
        }
      }
    }
    return out;
  } catch (err) {
    throw toAppError(err, `reading pod logs in namespace ${opts.namespace}`);
  }
}

/**
 * Lightweight liveness probe against a cluster: list a single namespace. A
 * successful call means the API server answered and authorized the request.
 * Any transport / auth / TLS failure is wrapped in an `AppError` so callers can
 * report a failed connection test instead of crashing.
 */
export async function pingCluster(clients: K8sClients): Promise<void> {
  try {
    await clients.core.listNamespace({ limit: 1 });
  } catch (err) {
    throw toAppError(err, 'testing the cluster connection');
  }
}

/**
 * Tear down a deployed execution by deleting its namespace, which cascades to
 * the Deployments, Services and Pods within it. Deleting an already-gone
 * namespace is treated as success (idempotent).
 */
export async function teardownDeployment(clients: K8sClients, namespace: string): Promise<void> {
  try {
    await clients.core.deleteNamespace({ name: namespace });
  } catch (err) {
    if (err instanceof ApiException && err.code === 404) {
      return;
    }
    throw toAppError(err, `tearing down namespace ${namespace}`);
  }
}
