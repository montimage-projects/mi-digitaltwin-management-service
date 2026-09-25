/**
 * Attack profiles — run a scenario node's seeded `config.profiles` entry in
 * its deployed pod from the web console, instead of a hand-typed
 * `kubectl exec` (issue #233 follow-up).
 *
 * A profile is `{ name, description?, args[] }` stored on the topology node
 * (e.g. MAG's `attack-1-stop-the-server`). Running it execs
 * `sh -c '<args> 2>&1 | tee /proc/1/fd/1'` in the node's container: the tee
 * lands the output in the container log, so it streams into the Execution
 * console like any other log line. Only the stored argv is executed — each
 * argument is single-quoted, the request carries no command text.
 */

import { Writable } from 'node:stream';
import { Exec, type CoreV1Api, type KubeConfig } from '@kubernetes/client-node';
import { AppError } from '../middleware/errorHandler.js';

export interface AttackProfile {
  nodeId: string;
  name: string;
  description?: string;
  args: string[];
}

interface ProfileNode {
  id?: string;
  data?: { config?: { profiles?: unknown } };
}

/** Every well-formed profile carried by the topology's nodes. */
export function listAttackProfiles(nodes: unknown[]): AttackProfile[] {
  return nodes.flatMap((raw) => {
    const node = (raw ?? {}) as ProfileNode;
    const profiles = node.data?.config?.profiles;
    if (!node.id || !Array.isArray(profiles)) return [];
    return profiles.flatMap((p: unknown) => {
      const profile = (p ?? {}) as Partial<AttackProfile>;
      const args = profile.args;
      if (
        typeof profile.name !== 'string' ||
        !Array.isArray(args) ||
        args.length === 0 ||
        !args.every((a) => typeof a === 'string')
      ) {
        return [];
      }
      return [
        {
          nodeId: node.id as string,
          name: profile.name,
          description: typeof profile.description === 'string' ? profile.description : undefined,
          args,
        },
      ];
    });
  });
}

/** A sink for exec output the console already gets from the pod log. */
function discard(): Writable {
  return new Writable({ write: (_chunk, _enc, done) => done() });
}

/** POSIX single-quote one argument for `sh -c`. */
export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The `sh -c` script a profile runs: its argv, output teed into PID 1. */
export function profileScript(args: string[]): string {
  return `${args.map(shellQuote).join(' ')} 2>&1 | tee /proc/1/fd/1`;
}

/**
 * Start a profile in the node's running pod. Resolves once the exec session
 * is open — the attack keeps running in the pod and its output streams
 * through the container log; the result carries the pod and container used.
 */
export async function runAttackProfile(
  kc: KubeConfig,
  core: CoreV1Api,
  namespace: string,
  profile: AttackProfile
): Promise<{ pod: string; container: string }> {
  const pods = await core.listNamespacedPod({
    namespace,
    labelSelector: `secsim.io/node=${profile.nodeId}`,
  });
  const pod = pods.items.find(
    (p) => p.status?.phase === 'Running' && !p.metadata?.deletionTimestamp
  );
  const podName = pod?.metadata?.name;
  // The host container carries the workload name the engine gave the node
  // (its `app` label); sidecars sharing the pod have their own names.
  const container = pod?.metadata?.labels?.app;
  if (!podName || !container) {
    throw new AppError(`No running pod for node "${profile.nodeId}" in ${namespace}`, 409);
  }

  await new Exec(kc).exec(
    namespace,
    podName,
    container,
    ['sh', '-c', profileScript(profile.args)],
    // The API server rejects an exec with no stream attached; the output
    // already reaches the container log through the tee, so drop it here.
    discard(),
    discard(),
    null,
    false
  );
  return { pod: podName, container };
}
