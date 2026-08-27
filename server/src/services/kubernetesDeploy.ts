import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  ApiException,
  type V1Deployment,
  type V1Service,
  type V1Namespace,
} from '@kubernetes/client-node';
import type { IInfrastructure } from '../models/Infrastructure.js';
import { decrypt } from '../utils/encryption.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Kubernetes deploy engine.
 *
 * Deploys a scenario topology directly to a Kubernetes cluster instead of
 * delegating to the MAESTRO orchestrator. The engine is intentionally thin:
 * each topology node maps to a single-container `apps/v1` Deployment plus a
 * `v1` NodePort Service (NodePort so the service is reachable without an
 * Ingress controller). Edge wiring, env vars and volumes are out of scope.
 */

/** Coarse per-service deploy status. */
export type DeployStatus = 'pending' | 'running' | 'failed';

/** Kubernetes API clients scoped to a single cluster. */
export interface K8sClients {
  core: CoreV1Api;
  apps: AppsV1Api;
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
  services: ServiceImageSource[];
  /** Cluster API endpoint; its host is used to build reachable NodePort URLs. */
  endpoint: string;
}

/** Default container/service port used for the single mapped port per node. */
const DEFAULT_CONTAINER_PORT = 80;

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
  data?: { serviceId?: string; version?: string; label?: string };
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
 * Throws `AppError(400)` for nodes without a service or without a usable image.
 */
export function resolveTopologyNodes(
  nodes: unknown[],
  services: ServiceImageSource[]
): ResolvedNode[] {
  const byId = new Map(services.map((s) => [String(s._id), s]));

  return nodes.map((raw, index) => {
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

    return {
      nodeId,
      serviceId: String(serviceId),
      name: toResourceName(nodeId, index),
      image: entry.dockerImage,
      uiType: service.uiType ?? 'web',
      containerPort: DEFAULT_CONTAINER_PORT,
    };
  });
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
 * Build `CoreV1Api` + `AppsV1Api` clients for a target infrastructure.
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
    };
  } catch (err) {
    throw toAppError(err, 'building the Kubernetes client');
  }
}

