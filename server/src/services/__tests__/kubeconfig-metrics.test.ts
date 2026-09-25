import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiException, Metrics } from '@kubernetes/client-node';
import { buildKubeConfig } from '../kubernetesDeploy.js';
import { classifyMetricsError } from '../monitoring.js';
import { encrypt } from '../../utils/encryption.js';
import type { IInfrastructure } from '../../models/Infrastructure.js';

/**
 * Real-client checks for `buildKubeConfig` (issue #25).
 *
 * Unlike the rest of the suite, `@kubernetes/client-node` is NOT mocked here:
 * the monitoring dashboard hands this KubeConfig to the library's `Metrics`
 * client, which needs a current context/cluster and reads the bearer token
 * through the config's own authentication. A local HTTP server stands in for
 * the Kubernetes API server so the real request path runs end to end; the
 * library only allows a plain-HTTP server with `skipTLSVerify`, which the
 * request tests therefore set.
 */

interface RecordedRequest {
  url?: string;
  authorization?: string;
}

const requests: RecordedRequest[] = [];
let respond: (res: http.ServerResponse) => void = () => undefined;
let server: http.Server;
let endpoint: string;

function infra(credential: string, overrides: Partial<IInfrastructure> = {}): IInfrastructure {
  return {
    endpoint,
    credentials: encrypt(credential),
    ...overrides,
  } as unknown as IInfrastructure;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    respond(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(() => resolve(undefined)));
});

describe('buildKubeConfig (real @kubernetes/client-node)', () => {
  test('a bearer-token credential yields a current context pointing at the endpoint', () => {
    const kc = buildKubeConfig(infra('a-bearer-token-value', { skipTLSVerify: true }));

    expect(kc.getCurrentContext()).toBe('secsim-context');
    const cluster = kc.getCurrentCluster();
    expect(cluster).not.toBeNull();
    expect(cluster?.server).toBe(endpoint);
    expect(cluster?.skipTLSVerify).toBe(true);
    expect(kc.getCurrentUser()?.token).toBe('a-bearer-token-value');
  });

  test('kubeconfig content keeps its own current context and cluster', () => {
    const kubeconfig = [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      '- name: lab',
      '  cluster:',
      '    server: https://lab.example:6443',
      'users:',
      '- name: lab-user',
      '  user:',
      '    token: lab-token',
      'contexts:',
      '- name: lab-ctx',
      '  context:',
      '    cluster: lab',
      '    user: lab-user',
      'current-context: lab-ctx',
    ].join('\n');

    const kc = buildKubeConfig(infra(kubeconfig));

    expect(kc.getCurrentContext()).toBe('lab-ctx');
    expect(kc.getCurrentCluster()?.server).toBe('https://lab.example:6443');
  });

  test('Metrics reads pod metrics through the built config with the bearer token', async () => {
    requests.length = 0;
    respond = (res) =>
      sendJson(res, 200, {
        kind: 'PodMetricsList',
        apiVersion: 'metrics.k8s.io/v1beta1',
        metadata: {},
        items: [
          {
            metadata: { name: 'web-abc', namespace: 'ns-1', labels: { app: 'web' } },
            timestamp: '2026-09-24T10:00:00Z',
            window: '15s',
            containers: [{ name: 'web', usage: { cpu: '250m', memory: '64Mi' } }],
          },
        ],
      });

    const metrics = new Metrics(
      buildKubeConfig(infra('a-bearer-token-value', { skipTLSVerify: true }))
    );
    const list = await metrics.getPodMetrics('ns-1');

    expect(list.items).toHaveLength(1);
    expect(list.items[0].containers[0].usage.cpu).toBe('250m');
    expect(requests).toEqual([
      {
        url: '/apis/metrics.k8s.io/v1beta1/namespaces/ns-1/pods',
        authorization: 'Bearer a-bearer-token-value',
      },
    ]);
  });

  test('a cluster without metrics-server rejects with the exported ApiException (404)', async () => {
    respond = (res) =>
      sendJson(res, 404, {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        message: 'the server could not find the requested resource',
        reason: 'NotFound',
        code: 404,
      });

    const metrics = new Metrics(
      buildKubeConfig(infra('a-bearer-token-value', { skipTLSVerify: true }))
    );
    const err = await metrics.getPodMetrics('ns-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException<unknown>).code).toBe(404);
    // The dashboard's classifier recognises the error the real client throws.
    expect(classifyMetricsError(err)).toMatch(/metrics-server is not installed/);
  });

  test('an RBAC denial (403) is classified as a missing pods.metrics.k8s.io permission', async () => {
    respond = (res) =>
      sendJson(res, 403, { kind: 'Status', status: 'Failure', reason: 'Forbidden', code: 403 });

    const metrics = new Metrics(
      buildKubeConfig(infra('a-bearer-token-value', { skipTLSVerify: true }))
    );
    const err = await metrics.getPodMetrics('ns-1').catch((e: unknown) => e);

    expect(classifyMetricsError(err)).toMatch(/pods\.metrics\.k8s\.io/);
  });
});
