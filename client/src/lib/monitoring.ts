/**
 * Service monitoring types and API functions (issue #25).
 *
 * CPU and memory come from the Kubernetes metrics-server of each
 * infrastructure; request rate, error rate and latency are not available yet.
 */

import api from './api-core';

export type AlertMetric = 'cpu_millicores' | 'memory_mib';
export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface InfrastructureAvailability {
  infrastructureId: string;
  name: string;
  available: boolean;
  reason?: string;
  namespaces: number;
}

export interface ContainerUsage {
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
}

export interface ServiceMetrics {
  /** `<executionId>:<workload name>` — unique per running workload. */
  key: string;
  name: string;
  serviceIds: string[];
  nodeIds: string[];
  scenarioId: string;
  scenarioTitle: string;
  executionId: string;
  namespace: string;
  infrastructureId: string;
  infrastructureName: string;
  metricsAvailable: boolean;
  pods: number;
  cpuMillicores: number;
  memoryBytes: number;
  containers: ContainerUsage[];
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

export interface MonitoringSnapshot {
  collectedAt: string;
  infrastructures: InfrastructureAvailability[];
  services: ServiceMetrics[];
  alerts: FiredAlert[];
}

export interface MonitoringFilters {
  infrastructureId?: string;
  serviceId?: string;
  severity?: AlertSeverity;
}

export interface AlertRule {
  _id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  scope?: { serviceId?: string; infrastructureId?: string };
  enabled: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRuleInput {
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  scope?: { serviceId?: string; infrastructureId?: string };
  enabled?: boolean;
}

export const monitoringApi = {
  getMetrics: async (filters: MonitoringFilters = {}): Promise<MonitoringSnapshot> => {
    const { data } = await api.get('/monitoring/metrics', { params: filters });
    return data;
  },
  listRules: async (): Promise<AlertRule[]> => {
    const { data } = await api.get('/monitoring/alert-rules');
    return data;
  },
  createRule: async (rule: AlertRuleInput): Promise<AlertRule> => {
    const { data } = await api.post('/monitoring/alert-rules', rule);
    return data;
  },
  updateRule: async (id: string, rule: Partial<AlertRuleInput>): Promise<AlertRule> => {
    const { data } = await api.put(`/monitoring/alert-rules/${id}`, rule);
    return data;
  },
  deleteRule: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/monitoring/alert-rules/${id}`);
    return data;
  },
};