function namespaceManifest(namespace: string): V1Namespace {
  return {
    metadata: {
      name: namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
  };
}

function deploymentManifest(node: ResolvedNode, namespace: string): V1Deployment {
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
        spec: {
          containers: [
            {
              name: node.name,
              image: node.image,
              ports: [{ containerPort: node.containerPort }],
            },
          ],
        },
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
 * Deploy a scenario topology into a fresh per-execution namespace: create the
 * namespace, then one Deployment + one NodePort Service per topology node.
 *
 * Uses `Promise.all` for batch Deployment/Service creation. On mid-deploy
 * failure, tears down already-created resources (best-effort) before re-throwing.
 */
export async function deployTopology(
  clients: K8sClients,
  opts: DeployTopologyOptions
): Promise<DeployResult> {
  const resolved = resolveTopologyNodes(opts.nodes, opts.services);
  const host = endpointHost(opts.endpoint);

  try {
    await clients.core.createNamespace({ body: namespaceManifest(opts.namespace) });

    // Batch create all Deployments + Services concurrently via Promise.all.
    const results = await Promise.all(
      resolved.map(async (node) => {
        await clients.apps.createNamespacedDeployment({
          namespace: opts.namespace,
          body: deploymentManifest(node, opts.namespace),
        });
        const created = await clients.core.createNamespacedService({
          namespace: opts.namespace,
          body: serviceManifest(node, opts.namespace),
        });
        const nodePort = created.spec?.ports?.[0]?.nodePort;
        return {
          nodeId: node.nodeId,
          serviceId: node.serviceId,
          name: node.name,
          uiType: node.uiType,
          status: 'pending' as DeployStatus,
          nodePort,
          dashboardUrl: nodePort ? `http://${host}:${nodePort}` : undefined,
        };
      })
    );

    return { namespace: opts.namespace, services: results };
  } catch (err) {
    // Best-effort teardown of resources already created.
    void clients.core.deleteNamespace({ name: opts.namespace }).catch(() => undefined);
    throw toAppError(err, `deploying topology to namespace ${opts.namespace}`);
  }
}

/** Compute the coarse status of a single Deployment in a namespace. */
async function deploymentStatus(
  clients: K8sClients,
  namespace: string,
  name: string
): Promise<DeployStatus> {
  const deployment = await clients.apps.readNamespacedDeployment({ name, namespace });
  const desired = deployment.spec?.replicas ?? 1;
  const available = deployment.status?.availableReplicas ?? 0;
  if (desired > 0 && available >= desired) {
    return 'running';
  }

  const pods = await clients.core.listNamespacedPod({
    namespace,
    labelSelector: `app=${name}`,
  });
  for (const pod of pods.items ?? []) {
    if (pod.status?.phase === 'Failed') {
      return 'failed';
    }
    for (const cs of pod.status?.containerStatuses ?? []) {
      const reason = cs.state?.waiting?.reason;
      if (reason && FAILURE_REASONS.has(reason)) {
        return 'failed';
      }
    }
  }
  return 'pending';
}

/**
 * Query the current per-service status of a deployed execution and compute an
 * overall progress percentage (share of services that are `running`).
 *
 * Uses a single `listNamespacedPod` call per tick with a combined label
 * selector (`app in (...)`) instead of one call per service, replacing the
 * prior serial-loop pattern (F-PERF-003, F-PERF-004).
 */
export async function getDeploymentStatus(
  clients: K8sClients,
  opts: { namespace: string; names: string[] }
): Promise<{ statuses: { name: string; status: DeployStatus }[]; progress: number }> {
  try {
    const statuses: { name: string; status: DeployStatus }[] = [];

    // Build a combined "app in (a,b,c)" selector so a single list call
    // replaces the prior per-service serial loop.
    const combinedSelector = `app in (${opts.names.join(',')})`;

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
    for (const name of opts.names) {
      let status: DeployStatus;
      try {
        status = await deploymentStatus(clients, opts.namespace, name);
      } catch (err) {
        // A not-yet-created / already-removed deployment reads as pending.
        if (err instanceof ApiException && err.code === 404) {
          status = 'pending';
        } else {
          throw err;
        }
      }
      statuses.push({ name, status });
    }

    // Enrich statuses with pod-level failure info from the batch query.
    for (const entry of statuses) {
      if (entry.status !== 'pending') continue;
      const pods = podsByApp.get(entry.name) ?? [];
      for (const pod of pods) {
        if (pod.status?.phase === 'Failed') {
          entry.status = 'failed';
          break;
        }
        for (const cs of pod.status?.containerStatuses ?? []) {
          const reason = cs.state?.waiting?.reason;
          if (reason && FAILURE_REASONS.has(reason)) {
            entry.status = 'failed';
            break;
          }
        }
        if (entry.status === 'failed') break;
      }
    }

    const running = statuses.filter((s) => s.status === 'running').length;
    const progress = statuses.length ? Math.round((running / statuses.length) * 100) : 0;
    return { statuses, progress };
  } catch (err) {
    throw toAppError(err, `reading deployment status in namespace ${opts.namespace}`);
  }
}

/**
 * True once every service has left `pending` (all `running` or `failed`), i.e.
 * the deploy has settled and there is nothing left to poll for. An empty list
 * is trivially settled (nothing was deployed).
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
}

/**
 * Collect pod log output for the given service names and return only the lines
 * not yet emitted. `seen` is a caller-owned map of pod name -> count of lines
 * already surfaced; it is mutated in place so successive calls yield only new
 * output. The full log is re-read each call (scenario pods are short-lived and
 * low-volume) so the line-count offset is always relative to a stable base.
 *
 * Pods that are missing or not yet ready to serve logs (404 / 400) are skipped
 * rather than throwing, so a transient state does not tear down a tail loop.
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

        let raw: string;
        try {
          raw = await clients.core.readNamespacedPodLog({
            name: podName,
            namespace: opts.namespace,
          });
        } catch (err) {
          // A pod that has not started its container yet (400) or has already
          // been removed (404) simply has no readable logs — skip it.
          if (err instanceof ApiException && (err.code === 400 || err.code === 404)) {
            continue;
          }
          throw err;
        }

        const lines = raw.split('\n');
        if (lines.length && lines[lines.length - 1] === '') {
          lines.pop();
        }
        const already = opts.seen.get(podName) ?? 0;
        for (let i = already; i < lines.length; i++) {
          out.push({ name, pod: podName, line: lines[i] });
        }
        opts.seen.set(podName, lines.length);
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
