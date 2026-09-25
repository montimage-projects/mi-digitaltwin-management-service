import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { Scenario } from '../models/Scenario.js';

/**
 * Prometheus metrics of the SecSim server itself: request rate, error rate
 * and latency of the API (the RED metrics), Node.js process metrics, and the
 * number of live scenario executions. Served at `GET /metrics` in the
 * Prometheus text format for the platform's Prometheus (see
 * k8s/components/observability and the `observability` compose profile).
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'secsim-server' });
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'HTTP requests handled, by method, route and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency, by method, route and status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

new Gauge({
  name: 'secsim_live_executions',
  help: 'Scenario executions whose namespace is still deployed',
  registers: [registry],
  async collect() {
    try {
      const [row] = await Scenario.aggregate<{ count: number }>([
        { $unwind: '$executions' },
        {
          $match: {
            'executions.status': { $ne: 'failed' },
            'executions.completedAt': null,
            'executions.namespace': { $nin: [null, ''] },
          },
        },
        { $count: 'count' },
      ]);
      this.set(row?.count ?? 0);
    } catch {
      // Database unavailable: keep the last value rather than failing the scrape.
    }
  },
});

/**
 * Route template for the `route` label — never the raw URL, which would put
 * ids in label values and grow the series without bound.
 */
export function routeLabel(req: Request): string {
  const path = req.route?.path;
  if (typeof path === 'string') return `${req.baseUrl}${path}`;
  return req.path.startsWith('/api') ? 'unmatched' : 'static';
}

/** Records one observation per finished request. */
export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') return next();
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const labels = {
        method: req.method,
        route: routeLabel(req),
        status_code: String(res.statusCode),
      };
      httpRequests.inc(labels);
      end(labels);
    });
    next();
  };
}

// gitleaks:allow — parameter name, not a credential
function tokenMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * `GET /metrics`. When `token` is set, scrapes must send
 * `Authorization: Bearer <token>`; otherwise the endpoint is open, as is
 * usual for an in-cluster scrape target. It exposes only aggregate counts.
 */
export function metricsHandler(token?: string): RequestHandler {
  return async (req: Request, res: Response) => {
    if (token && !tokenMatches(req.headers.authorization, token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  };
}
