/**
 * Scenario execution service.
 *
 * Owns the "execute" orchestration: validates the scenario, resolves topology
 * nodes against services, deploys to Kubernetes, and records the execution
 * atomically — avoiding the push()+save() race that could lose records when
 * two parallel POSTs interleave.
 */

import mongoose, { type Types } from 'mongoose';
import {
  buildClientFromInfrastructure,
  deployTopology,
  deriveNamespace,
  planDeployedServices,
  type DeployResult,
  type ServiceImageSource,
} from './kubernetesDeploy.js';
import { AppError } from '../middleware/errorHandler.js';
import { Scenario } from '../models/Scenario.js';
import { recordDeployFailure } from './executionReport.js';

/** Minimal view of an Infrastructure document. */
interface InfrastructureView {
  endpoint: string;
  credentials: { iv: string; encrypted: string; authTag: string };
}

/** Result of a successful scenario execution. */
export interface ExecutionResult {
  executionId: string;
  namespace: string;
  status: string;
  services: DeployResult['services'];
}

/**
 * The execution's positional filter, matching only while it has not been
 * torn down (`completedAt` unset) — so a background rollout that finishes
 * after a teardown cannot reopen the closed run.
 */
function liveExecutionFilter(scenarioId: Types.ObjectId, executionId: string) {
  return {
    _id: scenarioId,
    executions: {
      $elemMatch: {
        _id: new mongoose.Types.ObjectId(executionId),
        completedAt: { $exists: false },
      },
    },
  };
}

/** Whether the execution was closed by a teardown (it carries `completedAt`). */
async function wasTornDown(scenarioId: Types.ObjectId, executionId: string): Promise<boolean> {
  const closed = await Scenario.exists({
    _id: scenarioId,
    executions: {
      $elemMatch: {
        _id: new mongoose.Types.ObjectId(executionId),
        completedAt: { $exists: true },
      },
    },
  });
  return closed !== null;
}

/**
 * Execute a scenario: validate, deploy, and record the execution.
 *
 * Accepts either a Mongoose document (with `save()`) or a plain object
 * (from `findOneAndUpdate({ new: true })`). The caller is responsible for
 * having already pushed the execution record atomically.
 *
 * @param scenario   — a Scenario document/object that already has the new
 *                   execution pushed onto `executions`.
 * @param infrastructure — the infrastructure for cluster access.
 * @param services   — resolved service list for topology node matching.
 * @returns execution result with id, namespace, status and services.
 */
