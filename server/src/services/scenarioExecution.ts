/**
 * Scenario execution service.
 *
 * Owns the "execute" orchestration: validates the scenario, resolves topology
 * nodes against services, deploys to Kubernetes, and records the execution
 * atomically — avoiding the push()+save() race that could lose records when
 * two parallel POSTs interleave.
 */

import type { Types } from 'mongoose';
import {
  buildClientFromInfrastructure,
  deployTopology,
  deriveNamespace,
  type DeployResult,
  type ServiceImageSource,
} from './kubernetesDeploy.js';
import { AppError } from '../middleware/errorHandler.js';

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
    topology?: { nodes?: unknown[] };
    infrastructureId?: Types.ObjectId;
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
      services: resolvedServices as unknown as ServiceImageSource[],
      endpoint: infrastructure.endpoint,
    });

    // Update the execution record atomically.
    execItem.namespace = result.namespace;
    execItem.status = 'running';
    execItem.deployedServices = result.services.map((s) => ({
      serviceId: s.serviceId,
      nodeId: s.nodeId,
      name: s.name,
      uiType: s.uiType,
      status: s.status,
      dashboardUrl: s.dashboardUrl,
    }));

    if (scenario.save) {
      await scenario.save();
    }

    return {
      executionId,
      namespace: result.namespace,
      status: execItem.status as string,
      services: result.services,
    };
  } catch (deployError) {
    // Surface the deploy failure but leave a durable, failed execution record.
    execItem.namespace = namespace;
    execItem.status = 'failed';
    if (scenario.save) {
      await scenario.save();
    }
    throw deployError;
  }
}

/**
 * Derive a deterministic namespace name for an execution. Kubernetes namespace
 * names must be DNS-1123 labels (lowercase alphanumeric or `-`, ≤63 chars).
 * Re-exported from kubernetesDeploy for use by the SSE service.
 */
export { deriveNamespace } from './kubernetesDeploy.js';
