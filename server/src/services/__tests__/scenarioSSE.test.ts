import { describe, test, expect, vi, afterEach } from 'vitest';
import type { Response } from 'express';

/**
 * Unit tests for the scenario SSE service (issue #197 — per-container logs).
 *
 * `../kubernetesDeploy.js` is fully mocked: the service under test is the
 * SSE wiring — which events are emitted and what their payloads carry — not
 * the cluster engine (covered by kubernetesDeploy.test.ts). No MongoDB, no
 * cluster: these tests run everywhere.
 */

const { deploy } = vi.hoisted(() => {
  const deploy = {
    clients: { marker: 'fake-k8s-clients' },
    statuses: [] as { name: string; status: string; containers: unknown[] }[],
    progress: 0,
    logs: [] as { name: string; pod: string; container?: string; line: string }[],
    events: [] as {
      uid?: string;
      reason?: string;
      message?: string;
      objectKind?: string;
      objectName?: string;
      type?: string;
      count?: number;
      timestamp?: string;
    }[],
    settled: true,
    statusError: null as unknown,
  };
  return { deploy };
});

vi.mock('../kubernetesDeploy.js', () => ({
  buildClientFromInfrastructure: vi.fn(() => deploy.clients),
  getDeploymentStatus: vi.fn(async () => {
    if (deploy.statusError) throw deploy.statusError;
    return { statuses: deploy.statuses, progress: deploy.progress };
  }),
  collectNewPodLogs: vi.fn(async () => deploy.logs),
  // Mirrors the real dedup contract: the caller-owned `seen` set is threaded
  // across polls, so an entry is returned only while its `<uid>:<count>` key
  // is new (task 2.3).
  collectNewNamespaceEvents: vi.fn(async (_clients: unknown, opts: { seen: Set<string> }) => {
    const fresh = deploy.events.filter((e) => !opts.seen.has(`${e.uid}:${e.count}`));
    for (const e of fresh) opts.seen.add(`${e.uid}:${e.count}`);
    return fresh;
  }),
  isDeploymentSettled: vi.fn(() => deploy.settled),
}));

const { runSSEStream: stream } = await import('../scenarioSSE.js');
const kube = await import('../kubernetesDeploy.js');
const getDeploymentStatusCalls = () => vi.mocked(kube.getDeploymentStatus).mock.calls.length;

/** Minimal express Response double — the service only writes events + ends. */
function makeResponse() {
  return {
    writes: [] as string[],
    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    },
    end: vi.fn(),
  };
}

function textOf(res: ReturnType<typeof makeResponse>): string {
  return res.writes.join('');
}

const infra = {
  endpoint: 'https://10.0.0.1:6443',
  credentials: { iv: 'i', encrypted: 'e', authTag: 'a' },
};
const runningExecution = {
  status: 'running',
  namespace: 'secsim-scn-exec',
  deployedServices: [{ name: 'http-sim' }],
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  deploy.statuses = [];
  deploy.progress = 0;
  deploy.logs = [];
  deploy.events = [];
  deploy.settled = true;
  deploy.statusError = null;
});

