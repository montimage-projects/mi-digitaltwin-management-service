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
} from 'lucide-react';
import {
  scenariosApi,
  subscribeToExecutionEvents,
  type DeployedServiceResult,
  type DeployStatus,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface LogLine {
  id: number;
  service: string;
  pod: string;
  line: string;
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
  pending: { label: 'Pending', className: 'text-yellow-500', icon: Clock },
  running: { label: 'Running', className: 'text-green-500', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'text-red-500', icon: XCircle },
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
  const [liveStatus, setLiveStatus] = useState<Record<string, DeployStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [phase, setPhase] = useState<Phase>('running');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const logIdRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Subscribe to the live event stream for this execution. The subscription is
  // torn down on unmount or whenever the execution identity changes, mirroring
  // the backend's own cleanup so we never leak an open fetch stream.
  useEffect(() => {
    setProgress(0);
    setLiveStatus({});
    setLogs([]);
    setPhase('running');
    setErrorMessage(null);
    logIdRef.current = 0;

    const applyStatuses = (updates?: { name: string; status: DeployStatus }[]): void => {
      if (!updates?.length) return;
      setLiveStatus((prev) => {
        const next = { ...prev };
        for (const s of updates) next[s.name] = s.status;
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
        setLogs((prev) => [
          ...prev,
          { id: logIdRef.current++, service: event.service, pod: event.pod, line: event.line },
        ]);
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

    return unsubscribe;
  }, [scenarioId, executionId, queryClient]);

  // Keep the log viewport pinned to the newest line as logs arrive.
  useEffect(() => {
    const viewport = viewportRef.current?.querySelector<HTMLDivElement>(
      '[data-radix-scroll-area-viewport]'
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [logs]);

  const teardownMutation = useMutation({
    mutationFn: () => scenariosApi.teardown(scenarioId, executionId),
    onSuccess: (result) => {
      toast.success(result.message || 'Deployment torn down');
      setPhase('torn-down');
      queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to tear down deployment: ${error.message}`);
    },
  });

  const mergedServices = useMemo(
    () => services.map((s) => ({ ...s, status: liveStatus[s.name] ?? s.status })),
    [services, liveStatus]
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
            className="text-red-500 hover:text-red-600"
            onClick={() => teardownMutation.mutate()}
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
            <span className="text-xs text-zinc-500">{logs.length} lines</span>
          </div>
          <ScrollArea ref={viewportRef} className="min-h-0 flex-1">
            <div className="p-3 font-mono text-xs leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-zinc-500">
                  {isSettled ? 'No logs were captured.' : 'Waiting for logs…'}
                </p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="whitespace-pre-wrap break-all text-zinc-300">
                    <span className="mr-2 text-emerald-400">[{log.service}]</span>
                    {log.line}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
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
