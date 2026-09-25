import { Metrics, ApiException, type KubeConfig, type PodMetric } from '@kubernetes/client-node';
import { Types } from 'mongoose';
import { Scenario, type IDeployedService } from '../models/Scenario.js';
import { Infrastructure, type IInfrastructure } from '../models/Infrastructure.js';
import {
  AlertRule,
  type AlertMetric,
  type AlertOperator,
  type AlertSeverity,
} from '../models/AlertRule.js';
import { buildKubeConfig } from './kubernetesDeploy.js';
import {
  apiGetFor,
  classifyObservabilityError,
  collectTraffic,
  type ServiceTraffic,
} from './observability.js';

/**
 * Service monitoring (issue #25).
 *
 * Builds an on-demand CPU/memory snapshot of every running service from the
 * Kubernetes metrics-server (`metrics.k8s.io`), grouped by the infrastructure
 * each execution was deployed to, and evaluates the persisted `AlertRule`
 * thresholds against it. One `getPodMetrics` call is made per active
 * namespace. A cluster without metrics-server, without RBAC on
 * `pods.metrics.k8s.io`, or unreachable degrades that infrastructure to
 * `available: false` with a fixed reason — it never fails the whole snapshot.
 *
 * Only CPU and memory are available from metrics-server; request rate, error
 * rate and latency need Prometheus/instrumentation and are not covered here.
 *
 * Responses are assembled from explicit fields: infrastructure credentials are
 * decrypted only to build the KubeConfig and never leave this module.
 */

/** Upper bound on one infrastructure's metrics reads, so a dead cluster cannot stall the dashboard. */
export const METRICS_TIMEOUT_MS = 8000;

const MIB = 1024 * 1024;

/**
 * An execution is live while its namespace exists: the console saves
 * `completed` as soon as the rollout settles, but only teardown stamps
 * `completedAt` (same rule as `isLive` in scenarios.routes.ts).
 */
function isLiveExecution(execution: {
  status: string;
  namespace?: string | null;
  completedAt?: Date | null;
}): boolean {
  return !!execution.namespace && !execution.completedAt && execution.status !== 'failed';
}

// ---------------------------------------------------------------------------
// Quantity parsing
// ---------------------------------------------------------------------------

const QUANTITY_PATTERN = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?([A-Za-z]*)$/;

const QUANTITY_SUFFIXES: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

/** Parse a Kubernetes quantity ('250m', '128Mi', '1e3') into base units; NaN when malformed. */
function parseQuantity(quantity: string | undefined): number {
  const match = QUANTITY_PATTERN.exec(String(quantity ?? '').trim());
  if (!match) return NaN;
  const [, digits, exponent, suffix] = match;
  const multiplier = QUANTITY_SUFFIXES[suffix];
  if (multiplier === undefined) return NaN;
  return Number(digits) * 10 ** Number(exponent ?? 0) * multiplier;
}

/** CPU quantity (cores, with n/u/m suffixes) to millicores; 0 when malformed. */
export function parseCpuQuantity(quantity: string | undefined): number {
  const cores = parseQuantity(quantity);
  return Number.isFinite(cores) ? Math.round(cores * 1e6) / 1e3 : 0;
}

/** Memory quantity (Ki/Mi/Gi..., k/M/G..., or plain bytes) to bytes; 0 when malformed. */
export function parseMemoryQuantity(quantity: string | undefined): number {
  const bytes = parseQuantity(quantity);
  return Number.isFinite(bytes) ? Math.round(bytes) : 0;
}

// ---------------------------------------------------------------------------
// Pod metrics -> deployed services
// ---------------------------------------------------------------------------

export interface ContainerUsage {
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
}

/**
 * Usage of one deployed workload (a Deployment/Job and its pods). Sidecar
 * nodes share their host's workload name, so they are folded into it: their
 * catalog ids are listed in `serviceIds` and their usage shows up as extra
 * `containers`.
 */
export interface WorkloadUsage {
  name: string;
  serviceIds: string[];
  nodeIds: string[];
  pods: number;
  cpuMillicores: number;
  memoryBytes: number;
  containers: ContainerUsage[];
}

type DeployedServiceRef = Pick<IDeployedService, 'serviceId' | 'nodeId' | 'name'>;

