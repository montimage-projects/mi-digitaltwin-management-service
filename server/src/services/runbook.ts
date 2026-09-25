/**
 * Execution runbook — the step-by-step guide a scenario carries for testing
 * a live deployment (e.g. the R1 two-attack demo), rendered against one
 * execution so every command, link and expected beat is ready to use.
 *
 * Steps are scenario data (`scenario.runbook.steps`). Text fields may use
 * placeholders resolved from the live namespace:
 *   {{namespace}}      the execution namespace
 *   {{pod:<nodeId>}}   the running pod of a topology node
 *   {{ip:<nodeId>}}    that pod's IP (e.g. the attacker address AI4SOAR blocks)
 * Unresolvable placeholders are left as `<pod:mag>`-style hints.
 */

import type { CoreV1Api } from '@kubernetes/client-node';

/** An observable outcome the console checks off live. */
export interface RunbookExpectation {
  label: string;
  /** `alert`: a security alert event; `log`: a log line matching `pattern`. */
  source: 'alert' | 'log';
  /** Container (log) or reporting container (alert) to match; any if unset. */
  container?: string;
  /** Regular expression the log line / alert text must match. */
  pattern?: string;
}

export interface RunbookStep {
  id: string;
  title: string;
  description?: string;
  /** Attack profile the step's Run button starts (see attackProfiles.ts). */
  profile?: { nodeId: string; name: string };
  /** Resource names whose web interface the step links to. */
  links?: string[];
  /** Copyable shell commands (kubectl, …). */
  commands?: string[];
  expect?: RunbookExpectation[];
}

export interface Runbook {
  steps: RunbookStep[];
}

export interface RunbookContext {
  namespace: string;
  pods: Record<string, { pod: string; ip?: string }>;
}

/** Running pods of the execution keyed by topology node id. */
export async function collectRunbookContext(
  core: CoreV1Api,
  namespace: string
): Promise<RunbookContext> {
  const pods = await core.listNamespacedPod({ namespace });
  const byNode: RunbookContext['pods'] = {};
  for (const pod of pods.items) {
    const nodeId = pod.metadata?.labels?.['secsim.io/node'];
    if (!nodeId || !pod.metadata?.name || pod.metadata.deletionTimestamp) continue;
    if (pod.status?.phase !== 'Running' && byNode[nodeId]) continue;
    byNode[nodeId] = { pod: pod.metadata.name, ip: pod.status?.podIP };
  }
  return { namespace, pods: byNode };
}

/** Resolve `{{…}}` placeholders in one string. */
export function fillPlaceholders(text: string, ctx: RunbookContext): string {
  return text.replace(/\{\{\s*([a-z]+)(?::([a-z0-9-]+))?\s*\}\}/g, (match, key, arg) => {
    if (key === 'namespace') return ctx.namespace;
    if (key === 'pod' && arg) return ctx.pods[arg]?.pod ?? `<pod:${arg}>`;
    if (key === 'ip' && arg) return ctx.pods[arg]?.ip ?? `<ip:${arg}>`;
    return match;
  });
}

/** The runbook with every text field resolved against the execution. */
export function renderRunbook(runbook: Runbook | undefined, ctx: RunbookContext): RunbookStep[] {
  const fill = (s: string) => fillPlaceholders(s, ctx);
  return (runbook?.steps ?? []).map((step) => ({
    ...step,
    title: fill(step.title),
    description: step.description === undefined ? undefined : fill(step.description),
    commands: step.commands?.map(fill),
    expect: step.expect?.map((e) => ({
      ...e,
      label: fill(e.label),
      pattern: e.pattern === undefined ? undefined : fill(e.pattern),
    })),
  }));
}
