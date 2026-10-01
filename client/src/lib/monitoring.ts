/**
 * Service monitoring types and API functions (issue #25).
 *
 * CPU and memory come from the Kubernetes metrics-server of each
 * infrastructure. Availability, probe latency, request rate, error rate and
 * p95 latency come from the per-execution observability stack (OTel
 * Collector + Prometheus) when the scenario's `observability` option is on.
 */

import api from './api-core';

export type AlertMetric =
  | 'cpu_millicores'
  | 'memory_mib'
  | 'availability_pct'
  | 'probe_latency_ms'
  | 'request_rate'
  | 'error_rate_pct'
  | 'latency_p95_ms';
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

/** Readings from the execution's observability stack. */
export interface ServiceTraffic {
  /** How the component is probed: HTTP on its readiness path, else TCP. */
  probe?: 'http' | 'tcp';
  /** Last probe succeeded. */
  up?: boolean;
  /** Share of successful probes over the last 5 minutes, 0–1. */
  availability?: number;
  probeLatencyMs?: number;
  /** Real traffic, when the component exposes metrics or pushes OTLP. */
  requestRate?: number;
  /** Share of 5xx / error responses, 0–1. */
  errorRate?: number;
  latencyP95Ms?: number;
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
  /** The execution runs the observability stack. */
  observability: boolean;
  traffic?: ServiceTraffic;
  /** Why the stack gave no reading, when it is on. */
  trafficReason?: string;
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
