import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  HeartPulse,
  Info,
  Loader2,
  MemoryStick,
} from 'lucide-react';
import { monitoringApi, type AlertSeverity } from '@/lib/api';
import type { ServiceMetrics } from '@/lib/monitoring';
import {
  ALL,
  TIME_RANGES,
  SEVERITIES,
  appendSnapshot,
  filterAlerts,
  filterServices,
  formatAlertValue,
  formatCpu,
  formatLatency,
  formatMemory,
  formatPercent,
  formatRate,
  pointsInRange,
  rangeMs,
  METRIC_LABELS,
  OPERATOR_LABELS,
  type MetricHistory,
  type TimeRange,
} from '@/lib/monitoring-history';
import { AlertRulesPanel, SEVERITY_BADGE } from '@/components/monitoring/AlertRulesPanel';
import { MetricSparkline } from '@/components/monitoring/MetricSparkline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** How often the snapshot is refreshed while the page is open. */
export const MONITORING_REFRESH_MS = 10_000;

/**
 * Service monitoring dashboard (issue #25): live CPU and memory of every
 * running service from the Kubernetes metrics-server, sparklines over the
 * session's history, fired threshold alerts and the alert rules.
 */
export function Monitoring() {
  const [serviceKey, setServiceKey] = useState<string>(ALL);
  const [severity, setSeverity] = useState<AlertSeverity | typeof ALL>(ALL);
  const [timeRange, setTimeRange] = useState<TimeRange>('15m');
  const [history, setHistory] = useState<MetricHistory>({});

  const {
    data: snapshot,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['monitoring-metrics'],
    queryFn: () => monitoringApi.getMetrics(),
    refetchInterval: MONITORING_REFRESH_MS,
    staleTime: 0,
  });

  useEffect(() => {
    if (snapshot) setHistory((previous) => appendSnapshot(previous, snapshot));
  }, [snapshot]);

  const services = useMemo(() => snapshot?.services ?? [], [snapshot]);
  const visibleServices = filterServices(services, serviceKey);
  const visibleAlerts = filterAlerts(snapshot?.alerts ?? [], { serviceKey, severity });
  const unavailable = (snapshot?.infrastructures ?? []).filter((i) => !i.available || i.reason);

  // Catalog services currently running, for scoping alert rules.
  const serviceOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const service of services) {
      for (const id of service.serviceIds) {
        if (!options.has(id)) options.set(id, service.name);
      }
    }
    return [...options].map(([serviceId, label]) => ({ serviceId, label }));
  }, [services]);

  const withMetrics = visibleServices.filter((s) => s.metricsAvailable);
  const totalCpu = withMetrics.reduce((sum, s) => sum + s.cpuMillicores, 0);
  const totalMemory = withMetrics.reduce((sum, s) => sum + s.memoryBytes, 0);
  const range = rangeMs(timeRange);
  const probed = visibleServices.filter((s) => s.traffic?.up !== undefined);
  const upCount = probed.filter((s) => s.traffic?.up).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitoring</h1>
        <p className="text-muted-foreground">
          Live resource usage of running services, refreshed every {MONITORING_REFRESH_MS / 1000}{' '}
          seconds
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <p>
          CPU and memory come from the Kubernetes metrics-server of each infrastructure. Health and
          traffic come from the OpenTelemetry Collector and Prometheus deployed with each run of a
          scenario that has observability on: every component with a Service is probed (availability
          and latency over the last 5 minutes), and request rate, error rate and p95 latency appear
          for components that expose Prometheus metrics or send OpenTelemetry traces. Sparkline
          history is collected in this tab since the page was opened (up to 1 hour) and resets on
          reload.
        </p>
      </div>

      {error && !snapshot ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : (
        <>
          {/* A failed background refresh keeps the last snapshot on screen. */}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
              <p className="flex-1">
                Last refresh failed ({(error as Error).message}). Showing data from the previous
                refresh.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}
          {unavailable.map((infra) => (
            <div
              key={infra.infrastructureId}
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p>
                <span className="font-medium">{infra.name || 'Unknown infrastructure'}</span>
                {infra.available ? ': some metrics are unavailable' : ': metrics unavailable'}
                {infra.reason ? ` (${infra.reason})` : ''}
              </p>
            </div>
          ))}

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={serviceKey} onValueChange={setServiceKey}>
              <SelectTrigger className="w-[260px]" aria-label="Filter by service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All services</SelectItem>
                {services.map((service) => (
                  <SelectItem key={service.key} value={service.key}>
                    {service.name} ({service.scenarioTitle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-[180px]" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as AlertSeverity | typeof ALL)}
            >
              <SelectTrigger className="w-[180px]" aria-label="Filter by severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All severities</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryCard icon={Activity} label="Running services" value={visibleServices.length} />
            <SummaryCard
              icon={HeartPulse}
              label="Components up"
              value={probed.length ? `${upCount}/${probed.length}` : '—'}
            />
            <SummaryCard icon={Cpu} label="Total CPU" value={formatCpu(totalCpu)} />
            <SummaryCard
              icon={MemoryStick}
              label="Total memory"
              value={formatMemory(totalMemory)}
            />
            <SummaryCard icon={Bell} label="Active alerts" value={visibleAlerts.length} />
          </div>

          {/* Per-service usage */}
          <div className="rounded-lg border bg-background p-6">
            <h2 className="mb-4 text-lg font-semibold">Services</h2>
            {visibleServices.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No running services</p>
            ) : (
              <Table
                containerProps={{
                  role: 'region',
                  'aria-label': 'Service metrics',
                  tabIndex: 0,
                  className:
                    'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                }}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Infrastructure</TableHead>
                    <TableHead>Pods</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>Memory</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Traffic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleServices.map((service) => {
                    const points = pointsInRange(history[service.key] ?? [], range);
                    return (
                      <TableRow key={service.key}>
                        <TableCell>
                          <div className="font-medium">{service.name}</div>
                          {service.containers.length > 1 && (
                            <div className="text-xs text-muted-foreground">
                              {service.containers
                                .map(
                                  (c) =>
                                    `${c.name}: ${formatCpu(c.cpuMillicores)} / ${formatMemory(c.memoryBytes)}`
                                )
                                .join(' · ')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{service.scenarioTitle}</TableCell>
                        <TableCell>{service.infrastructureName}</TableCell>
                        <TableCell>{service.metricsAvailable ? service.pods : '—'}</TableCell>
                        {service.metricsAvailable ? (
                          <>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="w-20">{formatCpu(service.cpuMillicores)}</span>
                                <span className="hidden xl:inline-flex">
                                  <MetricSparkline
                                    values={points.map((p) => p.cpuMillicores)}
                                    label={`${service.name} CPU, latest ${formatCpu(service.cpuMillicores)}`}
                                  />
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="w-20">{formatMemory(service.memoryBytes)}</span>
                                <span className="hidden xl:inline-flex">
                                  <MetricSparkline
                                    values={points.map((p) => p.memoryBytes)}
                                    label={`${service.name} memory, latest ${formatMemory(service.memoryBytes)}`}
                                    className="text-blue-500"
                                  />
                                </span>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={2} className="text-muted-foreground">
                            No metrics
                          </TableCell>
                        )}
                        <HealthCell service={service} />
                        <TrafficCell service={service} />
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Fired alerts */}
          <div className="rounded-lg border bg-background p-6">
            <h2 className="mb-4 text-lg font-semibold">Active alerts</h2>
            {visibleAlerts.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No active alerts</p>
            ) : (
              <ul className="space-y-2" aria-label="Active alerts">
                {visibleAlerts.map((alert) => (
                  <li
                    key={`${alert.ruleId}-${alert.serviceKey}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <Badge variant={SEVERITY_BADGE[alert.severity]} className="capitalize">
                      {alert.severity}
                    </Badge>
                    <span className="font-medium">{alert.ruleName}</span>
                    <span className="text-muted-foreground">
                      {alert.serviceName}: {METRIC_LABELS[alert.metric]}{' '}
                      {formatAlertValue(alert.metric, alert.value)}{' '}
                      {OPERATOR_LABELS[alert.operator]} {alert.threshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <AlertRulesPanel serviceOptions={serviceOptions} />
    </div>
  );
}

/** Probe status, availability and latency from the observability stack. */
function HealthCell({ service }: { service: ServiceMetrics }) {
  const traffic = service.traffic;
  if (!service.observability) {
    return <TableCell className="text-muted-foreground">Observability off</TableCell>;
  }
  if (service.trafficReason) {
    return (
      <TableCell className="text-sm text-muted-foreground">
        Unavailable ({service.trafficReason})
      </TableCell>
    );
  }
  if (traffic?.up === undefined) {
    return <TableCell className="text-muted-foreground">Not probed</TableCell>;
  }
  return (
    <TableCell>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={traffic.up ? 'success' : 'danger'}>{traffic.up ? 'Up' : 'Down'}</Badge>
        <span className="text-sm text-muted-foreground">
          {[
            traffic.availability !== undefined && `${formatPercent(traffic.availability)} avail.`,
            traffic.probeLatencyMs !== undefined && formatLatency(traffic.probeLatencyMs),
            traffic.probe?.toUpperCase(),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
    </TableCell>
  );
}

/** Real request rate, error rate and p95 latency, when the component reports them. */
function TrafficCell({ service }: { service: ServiceMetrics }) {
  const traffic = service.traffic;
  if (!service.observability || traffic?.requestRate === undefined) {
    return <TableCell className="text-muted-foreground">—</TableCell>;
  }
  return (
    <TableCell className="text-sm">
      {[
        formatRate(traffic.requestRate),
        traffic.errorRate !== undefined && `${formatPercent(traffic.errorRate)} errors`,
        traffic.latencyP95Ms !== undefined && `p95 ${formatLatency(traffic.latencyP95Ms)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </TableCell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-background p-6">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
