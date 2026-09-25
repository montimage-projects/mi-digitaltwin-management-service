/**
 * Web-interface proxy for deployed scenario services.
 *
 * A NodePort URL (`http://<cluster-host>:<nodePort>`) is only reachable when
 * the cluster's nodes are — not the case for kind/Docker Desktop, where the
 * node ports never reach the host. Instead the server relays the browser to
 * the Service through the Kubernetes API server's service proxy
 * (`/api/v1/namespaces/<ns>/services/<name>:<port>/proxy/…`), which works on
 * any cluster the platform can already manage.
 *
 * A new browser tab cannot carry the SPA's bearer token, so the console
 * first asks for a short-lived signed link; the signature (HMAC over
 * scenario, execution, service and expiry) lives in the path so the proxied
 * app's relative links keep working.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import type { Request, Response } from 'express';
import type { KubeConfig } from '@kubernetes/client-node';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

/** How long a minted proxy link stays valid. */
export const PROXY_LINK_TTL_S = 12 * 60 * 60;

export interface ProxyTarget {
  scenarioId: string;
  executionId: string;
  service: string;
}

function signature(target: ProxyTarget, expires: number): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`proxy|${target.scenarioId}|${target.executionId}|${target.service}|${expires}`)
    .digest('base64url');
}

/** Path prefix of a signed proxy link, valid for PROXY_LINK_TTL_S. */
export function signProxyPath(target: ProxyTarget, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + PROXY_LINK_TTL_S;
  const sig = signature(target, expires);
  return `/api/proxy/${expires}/${sig}/${target.scenarioId}/${target.executionId}/${target.service}/`;
}

/** Whether a link's signature matches and it has not expired. */
export function verifyProxySignature(
  target: ProxyTarget,
  expires: number,
  sig: string,
  now = Date.now()
): boolean {
  if (!Number.isInteger(expires) || expires < now / 1000) return false;
  const expected = Buffer.from(signature(target, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Hop-by-hop / origin-specific headers never forwarded upstream. */
const DROP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'authorization',
  'cookie',
  'content-length',
  'accept-encoding',
]);

/**
 * CSP set on every proxied response. The proxied UI is served from the
 * platform origin, where the SPA keeps its JWT in localStorage; the sandbox
 * (deliberately without `allow-same-origin`) gives the document an opaque
 * origin, so its scripts still run but cannot read the platform's storage or
 * cookies, nor call the API with the admin's credentials.
 */
export const PROXIED_CSP = 'sandbox allow-scripts allow-forms allow-popups';

/**
 * Upstream response headers never relayed: hop-by-hop headers, the proxied
 * app's own CSP (replaced by PROXIED_CSP) and Set-Cookie (it would land on
 * the platform origin).
 */
const DROP_RESPONSE_HEADERS = new Set([
  'connection',
  'transfer-encoding',
  'set-cookie',
  'content-security-policy',
  'content-security-policy-report-only',
]);

/** Response headers to send for a proxied upstream response. */
export function proxiedResponseHeaders(
  upstream: IncomingHttpHeaders
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(upstream)) {
    if (value !== undefined && !DROP_RESPONSE_HEADERS.has(key.toLowerCase())) out[key] = value;
  }
  out['content-security-policy'] = PROXIED_CSP;
  return out;
}

/**
 * Relay one request to `<service>:<port>` through the API server's service
 * proxy, streaming the response back. `path` is the part after the signed
 * prefix (no leading slash) plus the original query string.
 */
/**
 * Trailing upstream path taken from the raw, still-encoded request URL
 * (relative to the router, e.g. `/proxy/<exp>/<sig>/<id>/<exec>/<name>/rest`),
 * so legitimate percent-encoding is preserved. Rejects any segment that
 * decodes to `.` or `..`, which could escape the service proxy prefix.
 */
export function rawProxyRest(url: string, prefixSegments = 7): string {
  const pathname = url.split('?')[0];
  const rest = pathname.split('/').slice(prefixSegments);
  for (const segment of rest) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new AppError('Invalid proxy path', 400);
    }
    if (decoded === '.' || decoded === '..') throw new AppError('Invalid proxy path', 400);
  }
  return rest.join('/');
}

export async function proxyToService(
  kc: KubeConfig,
  namespace: string,
  service: string,
  port: number,
  path: string,
  req: Request,
  res: Response
): Promise<void> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error('No cluster in kubeconfig');
  const base = new URL(cluster.server);
  const upstreamPath =
    `${base.pathname.replace(/\/$/, '')}/api/v1/namespaces/${encodeURIComponent(namespace)}` +
    `/services/${encodeURIComponent(service)}:${port}/proxy/${path}`;
  // Defense in depth: the normalized path must stay under this service's proxy.
  const prefix = upstreamPath.slice(0, upstreamPath.length - path.length);
  if (!new URL(upstreamPath, base).pathname.startsWith(prefix)) {
    throw new AppError('Invalid proxy path', 400);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!DROP_REQUEST_HEADERS.has(key) && typeof value === 'string') headers[key] = value;
  }
  // express.json() has already consumed a JSON body — re-serialize it.
  const body =
    req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
      ? Buffer.from(JSON.stringify(req.body))
      : undefined;
  if (body) headers['content-length'] = String(body.length);

  const options: https.RequestOptions = {
    method: req.method,
    hostname: base.hostname,
    port: base.port || (base.protocol === 'https:' ? 443 : 80),
    path: upstreamPath,
    headers,
  };
  // Cluster CA, client certs and bearer token from the kubeconfig.
  await kc.applyToHTTPSOptions(options);

  await new Promise<void>((resolve, reject) => {
    const transport = base.protocol === 'https:' ? https : http;
    const upstream = transport.request(options, (up) => {
      // Replace the platform's CSP (it would block the proxied app's
      // scripts/styles) with a sandboxing one — see PROXIED_CSP.
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('Content-Security-Policy-Report-Only');
      res.status(up.statusCode ?? 502);
      for (const [key, value] of Object.entries(proxiedResponseHeaders(up.headers))) {
        res.setHeader(key, value);
      }
      up.pipe(res);
      up.on('end', resolve);
      up.on('error', reject);
    });
    upstream.on('error', reject);
    if (body) upstream.end(body);
    else req.pipe(upstream);
  });
}
