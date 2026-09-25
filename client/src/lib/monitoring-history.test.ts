import { describe, it, expect } from 'vitest';
import {
  ALL,
  HISTORY_MAX_AGE_MS,
  appendSnapshot,
  filterAlerts,
  filterServices,
  formatAlertValue,
  formatLatency,
  formatPercent,
  formatRate,
  formatCpu,
  formatMemory,
  pointsInRange,
  rangeMs,
} from './monitoring-history';
import type { FiredAlert, MonitoringSnapshot, ServiceMetrics } from './monitoring';

function service(key: string, overrides: Partial<ServiceMetrics> = {}): ServiceMetrics {
  return {
    key,
    name: key.split(':')[1] ?? key,
    serviceIds: ['svc'],
    nodeIds: ['n1'],
    scenarioId: 's1',
    scenarioTitle: 'Scenario',
    executionId: key.split(':')[0],
    namespace: 'ns',
    infrastructureId: 'i1',
    infrastructureName: 'cluster',
    metricsAvailable: true,
    pods: 1,
    cpuMillicores: 100,
    memoryBytes: 1024 * 1024,
    containers: [],
    ...overrides,
  };
}

function snapshot(at: number, services: ServiceMetrics[]): MonitoringSnapshot {
  return { collectedAt: new Date(at).toISOString(), infrastructures: [], services, alerts: [] };
}

function alert(serviceKey: string, severity: FiredAlert['severity']): FiredAlert {
  return {
    ruleId: `r-${severity}`,
    ruleName: 'Rule',
    serviceKey,
    serviceName: serviceKey,
    executionId: 'e1',
    infrastructureId: 'i1',
    metric: 'cpu_millicores',
    operator: 'gt',
    value: 300,
    threshold: 200,
    severity,
  };
}

const T0 = Date.parse('2026-09-24T10:00:00Z');

describe('appendSnapshot', () => {
  it('adds one point per service with metrics', () => {
    const history = appendSnapshot({}, snapshot(T0, [service('e1:web', { cpuMillicores: 250 })]));
    expect(history['e1:web']).toEqual([{ t: T0, cpuMillicores: 250, memoryBytes: 1024 * 1024 }]);
  });

  it('ignores a repeated snapshot and services without metrics', () => {
    let history = appendSnapshot({}, snapshot(T0, [service('e1:web')]));
    history = appendSnapshot(history, snapshot(T0, [service('e1:web')]));
    expect(history['e1:web']).toHaveLength(1);

    history = appendSnapshot(
      history,
      snapshot(T0 + 10_000, [service('e1:web', { metricsAvailable: false })])
    );
    expect(history['e1:web']).toHaveLength(1);
  });

  it('drops points older than the longest range and services that stopped', () => {
    let history = appendSnapshot({}, snapshot(T0, [service('e1:web'), service('e1:db')]));
    history = appendSnapshot(history, snapshot(T0 + HISTORY_MAX_AGE_MS, [service('e1:web')]));
    expect(history['e1:web'].map((p) => p.t)).toEqual([T0 + HISTORY_MAX_AGE_MS]);
    expect(history['e1:db']).toBeUndefined();
  });

  it('keeps the history unchanged on an unparsable timestamp', () => {
    const history = { 'e1:web': [{ t: T0, cpuMillicores: 1, memoryBytes: 1 }] };
    const bad = { ...snapshot(T0, [service('e1:web')]), collectedAt: 'nope' };
    expect(appendSnapshot(history, bad)).toBe(history);
  });
});

describe('pointsInRange', () => {
  it('keeps the points within the range of the newest one', () => {
    const points = [0, 4, 10, 16].map((m) => ({
      t: T0 + m * 60_000,
      cpuMillicores: m,
      memoryBytes: m,
    }));
    expect(pointsInRange(points, rangeMs('5m')).map((p) => p.cpuMillicores)).toEqual([16]);
    expect(pointsInRange(points, rangeMs('15m')).map((p) => p.cpuMillicores)).toEqual([4, 10, 16]);
    expect(pointsInRange(points, rangeMs('1h'))).toHaveLength(4);
    expect(pointsInRange([], rangeMs('1h'))).toEqual([]);
  });
});

describe('filters', () => {
  const services = [service('e1:web'), service('e1:db')];
  const alerts = [alert('e1:web', 'critical'), alert('e1:db', 'info'), alert('e1:web', 'info')];

  it('narrows services by key', () => {
    expect(filterServices(services, ALL)).toHaveLength(2);
    expect(filterServices(services, 'e1:db').map((s) => s.key)).toEqual(['e1:db']);
  });

  it('narrows alerts by service and severity', () => {
    expect(filterAlerts(alerts, { serviceKey: ALL, severity: ALL })).toHaveLength(3);
    expect(filterAlerts(alerts, { serviceKey: 'e1:web', severity: ALL })).toHaveLength(2);
    expect(filterAlerts(alerts, { serviceKey: ALL, severity: 'info' })).toHaveLength(2);
    expect(
      filterAlerts(alerts, { serviceKey: 'e1:web', severity: 'critical' }).map((a) => a.severity)
    ).toEqual(['critical']);
  });
});

describe('formatting', () => {
  it('formats CPU and memory', () => {
    expect(formatCpu(250.4)).toBe('250m');
    expect(formatCpu(1500)).toBe('1.50 cores');
    expect(formatMemory(64 * 1024 * 1024)).toBe('64.0 MiB');
    expect(formatMemory(2 * 1024 ** 3)).toBe('2.00 GiB');
  });

  it('formats alert values in the rule unit', () => {
    expect(formatAlertValue('cpu_millicores', 300.2)).toBe('300m');
    expect(formatAlertValue('memory_mib', 256)).toBe('256 MiB');
    expect(formatAlertValue('availability_pct', 50)).toBe('50%');
    expect(formatAlertValue('request_rate', 12.5)).toBe('12.5 req/s');
    expect(formatAlertValue('latency_p95_ms', 900)).toBe('900 ms');
  });

  it('formats observability readings', () => {
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.9951)).toBe('99.5%');
    expect(formatLatency(12.4)).toBe('12 ms');
    expect(formatLatency(2500)).toBe('2.50 s');
    expect(formatRate(0.5)).toBe('0.50 req/s');
    expect(formatRate(42.4)).toBe('42 req/s');
  });
});
