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
  isDeploymentSettled: vi.fn(() => deploy.settled),
}));

const { runSSEStream: stream } = await import('../scenarioSSE.js');

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
  deploy.statuses = [];
  deploy.progress = 0;
  deploy.logs = [];
  deploy.settled = true;
  deploy.statusError = null;
});

describe('runSSEStream', () => {
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