describe('runSSEStream', () => {
  test('a failed background deploy surfaces as an error event', async () => {
    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      { ...runningExecution, status: 'pending' },
      infra,
      async () => ({ status: 'failed' })
    );
    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();
    expect(textOf(res)).toContain('event: error');
    expect(textOf(res)).toContain('Deployment failed');
  });

  test('cluster read errors are ignored while the rollout is still pending', async () => {
    vi.useFakeTimers();
    deploy.statusError = new Error('namespaces "secsim-scn-exec" not found');
    deploy.settled = false;
    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      { ...runningExecution, status: 'pending' },
      infra,
      async () => ({ status: 'pending' })
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(textOf(res)).not.toContain('event: error');
    expect(res.end).not.toHaveBeenCalled();
    cleanup();
  });

  test('a settled (completed) execution still deployed keeps streaming', async () => {
    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      { ...runningExecution, status: 'completed' },
      infra
    );
    await vi.waitFor(() => expect(textOf(res)).toContain('event: progress'));
    expect(getDeploymentStatusCalls()).toBeGreaterThan(0);
    cleanup();
  });

  test('a terminal execution emits one snapshot then closes', async () => {
    const res = makeResponse();
    const cleanup = stream(res as unknown as Response, {}, { status: 'failed' }, infra);
    expect(textOf(res)).toContain('event: progress');
    expect(textOf(res)).toContain('event: end');
    expect(res.end).toHaveBeenCalled();
    cleanup();
  });

  test('a running execution polls, forwards progress and ends on settle', async () => {
    deploy.statuses = [
      {
        name: 'http-sim',
        status: 'running',
        containers: [{ name: 'http-sim', status: 'running' }],
      },
    ];
    deploy.progress = 100;
    deploy.logs = [
      { name: 'http-sim', pod: 'http-sim-pod', container: 'http-sim', line: 'GET / 200' },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    // The immediate poll is async — wait for the end marker before asserting.
    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('event: progress');
    expect(text).toContain('"progress":100');
    expect(text).toContain('"name":"http-sim"');
    expect(text).toContain('"status":"running"');
    // The per-container status breakdown rides the progress payload (#196).
    expect(text).toContain('"containers":[{"name":"http-sim","status":"running"}]');
    expect(text).toContain('event: end');
  });

  test('log events carry the container name (issue #197)', async () => {
    deploy.statuses = [
      {
        name: 'http-sim',
        status: 'running',
        containers: [
          { name: 'http-sim', status: 'running' },
          { name: 'mmt-probe', status: 'running' },
        ],
      },
    ];
    deploy.logs = [
      { name: 'http-sim', pod: 'http-sim-pod', container: 'http-sim', line: 'GET / 200' },
      {
        name: 'http-sim',
        pod: 'http-sim-pod',
        container: 'mmt-probe',
        line: 'ALERT syn-flood',
      },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain(
      '"service":"http-sim","pod":"http-sim-pod","container":"http-sim","line":"GET / 200"'
    );
    expect(text).toContain(
      '"service":"http-sim","pod":"http-sim-pod","container":"mmt-probe","line":"ALERT syn-flood"'
    );
  });

  test('namespace events are emitted as k8s-event records (issue #198)', async () => {
    deploy.events = [
      {
        uid: 'evt-1',
        reason: 'Killing',
        message: 'Killing container http-sim in pod http-sim-pod',
        objectKind: 'Pod',
        objectName: 'http-sim-pod',
        type: 'Normal',
        count: 1,
        timestamp: '2026-09-07T10:00:00.000Z',
      },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('event: k8s-event');
    expect(text).toContain(
      '"reason":"Killing","message":"Killing container http-sim in pod http-sim-pod","objectKind":"Pod","objectName":"http-sim-pod"'
    );
    expect(text).toContain('"type":"Normal","count":1');
  });

  test('k8s events are deduplicated across polling iterations (issue #198)', async () => {
    vi.useFakeTimers();
    try {
      deploy.settled = false; // keep the stream polling past the first tick
      deploy.events = [
        {
          uid: 'evt-1',
          reason: 'Scheduled',
          message: 'Successfully assigned http-sim-pod',
          objectKind: 'Pod',
          objectName: 'http-sim-pod',
          type: 'Normal',
          count: 1,
          timestamp: '2026-09-07T10:00:00.000Z',
        },
      ];

      const res = makeResponse();
      const cleanup = stream(
        res as unknown as Response,
        { infrastructureId: 'infra' },
        runningExecution,
        infra
      );
      const occurrences = (text: string) => text.split('event: k8s-event').length - 1;

      // First (immediate) poll surfaces the event once.
      await vi.advanceTimersByTimeAsync(0);
      expect(occurrences(textOf(res))).toBe(1);

      // A second poll over the same event list must not replay it.
      await vi.advanceTimersByTimeAsync(2000);
      expect(occurrences(textOf(res))).toBe(1);

      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a probe JSON security report is emitted as a typed alert event (issue #234)', async () => {
    deploy.logs = [
      {
        name: 'http-sim',
        pod: 'http-sim-pod',
        container: 'mmt-probe',
        line: JSON.stringify({
          'ip.src': '10.0.0.9',
          verdict: 'http-flood',
          timestamp: '2026-09-14T10:00:00Z',
        }),
      },
      { name: 'http-sim', pod: 'http-sim-pod', container: 'mmt-probe', line: 'probe up on eth0' },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('event: alert');
    // The typed record carries the fields the console + playbook consume:
    // attacker (ip.src), verdict, report timestamp and the source line.
    expect(text).toContain('"attacker":"10.0.0.9"');
    expect(text).toContain('"verdict":"http-flood"');
    expect(text).toContain('"timestamp":"2026-09-14T10:00:00.000Z"');
    expect(text).toContain('"container":"mmt-probe"');
    // The ordinary log line did not raise a second alert.
    expect(text.split('event: alert').length - 1).toBe(1);
  });

  test('an mmt attribute-array report surfaces ip.src as the attacker (issue #234)', async () => {
    deploy.logs = [
      {
        name: 'http-sim',
        pod: 'http-sim-pod',
        container: 'mmt-probe',
        line: JSON.stringify({
          verdict: 'syn-flood',
          properties: [
            { att: 'ip.src', val: '192.168.10.20' },
            { att: 'ip.dst', val: '10.0.0.5' },
          ],
        }),
      },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('"attacker":"192.168.10.20"');
    expect(text).toContain('"verdict":"syn-flood"');
  });

  test('secAnoD mmt-security array reports become throttled alert events', async () => {
    const report = (ts: number) =>
      JSON.stringify([
        10,
        3,
        'eth0',
        ts,
        56,
        'detected',
        'attack',
        'Probable SYN flooding attack',
        {
          event_1: {
            attributes: [
              ['ip.src', '10.244.0.7'],
              ['ip.dst', '10.244.0.5'],
            ],
          },
        },
      ]);
    deploy.logs = [1, 2, 3].map((i) => ({
      name: 'ci-sim',
      pod: 'ci-sim-pod',
      container: 'secanod',
      line: report(1790284285 + i),
    }));

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('"attacker":"10.244.0.7"');
    expect(text).toContain('"verdict":"rule 56: Probable SYN flooding attack"');
    // Three identical detections in one poll collapse into one alert event.
    expect(text.match(/event: alert/g)).toHaveLength(1);
  });

  test('a plain-text ALERT line emits an alert event with the text as verdict', async () => {
    deploy.logs = [
      {
        name: 'http-sim',
        pod: 'http-sim-pod',
        container: 'mmt-probe',
        line: 'ALERT http-flood suspected: 12 connections to :8080 on interface eth0',
      },
      { name: 'http-sim', pod: 'http-sim-pod', container: 'http-sim', line: 'GET / 200' },
    ];

    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('event: alert');
    expect(text).toContain(
      '"verdict":"http-flood suspected: 12 connections to :8080 on interface eth0"'
    );
    // Only the ALERT line produced an alert — and it still flows as a log.
    expect(text.split('event: alert').length - 1).toBe(1);
    expect(text).toContain('"line":"GET / 200"');
  });

  test('a terminal execution keeps streaming after deploy settle (issue #233)', async () => {
    vi.useFakeTimers();
    try {
      deploy.settled = true;
      const terminalExecution = {
        status: 'running',
        namespace: 'secsim-scn-exec',
        deployedServices: [{ name: 'mag', uiType: 'terminal' }],
      };

      const res = makeResponse();
      const cleanup = stream(
        res as unknown as Response,
        { infrastructureId: 'infra' },
        terminalExecution,
        infra
      );

      // First poll: deployment settles → `end` is emitted but the response
      // stays open so shell-driven output keeps flowing.
      await vi.advanceTimersByTimeAsync(0);
      expect(textOf(res)).toContain('event: end');
      expect(res.end).not.toHaveBeenCalled();

      // A `kubectl exec`-driven attack line arriving post-settle still
      // reaches the console, and `end` is not re-emitted.
      deploy.logs = [
        {
          name: 'mag',
          pod: 'mag-pod',
          container: 'mag',
          line: 'http-flood → http://http-sim:8080/',
        },
      ];
      await vi.advanceTimersByTimeAsync(2000);
      const text = textOf(res);
      expect(text).toContain('http-flood → http://http-sim:8080/');
      expect(text.split('event: end').length - 1).toBe(1);
      expect(res.end).not.toHaveBeenCalled();

      cleanup();
      expect(res.end).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a cluster read error emits an error event and closes', async () => {
    deploy.statusError = new Error('etcd unavailable');
    const res = makeResponse();
    const cleanup = stream(
      res as unknown as Response,
      { infrastructureId: 'infra' },
      runningExecution,
      infra
    );

    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    cleanup();

    const text = textOf(res);
    expect(text).toContain('event: error');
    expect(text).toContain('etcd unavailable');
    expect(text).not.toContain('event: end');
  });
});