function addUnique(list: string[], value: string | undefined): void {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * Attribute pod metrics to the execution's deployed workloads. A pod matches
 * by its `app` label (set on every workload the deploy engine creates) or,
 * when unlabelled, by the `<workload>-` pod-name prefix (longest name wins).
 * Pods matching no workload are ignored; usage sums across replicas.
 */
export function mapPodMetricsToServices(
  pods: PodMetric[],
  deployedServices: DeployedServiceRef[]
): WorkloadUsage[] {
  const workloads = new Map<string, WorkloadUsage>();
  for (const svc of deployedServices) {
    if (!svc.name) continue;
    let workload = workloads.get(svc.name);
    if (!workload) {
      workload = {
        name: svc.name,
        serviceIds: [],
        nodeIds: [],
        pods: 0,
        cpuMillicores: 0,
        memoryBytes: 0,
        containers: [],
      };
      workloads.set(svc.name, workload);
    }
    addUnique(workload.serviceIds, svc.serviceId ? String(svc.serviceId) : undefined);
    addUnique(workload.nodeIds, svc.nodeId);
  }

  const byLongestName = [...workloads.keys()].sort((a, b) => b.length - a.length);

  for (const pod of pods) {
    const app = pod.metadata?.labels?.app;
    const podName = pod.metadata?.name ?? '';
    const workload = app
      ? workloads.get(app)
      : workloads.get(byLongestName.find((name) => podName.startsWith(`${name}-`)) ?? '');
    if (!workload) continue;

    workload.pods += 1;
    for (const container of pod.containers ?? []) {
      const cpu = parseCpuQuantity(container.usage?.cpu);
      const memory = parseMemoryQuantity(container.usage?.memory);
      workload.cpuMillicores += cpu;
      workload.memoryBytes += memory;
      let entry = workload.containers.find((c) => c.name === container.name);
      if (!entry) {
        entry = { name: container.name, cpuMillicores: 0, memoryBytes: 0 };
        workload.containers.push(entry);
      }
      entry.cpuMillicores += cpu;
      entry.memoryBytes += memory;
    }
  }

  return [...workloads.values()];
}

// ---------------------------------------------------------------------------
// Alert rule evaluation
// ---------------------------------------------------------------------------

/** Minimal service sample the rules are evaluated against. */
export interface AlertSample {
  key: string;
  name: string;
  executionId: string;
  infrastructureId: string;
  serviceIds: string[];
  pods: number;
  cpuMillicores: number;
  memoryBytes: number;
  /** False when metrics-server gave no reading for the namespace. */
  metricsAvailable?: boolean;
  /** Probe and traffic readings from the observability stack. */
  traffic?: ServiceTraffic;
}

/** Rule fields the evaluation needs (a lean `AlertRule` document fits). */
export interface AlertRuleLike {
  _id: unknown;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
  scope?: { serviceId?: unknown; infrastructureId?: unknown };
}

export interface FiredAlert {
  ruleId: string;
  ruleName: string;
  serviceKey: string;
  serviceName: string;
  executionId: string;
  infrastructureId: string;
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
  threshold: number;
  severity: AlertSeverity;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The sample's value in the rule's unit, or undefined when there is no
 * reading — no data is not a zero reading, so the rule does not fire.
 */
function metricValue(sample: AlertSample, metric: AlertMetric): number | undefined {
  const traffic = sample.traffic;
  switch (metric) {
    case 'cpu_millicores':
    case 'memory_mib':
      if (sample.pods === 0 || sample.metricsAvailable === false) return undefined;
      return metric === 'cpu_millicores' ? sample.cpuMillicores : round2(sample.memoryBytes / MIB);
    case 'availability_pct':
      return traffic?.availability === undefined ? undefined : round2(traffic.availability * 100);
    case 'probe_latency_ms':
      return traffic?.probeLatencyMs === undefined ? undefined : round2(traffic.probeLatencyMs);
    case 'request_rate':
      return traffic?.requestRate === undefined ? undefined : round2(traffic.requestRate);
    case 'error_rate_pct':
      return traffic?.errorRate === undefined ? undefined : round2(traffic.errorRate * 100);
    case 'latency_p95_ms':
      return traffic?.latencyP95Ms === undefined ? undefined : round2(traffic.latencyP95Ms);
  }
}

function compare(operator: AlertOperator, value: number, threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
  }
}

/**
 * Fire every enabled rule whose threshold the sample crosses. Scoped rules only
 * apply to samples of that catalog service / infrastructure; a sample with no
 * reading for the rule's metric is skipped (no data is not a zero reading) —
 * CPU/memory need a pod reporting to metrics-server, traffic metrics need the
 * observability stack. Alerts are ordered critical first.
 */
export function evaluateAlertRules(samples: AlertSample[], rules: AlertRuleLike[]): FiredAlert[] {
  const alerts: FiredAlert[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const scopeService = rule.scope?.serviceId ? String(rule.scope.serviceId) : undefined;
    const scopeInfra = rule.scope?.infrastructureId
      ? String(rule.scope.infrastructureId)
      : undefined;
    for (const sample of samples) {
      if (scopeService && !sample.serviceIds.includes(scopeService)) continue;
      if (scopeInfra && sample.infrastructureId !== scopeInfra) continue;
      const value = metricValue(sample, rule.metric);
      if (value === undefined || !compare(rule.operator, value, rule.threshold)) continue;
      alerts.push({
        ruleId: String(rule._id),
        ruleName: rule.name,
        serviceKey: sample.key,
        serviceName: sample.name,
        executionId: sample.executionId,
        infrastructureId: sample.infrastructureId,
        metric: rule.metric,
        operator: rule.operator,
        value,
        threshold: rule.threshold,
        severity: rule.severity,
      });
    }
  }
  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// ---------------------------------------------------------------------------
// Snapshot collection
// ---------------------------------------------------------------------------

class MetricsTimeoutError extends Error {}

/** Fixed reason for a failed observability-stack read. */
function classifyTrafficError(err: unknown): string {
  return err instanceof MetricsTimeoutError
    ? 'the observability stack did not answer in time'
    : classifyObservabilityError(err);
}

/**
 * Fixed, user-facing reason for a failed metrics read. Never echoes the error
 * message — the fetch-failure path embeds the cluster endpoint and cause.
 */
export function classifyMetricsError(err: unknown): string {
  if (err instanceof MetricsTimeoutError) {
    return 'Timed out waiting for the Kubernetes metrics API';
  }
  if (err instanceof ApiException) {
    switch (err.code) {
      case 404:
      case 503:
        return 'metrics-server is not installed or not available in this cluster';
      case 403:
        return 'Missing RBAC permission: get/list on pods.metrics.k8s.io';
      case 401:
        return 'The cluster rejected the stored credentials';
      default:
        return `Kubernetes metrics API error (${err.code})`;
    }
  }
  return 'Kubernetes metrics API unreachable';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new MetricsTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface MonitoringFilters {
  infrastructureId?: string;
  serviceId?: string;
  severity?: AlertSeverity;
}

export interface InfrastructureAvailability {
  infrastructureId: string;
  name: string;
  available: boolean;
  reason?: string;
  namespaces: number;
}

export interface ServiceMetrics extends AlertSample {
  nodeIds: string[];
  scenarioId: string;
  scenarioTitle: string;
  namespace: string;
  infrastructureName: string;
  /** False when no metrics could be read for this service's namespace. */
  metricsAvailable: boolean;
  containers: ContainerUsage[];
  /** The execution runs the observability stack (scenario option). */
  observability: boolean;
  /** Why the stack gave no reading, when it is on but could not be read. */
  trafficReason?: string;
}

export interface MonitoringSnapshot {
  collectedAt: string;
  infrastructures: InfrastructureAvailability[];
  services: ServiceMetrics[];
  alerts: FiredAlert[];
}

interface ActiveExecution {
  scenarioId: string;
  scenarioTitle: string;
  executionId: string;
  namespace: string;
  deployedServices: DeployedServiceRef[];
  observability: boolean;
}

async function collectInfrastructure(
  infrastructureId: string,
  executions: ActiveExecution[],
  serviceId: string | undefined,
  timeoutMs: number
): Promise<{ availability: InfrastructureAvailability; services: ServiceMetrics[] }> {
  const namespaces = [...new Set(executions.map((e) => e.namespace))];
  const infrastructure = await Infrastructure.findById(infrastructureId).lean();
  const name = infrastructure?.name ?? '';

  const podsByNamespace = new Map<string, PodMetric[]>();
  const trafficByNamespace = new Map<string, Map<string, ServiceTraffic>>();
  const trafficReasons = new Map<string, string>();
  const observed = [...new Set(executions.filter((e) => e.observability).map((e) => e.namespace))];
  let reason: string | undefined;

  if (!infrastructure) {
    reason = 'Infrastructure not found';
  } else {
    let kc: KubeConfig | undefined;
    try {
      kc = buildKubeConfig(infrastructure as unknown as IInfrastructure);
    } catch {
      reason = 'Could not build a Kubernetes client from the stored credentials';
    }
    if (kc) {
      const client = new Metrics(kc);
      const get = apiGetFor(kc);
      const [metricsResults, trafficResults] = await Promise.all([
        Promise.allSettled(
          namespaces.map((ns) => withTimeout(client.getPodMetrics(ns), timeoutMs))
        ),
        Promise.allSettled(
          observed.map((ns) => withTimeout(collectTraffic(get, ns, { timeoutMs }), timeoutMs))
        ),
      ]);
      metricsResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          podsByNamespace.set(namespaces[i], result.value.items ?? []);
        } else {
          reason ??= classifyMetricsError(result.reason);
        }
      });
      trafficResults.forEach((result, i) => {
        if (result.status === 'fulfilled') trafficByNamespace.set(observed[i], result.value);
        else trafficReasons.set(observed[i], classifyTrafficError(result.reason));
      });
    }
  }

  const services: ServiceMetrics[] = [];
  for (const execution of executions) {
    const pods = podsByNamespace.get(execution.namespace);
    for (const workload of mapPodMetricsToServices(pods ?? [], execution.deployedServices)) {
      if (serviceId && !workload.serviceIds.includes(serviceId)) continue;
      services.push({
        key: `${execution.executionId}:${workload.name}`,
        name: workload.name,
        serviceIds: workload.serviceIds,
        nodeIds: workload.nodeIds,
        scenarioId: execution.scenarioId,
        scenarioTitle: execution.scenarioTitle,
        executionId: execution.executionId,
        namespace: execution.namespace,
        infrastructureId,
        infrastructureName: name,
        metricsAvailable: pods !== undefined,
        pods: workload.pods,
        cpuMillicores: workload.cpuMillicores,
        memoryBytes: workload.memoryBytes,
        containers: workload.containers,
        observability: execution.observability,
        ...trafficFields(execution, workload.name),
      });
    }
  }

  function trafficFields(
    execution: ActiveExecution,
    workloadName: string
  ): Pick<ServiceMetrics, 'traffic' | 'trafficReason'> {
    if (!execution.observability) return {};
    const traffic = trafficByNamespace.get(execution.namespace);
    if (!traffic) {
      return {
        trafficReason:
          trafficReasons.get(execution.namespace) ?? 'the observability stack could not be queried',
      };
    }
    const entry = traffic.get(workloadName);
    return entry ? { traffic: entry } : {};
  }

  return {
    availability: {
      infrastructureId,
      name,
      available: podsByNamespace.size > 0,
      ...(reason ? { reason } : {}),
      namespaces: namespaces.length,
    },
    services,
  };
}

