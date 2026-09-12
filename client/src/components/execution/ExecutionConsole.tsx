import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Terminal,
  Globe,
  Trash2,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import {
  scenariosApi,
  subscribeToExecutionEvents,
  type ContainerDeployStatus,
  type DeployedServiceResult,
  type DeployStatus,
  type ExecutionK8sEvent,
  type ExecutionServiceStatus,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface LogLine {
  id: number;
  service: string;
  pod: string;
  container?: string;
  line: string;
}

interface K8sEventLine extends ExecutionK8sEvent {
  id: number;
}

/** Maximum number of log lines to retain in the ring buffer. */
const MAX_LOG_LINES = 2000;

/** Maximum number of namespace events retained in the events pane. */
const MAX_K8S_EVENTS = 500;

/** A service row merged with its live status, incl. per-container breakdown. */
type MergedService = DeployedServiceResult & { containers?: ContainerDeployStatus[] };

/**
 * Key a log line belongs to when grouping by container: the container name
 * when the stream carries one, else the workload (service) name — a pod that
 * reports no containers has only its host container anyway.
 */
function logContainerKey(log: Pick<LogLine, 'service' | 'container'>): string {
  return log.container ?? log.service;
}

type Phase = 'running' | 'completed' | 'failed' | 'torn-down';

interface ExecutionConsoleProps {
  scenarioId: string;
  executionId: string;
  namespace: string;
  /** Per-service snapshot from the deploy response (names, uiType, URLs). */
  services: DeployedServiceResult[];
  /** Remove the execution tab and return to the editor. */
  onClose: () => void;
}

const statusMeta: Record<DeployStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', className: 'text-yellow-700 dark:text-yellow-400', icon: Clock },
  running: {
    label: 'Running',
    className: 'text-green-700 dark:text-green-400',
    icon: CheckCircle2,
  },
  completed: {
    label: 'Completed',
    className: 'text-green-700 dark:text-green-400',
    icon: CheckCircle2,
  },
  failed: { label: 'Failed', className: 'text-red-600 dark:text-red-400', icon: XCircle },
};

