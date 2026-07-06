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

/** Lowercase a string into a DNS label suitable for a Kubernetes name segment. */
function toLabelSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
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
          { name: 'secsim-cluster', server: infrastructure.endpoint, skipTLSVerify: true },
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
 */
export async function deployTopology(
  clients: K8sClients,
  opts: DeployTopologyOptions
): Promise<DeployResult> {
  const resolved = resolveTopologyNodes(opts.nodes, opts.services);
  const host = endpointHost(opts.endpoint);

  try {
    await clients.core.createNamespace({ body: namespaceManifest(opts.namespace) });

    const services: DeployedServiceResult[] = [];
    for (const node of resolved) {
      await clients.apps.createNamespacedDeployment({
        namespace: opts.namespace,
        body: deploymentManifest(node, opts.namespace),
      });
      const created = await clients.core.createNamespacedService({
        namespace: opts.namespace,
        body: serviceManifest(node, opts.namespace),
      });

      const nodePort = created.spec?.ports?.[0]?.nodePort;
      services.push({
        nodeId: node.nodeId,
        serviceId: node.serviceId,
        name: node.name,
        uiType: node.uiType,
        status: 'pending',
        nodePort,
        dashboardUrl: nodePort ? `http://${host}:${nodePort}` : undefined,
      });
    }

    return { namespace: opts.namespace, services };
  } catch (err) {
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
 */
export async function getDeploymentStatus(
  clients: K8sClients,
  opts: { namespace: string; names: string[] }
): Promise<{ statuses: { name: string; status: DeployStatus }[]; progress: number }> {
  try {
    const statuses: { name: string; status: DeployStatus }[] = [];
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

    const running = statuses.filter((s) => s.status === 'running').length;
    const progress = statuses.length ? Math.round((running / statuses.length) * 100) : 0;
    return { statuses, progress };
  } catch (err) {
    throw toAppError(err, `reading deployment status in namespace ${opts.namespace}`);
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