export async function executeScenario(
  scenario: {
    _id: Types.ObjectId;
    title?: string;
    topology?: { nodes?: unknown[]; edges?: unknown[] };
    infrastructureId?: Types.ObjectId;
    /** Scenario option; absent on older documents, which means on. */
    observability?: boolean;
    executions: unknown[];
    save?(): Promise<unknown>;
  } | null,
  infrastructure: InfrastructureView,
  services: { _id: Types.ObjectId | string }[]
): Promise<ExecutionResult> {
  if (!scenario || !scenario.infrastructureId) {
    throw new AppError('Scenario has no infrastructure assigned', 400);
  }

  const nodes = scenario.topology?.nodes ?? [];

  // Resolve the services referenced by the topology nodes.
  const serviceIds = [
    ...new Set(
      nodes
        .map((n) => (n as { data?: { serviceId?: string } }).data?.serviceId)
        .filter((sid): sid is string => Boolean(sid))
    ),
  ];
  const resolvedServices = services.filter((s) => serviceIds.includes(s._id.toString()));

  // The caller already pushed a new execution atomically; grab the last one.
  const execIndex = scenario.executions.length - 1;
  const execItem = scenario.executions[execIndex] as Record<string, unknown>;
  const executionId = (execItem._id as Types.ObjectId)?.toString() ?? '';

  if (!executionId) {
    throw new AppError('No execution id available', 500);
  }

  const namespace = deriveNamespace(scenario._id.toString(), executionId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = buildClientFromInfrastructure(infrastructure as any);

  try {
    const result = await deployTopology(clients, {
      namespace,
      nodes,
      edges: scenario.topology?.edges ?? [],
      services: resolvedServices as unknown as ServiceImageSource[],
      endpoint: infrastructure.endpoint,
      observability: scenario.observability !== false,
    });

    // Update the execution record atomically via positional operator
    // so concurrent requests don't collide on save().
    execItem.namespace = result.namespace;
    execItem.status = 'running';
    execItem.deployedServices = result.services.map((s) => ({
      serviceId: s.serviceId,
      nodeId: s.nodeId,
      name: s.name,
      uiType: s.uiType,
      status: s.status,
      dashboardUrl: s.dashboardUrl,
      webInterface: s.webInterface,
    }));

    await Scenario.findOneAndUpdate(liveExecutionFilter(scenario._id, executionId), {
      $set: {
        'executions.$.namespace': result.namespace,
        'executions.$.status': execItem.status,
        'executions.$.deployedServices': execItem.deployedServices,
        'executions.$.observability': result.observability,
      },
    });

    return {
      executionId,
      namespace: result.namespace,
      status: execItem.status as string,
      services: result.services,
    };
  } catch (deployError) {
    // Torn down while still rolling out: the teardown already closed the run
    // (completed + report) and deleting the namespace is what broke the
    // deploy — leave that record alone instead of flipping it to failed.
    if (await wasTornDown(scenario._id, executionId)) {
      throw new AppError('Deployment was torn down before rollout finished', 409);
    }
    // Surface the deploy failure but leave a durable, failed execution record
    // closed with its run-end stamps (issue #26).
    const completedAt = new Date();
    const executedAt = new Date(execItem.executedAt as Date | string);
    const durationMs = Number.isNaN(executedAt.getTime())
      ? 0
      : Math.max(0, completedAt.getTime() - executedAt.getTime());
    execItem.namespace = namespace;
    execItem.status = 'failed';
    await Scenario.findOneAndUpdate(liveExecutionFilter(scenario._id, executionId), {
      $set: {
        'executions.$.namespace': namespace,
        'executions.$.status': 'failed',
        'executions.$.completedAt': completedAt,
        'executions.$.durationMs': durationMs,
        'executions.$.outcome': 'failed',
      },
    });
    // Best-effort failure report; never throws, so it cannot mask deployError.
    await recordDeployFailure({
      scenario: { _id: scenario._id, title: scenario.title },
      execution: {
        _id: executionId,
        executedAt: execItem.executedAt as Date | string,
        executedBy: execItem.executedBy as string | undefined,
        status: 'failed',
        namespace,
        deployedServices: [],
      },
      completedAt,
      error: deployError,
    });
    throw deployError;
  }
}

/**
 * Derive a deterministic namespace name for an execution. Kubernetes namespace
 * names must be DNS-1123 labels (lowercase alphanumeric or `-`, ≤63 chars).
 * Re-exported from kubernetesDeploy for use by the SSE service.
 */
/**
 * Record the rollout plan on the freshly pushed execution — namespace and
 * the per-node rows `deployTopology` will produce, status `pending` — and
 * return it, so the route can answer right away and open the console while
 * `executeScenario` rolls the topology out in the background. Throws (before
 * anything is deployed) for a topology that cannot resolve.
 */
export async function planExecution(
  scenario: {
    _id: Types.ObjectId;
    topology?: { nodes?: unknown[]; edges?: unknown[] };
    executions: unknown[];
  },
  services: { _id: Types.ObjectId | string }[]
): Promise<ExecutionResult> {
  const execItem = scenario.executions[scenario.executions.length - 1] as Record<string, unknown>;
  const executionId = (execItem?._id as Types.ObjectId)?.toString() ?? '';
  if (!executionId) throw new AppError('No execution id available', 500);

  const namespace = deriveNamespace(scenario._id.toString(), executionId);
  const planned = planDeployedServices({
    nodes: scenario.topology?.nodes ?? [],
    edges: scenario.topology?.edges ?? [],
    services: services as unknown as ServiceImageSource[],
  });

  await Scenario.findOneAndUpdate(
    { _id: scenario._id, 'executions._id': new mongoose.Types.ObjectId(executionId) },
    {
      $set: {
        'executions.$.namespace': namespace,
        'executions.$.deployedServices': planned.map((s) => ({
          serviceId: s.serviceId,
          nodeId: s.nodeId,
          name: s.name,
          uiType: s.uiType,
          status: s.status,
          webInterface: s.webInterface,
        })),
      },
    }
  );
  return { executionId, namespace, status: 'pending', services: planned };
}

export { deriveNamespace } from './kubernetesDeploy.js';
