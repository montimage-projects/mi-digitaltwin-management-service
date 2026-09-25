/**
 * Scenario-related types and API functions.
 * Extracted from api.ts to reduce its size.
 */

import api from './api-core';

export interface Topology {
  yaml: string;
  nodes: object[];
  edges: object[];
}

export interface DeployedService {
  serviceId: { _id: string; shortName: string; title: string };
  /** Topology node id this deployment was created from. */
  nodeId?: string;
  /** Kubernetes resource name shared by the Deployment and Service. */
  name?: string;
  /** UI presentation of the underlying service. */
  uiType?: 'web' | 'terminal' | 'both';
  /** Coarse per-service deploy status derived from the cluster. */
  status?: 'pending' | 'running' | 'completed' | 'failed';
  /** Reachable NodePort URL for the deployed service. */
  dashboardUrl?: string;
  /** Has a web-reachable Service (opened through the platform proxy). */
  webInterface?: boolean;
}

/** Per-service result returned by the execute/deploy endpoint. */
export interface DeployedServiceResult {
  nodeId: string;
  serviceId: string;
  name: string;
  uiType: 'web' | 'terminal' | 'both';
  status: 'pending' | 'running' | 'completed' | 'failed';
  dashboardUrl?: string;
  nodePort?: number;
  /** Has a web-reachable Service — known from the plan, before any NodePort. */
  webInterface?: boolean;
}

export interface ExecuteResult {
  executionId: string;
  namespace: string;
  status: string;
  services: DeployedServiceResult[];
}

export interface Conclusion {
  text: string;
  author: string;
  createdAt: string;
}

export interface Execution {
  _id: string;
  executedAt: string;
  executedBy: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Kubernetes namespace the topology was deployed into. */
  namespace?: string;
  deployedServices: DeployedService[];
  conclusion?: Conclusion;
  /** When the run closed — teardown or deploy failure. */
  completedAt?: string;
  /** Run time from `executedAt` to `completedAt`, in ms. */
  durationMs?: number;
  /** Overall verdict recorded when the run closed. */
  outcome?: ExecutionOutcome;
}

/** Overall verdict of a closed run. */
export type ExecutionOutcome = 'passed' | 'failed' | 'partial';

/** Export formats served by the execution report endpoint. */
export type ReportFormat = 'json' | 'md' | 'html';

export interface Scenario {
  _id: string;
  projectId: { _id: string; shortName: string; title: string; sector: string } | string;
  title: string;
  description?: string;
  topology: Topology;
  infrastructureId?: {
    _id: string;
    name: string;
    type: string;
    status: string;
    endpoint?: string;
  } | null;
  executions: Execution[];
  latestExecution?: {
    status: Execution['status'];
    executedAt: string;
    executedBy: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenarioData {
  title: string;
  description?: string;
  topology?: Partial<Topology>;
  infrastructureId?: string;
}

/** An observable outcome the runbook checks off live. */
export interface RunbookExpectation {
  label: string;
  source: 'alert' | 'log';
  container?: string;
  pattern?: string;
}

/** One runbook step, already resolved against the execution. */
export interface RunbookStep {
  id: string;
  title: string;
  description?: string;
  profile?: { nodeId: string; name: string };
  links?: string[];
  commands?: string[];
  expect?: RunbookExpectation[];
}

export interface ExecutionRunbook {
  context: { namespace: string; pods: Record<string, { pod: string; ip?: string }> };
  steps: RunbookStep[];
}

/** A node's seeded attack profile (e.g. MAG's R1 two-attack script). */
export interface AttackProfile {
  nodeId: string;
  name: string;
  description?: string;
  args: string[];
}

export const scenariosApi = {
  list: async (projectId: string): Promise<Scenario[]> => {
    const { data } = await api.get(`/projects/${projectId}/scenarios`);
    return data;
  },
  get: async (id: string): Promise<Scenario> => {
    const { data } = await api.get(`/scenarios/${id}`);
    return data;
  },
  create: async (projectId: string, scenarioData: CreateScenarioData): Promise<Scenario> => {
    const { data } = await api.post(`/projects/${projectId}/scenarios`, scenarioData);
    return data;
  },
  update: async (id: string, scenarioData: Partial<CreateScenarioData>): Promise<Scenario> => {
    const { data } = await api.put(`/scenarios/${id}`, scenarioData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/scenarios/${id}`);
    return data;
  },
  execute: async (id: string): Promise<ExecuteResult> => {
    const { data } = await api.post(`/scenarios/${id}/execute`);
    return data;
  },
  teardown: async (
    scenarioId: string,
    executionId: string
  ): Promise<{
    executionId: string;
    namespace?: string;
    status: string;
    outcome?: ExecutionOutcome;
    durationMs?: number;
    message: string;
  }> => {
    const { data } = await api.delete(`/scenarios/${scenarioId}/executions/${executionId}`);
    return data;
  },
  /** Signed, short-lived proxy link to a deployed service's web interface. */
  getServiceLink: async (
    scenarioId: string,
    executionId: string,
    serviceName: string
  ): Promise<{ url: string }> => {
    const { data } = await api.post(
      `/scenarios/${scenarioId}/executions/${executionId}/services/${serviceName}/link`
    );
    return data;
  },
  /** The scenario runbook resolved against this execution. */
  getRunbook: async (scenarioId: string, executionId: string): Promise<ExecutionRunbook> => {
    const { data } = await api.get(`/scenarios/${scenarioId}/executions/${executionId}/runbook`);
    return data;
  },
  /** Seeded attack profiles runnable in this execution's pods. */
  listProfiles: async (scenarioId: string, executionId: string): Promise<AttackProfile[]> => {
    const { data } = await api.get(`/scenarios/${scenarioId}/executions/${executionId}/profiles`);
    return data.profiles;
  },
  /** Start one profile in its node's pod; output streams into the console. */
  runProfile: async (
    scenarioId: string,
    executionId: string,
    profile: Pick<AttackProfile, 'nodeId' | 'name'>
  ): Promise<{ pod: string; container: string; message: string }> => {
    const { data } = await api.post(
      `/scenarios/${scenarioId}/executions/${executionId}/profiles/run`,
      { nodeId: profile.nodeId, name: profile.name }
    );
    return data;
  },
  /** Download an execution report as a Blob (JSON, Markdown or HTML). */
  getReport: async (
    scenarioId: string,
    executionId: string,
    format: ReportFormat
  ): Promise<Blob> => {
    const { data } = await api.get(`/scenarios/${scenarioId}/executions/${executionId}/report`, {
      params: { format },
      responseType: 'blob',
    });
    return data;
  },
  addConclusion: async (
    scenarioId: string,
    executionId: string,
    conclusion: { text: string; author: string }
  ): Promise<Execution> => {
    const { data } = await api.post(
      `/scenarios/${scenarioId}/executions/${executionId}/conclusion`,
      conclusion
    );
    return data;
  },
  updateExecutionStatus: async (
    scenarioId: string,
    executionId: string,
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): Promise<Execution> => {
    const { data } = await api.put(`/scenarios/${scenarioId}/executions/${executionId}/status`, {
      status,
    });
    return data;
  },
};
