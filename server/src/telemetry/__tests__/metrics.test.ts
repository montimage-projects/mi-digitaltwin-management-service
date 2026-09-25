import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('../../models/Scenario.js', () => ({
  Scenario: { aggregate: vi.fn().mockResolvedValue([{ count: 2 }]) },
}));

const { metricsHandler, metricsMiddleware, registry } = await import('../metrics.js');

let server: Server;
let base: string;
const TOKEN = 'a-metrics-token-of-length';

beforeAll(async () => {
  const app = express();
  app.use(metricsMiddleware());
  app.get('/metrics', metricsHandler());
  app.get('/secure-metrics', metricsHandler(TOKEN));
  const router = express.Router();
  router.get('/items/:id', (_req, res) => {
    res.json({ ok: true });
  });
  router.get('/boom', (_req, res) => {
    res.status(500).json({ error: 'boom' });
  });
  app.use('/api', router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  registry.resetMetrics();
});

describe('server metrics', () => {
  test('labels requests with the route template, not the raw URL', async () => {
    await fetch(`${base}/api/items/abc123`);
    await fetch(`${base}/api/items/def456`);
    await fetch(`${base}/api/boom`);
    await fetch(`${base}/api/nope`);

    const text = await (await fetch(`${base}/metrics`)).text();
    expect(text).toMatch(
      /http_requests_total\{method="GET",route="\/api\/items\/:id",status_code="200",service="secsim-server"\} 2/
    );
    expect(text).toMatch(/route="\/api\/boom",status_code="500"/);
    expect(text).toMatch(/route="unmatched",status_code="404"/);
    expect(text).not.toContain('abc123');
    expect(text).toContain('http_request_duration_seconds_bucket');
    expect(text).toMatch(/secsim_live_executions\{service="secsim-server"\} 2/);
    expect(text).toContain('process_cpu_user_seconds_total');
  });

  test('does not count its own scrapes', async () => {
    const text = await (await fetch(`${base}/metrics`)).text();
    expect(text).not.toContain('route="/metrics"');
  });

  test('requires the bearer token when one is configured', async () => {
    expect((await fetch(`${base}/secure-metrics`)).status).toBe(401);
    expect(
      (await fetch(`${base}/secure-metrics`, { headers: { Authorization: 'Bearer wrong' } })).status
    ).toBe(401);
    const ok = await fetch(`${base}/secure-metrics`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/plain');
  });
});