export function ExecutionConsole({
  scenarioId,
  executionId,
  namespace,
  services,
  onClose,
}: ExecutionConsoleProps) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [liveStatus, setLiveStatus] = useState<Record<string, ExecutionServiceStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [events, setEvents] = useState<K8sEventLine[]>([]);
  /** Active log tab: a container name, or null for the combined "All" view. */
  const [activeContainer, setActiveContainer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('running');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const logIdRef = useRef(0);
  const eventIdRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const eventsViewportRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<() => void>(undefined);

  // Subscribe to the live event stream for this execution. The subscription is
  // torn down on unmount or whenever the execution identity changes, mirroring
  // the backend's own cleanup so we never leak an open fetch stream.
  useEffect(() => {
    setProgress(0);
    setLiveStatus({});
    setLogs([]);
    setEvents([]);
    setActiveContainer(null);
    setPhase('running');
    setErrorMessage(null);
    logIdRef.current = 0;
    eventIdRef.current = 0;

    const applyStatuses = (updates?: ExecutionServiceStatus[]): void => {
      if (!updates?.length) return;
      setLiveStatus((prev) => {
        const next = { ...prev };
        for (const s of updates) next[s.name] = s;
        return next;
      });
    };

    const settle = (status: 'completed' | 'failed'): void => {
      setProgress(100);
      setPhase(status);
      // Persist the terminal status so the execution history reflects reality;
      // the SSE stream derives it from the cluster but does not save it.
      scenariosApi
        .updateExecutionStatus(scenarioId, executionId, status)
        .then(() => queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] }))
        .catch(() => {
          /* history is best-effort; the toast below already reported the result */
        });
    };

    const unsubscribe = subscribeToExecutionEvents(scenarioId, executionId, {
      onProgress: (event) => {
        setProgress(event.progress);
        applyStatuses(event.services);
      },
      onLog: (event) => {
        setLogs((prev) => {
          const next = [
            ...prev,
            {
              id: logIdRef.current++,
              service: event.service,
              pod: event.pod,
              container: event.container,
              line: event.line,
            },
          ];
          // Ring-buffer cap: drop oldest lines when over the limit.
          if (next.length > MAX_LOG_LINES) {
            return next.slice(next.length - MAX_LOG_LINES);
          }
          return next;
        });
      },
      onK8sEvent: (event) => {
        setEvents((prev) => {
          const next = [...prev, { ...event, id: eventIdRef.current++ }];
          if (next.length > MAX_K8S_EVENTS) {
            return next.slice(next.length - MAX_K8S_EVENTS);
          }
          return next;
        });
      },
      onEnd: (event) => {
        applyStatuses(event.services);
        settle(event.status);
        if (event.status === 'completed') {
          toast.success('Deployment completed');
        } else {
          toast.error('Deployment failed');
        }
      },
      onError: (event) => {
        setPhase('failed');
        setErrorMessage(event.message);
        toast.error(`Deployment error: ${event.message}`);
      },
    });

    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribeRef.current = undefined;
      unsubscribe();
    };
  }, [scenarioId, executionId, queryClient]);

  // Keep the log viewport pinned to the newest line as logs arrive or the
  // active container tab changes.
  useEffect(() => {
    const viewport = viewportRef.current?.querySelector<HTMLDivElement>(
      '[data-radix-scroll-area-viewport]'
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [logs, activeContainer]);

  // Keep the events pane pinned to the newest event as they arrive.
  useEffect(() => {
    const viewport = eventsViewportRef.current?.querySelector<HTMLDivElement>(
      '[data-radix-scroll-area-viewport]'
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [events]);

  const [teardownDialogOpen, setTeardownDialogOpen] = useState(false);

  const teardownMutation = useMutation({
    mutationFn: () => scenariosApi.teardown(scenarioId, executionId),
    onSuccess: (result) => {
      unsubscribeRef.current?.();
      toast.success(result.message || 'Deployment torn down');
      setPhase('torn-down');
      queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to tear down deployment: ${error.message}`);
    },
  });

  const handleTeardownConfirm = () => {
    teardownMutation.mutate();
    setTeardownDialogOpen(false);
  };

  const mergedServices = useMemo<MergedService[]>(
    () =>
      services.map((s) => {
        const live = liveStatus[s.name];
        return { ...s, status: live?.status ?? s.status, containers: live?.containers };
      }),
    [services, liveStatus]
  );

  // One log tab per container, ordered by first appearance: containers the
  // cluster already reported (host first, then sidecars) come before tabs
  // discovered only through log lines.
  const containerKeys = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    const push = (key: string | undefined): void => {
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    };
    for (const s of mergedServices) {
      for (const c of s.containers ?? []) push(c.name);
    }
    for (const log of logs) push(logContainerKey(log));
    return keys;
  }, [mergedServices, logs]);

  const visibleLogs = useMemo(
    () =>
      activeContainer === null
        ? logs
        : logs.filter((log) => logContainerKey(log) === activeContainer),
    [logs, activeContainer]
  );

  const isSettled = phase !== 'running';
  const tornDown = phase === 'torn-down';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Kubernetes Deployment</span>
          <Badge variant="outline" className="font-mono text-xs">
            {namespace}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isSettled && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deploying…
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            onClick={() => setTeardownDialogOpen(true)}
            disabled={teardownMutation.isPending || tornDown}
            title="Delete this deployment from the cluster"
          >
            {teardownMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {tornDown ? 'Torn Down' : 'Tear Down'}
          </Button>
          <AlertDialog open={teardownDialogOpen} onOpenChange={setTeardownDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tear down deployment</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the deployment from the cluster. All running services will be
                  stopped and their resources released. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleTeardownConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Tear down
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Services panel */}
        <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {phase === 'completed'
                  ? 'Deployment complete'
                  : phase === 'failed'
                    ? 'Deployment failed'
                    : phase === 'torn-down'
                      ? 'Deployment removed'
                      : 'Deploying services'}
              </span>
              <span className="tabular-nums text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {errorMessage && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span className="text-red-600 dark:text-red-400">{errorMessage}</span>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-2 p-4">
              {mergedServices.length === 0 && (
                <li className="text-sm text-muted-foreground">No services in this deployment.</li>
              )}
              {mergedServices.map((service) => {
                const meta = statusMeta[service.status] ?? statusMeta.pending;
                const StatusIcon = !isSettled && service.status === 'pending' ? Loader2 : meta.icon;
                const isWeb = service.uiType === 'web' || service.uiType === 'both';
                const canLink = isWeb && !!service.dashboardUrl && !tornDown && phase !== 'failed';

                return (
                  <li key={service.nodeId} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {isWeb ? (
                          <Globe className="h-4 w-4 shrink-0 text-blue-500" />
                        ) : (
                          <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-sm font-medium">{service.name}</span>
                      </div>
                      <span
                        className={`flex shrink-0 items-center gap-1 text-xs ${meta.className}`}
                        title={meta.label}
                      >
                        <StatusIcon
                          className={`h-3.5 w-3.5 ${StatusIcon === Loader2 ? 'animate-spin' : ''}`}
                        />
                        {meta.label}
                      </span>
                    </div>

                    {/* Per-container status — surfaces a finished Job's
                        `completed` state at container granularity. */}
                    {service.containers && service.containers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {service.containers.map((container) => {
                          const cMeta = statusMeta[container.status] ?? statusMeta.pending;
                          return (
                            <Badge
                              key={container.name}
                              variant="outline"
                              data-testid={`container-status-${container.name}`}
                              className={`gap-1 text-xs ${cMeta.className}`}
                            >
                              {container.name}: {cMeta.label}
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-2">
                      {canLink ? (
                        <a
                          href={service.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open interface
                        </a>
                      ) : service.uiType === 'terminal' ? (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Terminal className="h-3 w-3" />
                          Terminal service
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {tornDown ? 'Removed' : 'No web interface available'}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>

        {/* Log console */}
        <div className="flex min-h-0 flex-col bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
            <div className="flex items-center gap-2 text-zinc-300">
              <Terminal className="h-4 w-4" />
              <span className="text-sm font-medium">Logs</span>
            </div>
            <span className="text-xs text-zinc-400">{visibleLogs.length} lines</span>
          </div>
          {/* One tab per container; "All" restores the combined stream. */}
          {containerKeys.length > 0 && (
            <div
              data-testid="log-tabs"
              className="flex flex-wrap items-center gap-1 border-b border-zinc-800 px-3 py-1.5"
            >
              <button
                type="button"
                data-testid="log-tab-all"
                onClick={() => setActiveContainer(null)}
                className={`rounded px-2 py-0.5 text-xs ${
                  activeContainer === null
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              {containerKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`log-tab-${key}`}
                  onClick={() => setActiveContainer(key)}
                  className={`rounded px-2 py-0.5 font-mono text-xs ${
                    activeContainer === key
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
          <ScrollArea ref={viewportRef} className="min-h-0 flex-1">
            <div className="p-3 font-mono text-xs leading-relaxed">
              {visibleLogs.length === 0 ? (
                <p className="text-zinc-400">
                  {logs.length === 0
                    ? isSettled
                      ? 'No logs were captured.'
                      : 'Waiting for logs…'
                    : 'No logs for this container.'}
                </p>
              ) : (
                visibleLogs.map((log) => (
                  <div
                    key={log.id}
                    data-testid="log-line"
                    className="whitespace-pre-wrap break-all text-zinc-300"
                  >
                    <span className="mr-2 text-emerald-400">
                      [{log.service}
                      {log.container ? `:${log.container}` : ''}]
                    </span>
                    {log.line}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Namespace events pane — `k8s-event` SSE records (scheduling,
              image pulls, probe failures, reaction activity…). */}
          <div
            data-testid="events-pane"
            className="flex h-44 shrink-0 flex-col border-t border-zinc-800"
          >
            <div className="flex items-center justify-between px-4 py-1.5">
              <div className="flex items-center gap-2 text-zinc-300">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium">Namespace events</span>
              </div>
              <span className="text-xs text-zinc-400">{events.length} events</span>
            </div>
            <ScrollArea ref={eventsViewportRef} className="min-h-0 flex-1">
              <div className="space-y-1 px-3 pb-3 font-mono text-xs leading-relaxed">
                {events.length === 0 ? (
                  <p className="text-zinc-500">
                    {isSettled ? 'No namespace events were captured.' : 'Waiting for events…'}
                  </p>
                ) : (
                  events.map((ev) => {
                    const time = ev.timestamp ? new Date(ev.timestamp) : null;
                    const timeLabel =
                      time && !Number.isNaN(time.getTime()) ? time.toLocaleTimeString() : null;
                    const warning = ev.type === 'Warning';
                    return (
                      <div
                        key={ev.id}
                        data-testid="k8s-event"
                        className="flex flex-wrap items-baseline gap-x-2"
                      >
                        {timeLabel && (
                          <span className="tabular-nums text-zinc-500">{timeLabel}</span>
                        )}
                        <span className={warning ? 'text-amber-400' : 'text-sky-400'}>
                          {ev.reason ?? 'Event'}
                        </span>
                        {(ev.objectKind || ev.objectName) && (
                          <span className="text-zinc-500">
                            {[ev.objectKind, ev.objectName].filter(Boolean).join('/')}
                          </span>
                        )}
                        {ev.message && (
                          <span className="whitespace-pre-wrap break-all text-zinc-300">
                            {ev.message}
                            {ev.count !== undefined && ev.count > 1 ? ` (×${ev.count})` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Footer */}
      {isSettled && (
        <div className="flex items-center justify-end border-t bg-muted/30 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