/**
 * Collect a CPU/memory snapshot of every running service (optionally narrowed
 * to one infrastructure or catalog service), plus the alerts fired by the
 * enabled rules (optionally narrowed to one severity).
 */
export async function collectMonitoringSnapshot(
  filters: MonitoringFilters = {},
  timeoutMs: number = METRICS_TIMEOUT_MS
): Promise<MonitoringSnapshot> {
  const scenarios = await Scenario.find({
    infrastructureId: filters.infrastructureId
      ? new Types.ObjectId(filters.infrastructureId)
      : { $ne: null },
    executions: {
      $elemMatch: {
        status: { $ne: 'failed' },
        completedAt: null,
        namespace: { $nin: [null, ''] },
      },
    },
  })
    .select('title infrastructureId executions')
    .lean();

  const byInfrastructure = new Map<string, ActiveExecution[]>();
  for (const scenario of scenarios) {
    const infrastructureId = String(scenario.infrastructureId);
    for (const execution of scenario.executions) {
      if (!isLiveExecution(execution) || !execution.namespace) continue;
      if (
        filters.serviceId &&
        !execution.deployedServices.some((s) => String(s.serviceId) === filters.serviceId)
      ) {
        continue;
      }
      const group = byInfrastructure.get(infrastructureId) ?? [];
      group.push({
        scenarioId: String(scenario._id),
        scenarioTitle: scenario.title,
        executionId: String(execution._id),
        namespace: execution.namespace,
        deployedServices: execution.deployedServices,
        observability: execution.observability === true,
      });
      byInfrastructure.set(infrastructureId, group);
    }
  }

  const collected = await Promise.all(
    [...byInfrastructure].map(([infrastructureId, executions]) =>
      collectInfrastructure(infrastructureId, executions, filters.serviceId, timeoutMs)
    )
  );

  const infrastructures = collected
    .map((c) => c.availability)
    .sort((a, b) => a.name.localeCompare(b.name));
  const services = collected
    .flatMap((c) => c.services)
    .sort(
      (a, b) =>
        a.infrastructureName.localeCompare(b.infrastructureName) ||
        a.scenarioTitle.localeCompare(b.scenarioTitle) ||
        a.name.localeCompare(b.name)
    );

  const rules = services.length
    ? await AlertRule.find({ enabled: true }).lean<AlertRuleLike[]>()
    : [];
  const alerts = evaluateAlertRules(services, rules).filter(
    (a) => !filters.severity || a.severity === filters.severity
  );

  return { collectedAt: new Date().toISOString(), infrastructures, services, alerts };
}
