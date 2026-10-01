import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Copy, ExternalLink, ListChecks, Loader2, Play } from 'lucide-react';
import type { RunbookExpectation, RunbookStep } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

/** A log line or alert as the console received it (`at` = arrival time). */
export interface RunbookLogLine {
  service: string;
  container?: string;
  line: string;
  at: number;
}

export interface RunbookAlert {
  container?: string;
  verdict?: string;
  line: string;
  at: number;
}

interface RunbookPanelProps {
  steps: RunbookStep[];
  isLoading: boolean;
  /** The runbook query failed — shown instead of the empty state. */
  isError?: boolean;
  onRetry?: () => void;
  logs: RunbookLogLine[];
  alerts: RunbookAlert[];
  /** Deployment still up — actions are offered only then. */
  live: boolean;
  runProfile: (profile: { nodeId: string; name: string }) => void;
  isRunning: boolean;
  openInterface: (serviceName: string) => void;
  copy: (text: string) => void;
}

function safeRegExp(pattern: string | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/** Whether an event received since `since` satisfies the expectation. */
export function expectationMet(
  expectation: RunbookExpectation,
  since: number,
  logs: RunbookLogLine[],
  alerts: RunbookAlert[]
): boolean {
  const pattern = safeRegExp(expectation.pattern);
  if (expectation.source === 'alert') {
    return alerts.some(
      (a) =>
        a.at >= since &&
        (!expectation.container || a.container === expectation.container) &&
        (!pattern || pattern.test(a.verdict ?? a.line))
    );
  }
  return logs.some(
    (l) =>
      l.at >= since &&
      (!expectation.container || (l.container ?? l.service) === expectation.container) &&
      (!pattern || pattern.test(l.line))
  );
}

/**
 * The scenario runbook for one live execution: each step with its action
 * (attack profile / web interfaces), copyable commands and the expected
 * beats, checked off as matching log lines or security alerts arrive after
 * the step was started. A met beat stays checked even once its line has
 * rolled out of the console's log buffer.
 */
export function RunbookPanel({
  steps,
  isLoading,
  isError = false,
  onRetry,
  logs,
  alerts,
  live,
  runProfile,
  isRunning,
  openInterface,
  copy,
}: RunbookPanelProps) {
  /** When each step's action was started (ms) — beats count from there. */
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  /** `<stepId>:<index>` keys of beats already met. */
  const [met, setMet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMet((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const step of steps) {
        const since = step.profile ? startedAt[step.id] : 0;
        if (since === undefined) continue;
        step.expect?.forEach((expectation, index) => {
          const key = `${step.id}:${index}`;
          if (!next.has(key) && expectationMet(expectation, since, logs, alerts)) {
            next.add(key);
            changed = true;
          }
        });
      }
      return changed ? next : prev;
    });
  }, [steps, startedAt, logs, alerts]);

  const start = (step: RunbookStep) => {
    if (!step.profile) return;
    setStartedAt((prev) => ({ ...prev, [step.id]: Date.now() }));
    setMet((prev) => new Set([...prev].filter((key) => !key.startsWith(`${step.id}:`))));
    runProfile(step.profile);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading runbook…
      </div>
    );
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
      >
        <p>Could not load the runbook.</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        This scenario has no runbook.
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <ol className="space-y-3 p-4" data-testid="runbook">
        {steps.map((step, stepIndex) => {
          const started = startedAt[step.id] !== undefined;
          return (
            <li
              key={step.id}
              data-testid={`runbook-step-${step.id}`}
              className="rounded-lg border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  <span className="mr-2 text-muted-foreground">{stepIndex + 1}.</span>
                  {step.title}
                </h3>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {step.links?.map((name) => (
                    <Button
                      key={name}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={!live}
                      onClick={() => openInterface(name)}
                    >
                      <ExternalLink className="h-3 w-3" /> Open {name}
                    </Button>
                  ))}
                  {step.profile && (
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      data-testid={`runbook-run-${step.id}`}
                      disabled={!live || isRunning}
                      onClick={() => start(step)}
                    >
                      <Play className="h-3 w-3" /> {started ? 'Run again' : 'Run'}
                    </Button>
                  )}
                </div>
              </div>

              {step.description && (
                <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
              )}

              {step.commands && step.commands.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {step.commands.map((command) => (
                    <button
                      key={command}
                      type="button"
                      title="Copy command"
                      onClick={() => copy(command)}
                      className="flex w-full items-start gap-2 rounded border bg-muted/50 px-2.5 py-1.5 text-left font-mono text-[11px] leading-snug text-foreground/80 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1 break-all">{command}</span>
                      <Copy className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {step.expect && step.expect.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" />
                    Expected
                    {step.profile && !started && ' — press Run to start checking'}
                  </div>
                  <ul className="space-y-1" aria-live="polite">
                    {step.expect.map((expectation, index) => {
                      const ok = met.has(`${step.id}:${index}`);
                      const checking = started || !step.profile;
                      return (
                        <li
                          key={expectation.label}
                          data-testid={`runbook-expect-${step.id}-${index}`}
                          data-met={ok}
                          className="flex items-center gap-2 text-sm"
                        >
                          {ok ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                            />
                          ) : checking ? (
                            <Loader2
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                            />
                          ) : (
                            <Circle
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-muted-foreground/60"
                            />
                          )}
                          <span className="sr-only">
                            {ok ? 'Met' : checking ? 'Checking' : 'Not started'}:
                          </span>
                          <span className={ok ? '' : 'text-muted-foreground'}>
                            {expectation.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
