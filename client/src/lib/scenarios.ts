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
  status?: 'pending' | 'running' | 'failed';
  /** Reachable NodePort URL for the deployed service. */
  dashboardUrl?: string;
}

/** Per-service result returned by the execute/deploy endpoint. */
export interface DeployedServiceResult {
  nodeId: string;
  serviceId: string;
  name: string;
  uiType: 'web' | 'terminal' | 'both';
  status: 'pending' | 'running' | 'failed';
  dashboardUrl?: string;
  nodePort?: number;
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
  /** @deprecated Legacy MAESTRO field, no longer written or read. */
  maestroSessionId?: string;
}

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
  ): Promise<{ executionId: string; namespace?: string; status: string; message: string }> => {
    const { data } = await api.delete(`/scenarios/${scenarioId}/executions/${executionId}`);
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
