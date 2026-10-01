import { describe, test, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Request, Response } from 'express';
import type { KubeConfig } from '@kubernetes/client-node';
import {
  PROXIED_CSP,
  PROXY_LINK_TTL_S,
  proxiedResponseHeaders,
  proxyToService,
  rawProxyRest,
  signProxyPath,
  verifyProxySignature,
} from '../serviceProxy.js';

const target = {
  scenarioId: 'a'.repeat(24),
  executionId: 'b'.repeat(24),
  service: 'ci-sim',
};

function parse(path: string) {
  const [, , , expires, sig] = path.split('/');
  return { expires: Number(expires), sig };
}

describe('service proxy links', () => {
  test('a minted link verifies for its own target until it expires', () => {
    const now = Date.now();
    const path = signProxyPath(target, now);
    expect(path).toMatch(/^\/api\/proxy\/\d+\/[A-Za-z0-9_-]+\/a{24}\/b{24}\/ci-sim\/$/);
    const { expires, sig } = parse(path);
    expect(verifyProxySignature(target, expires, sig, now)).toBe(true);
    expect(verifyProxySignature(target, expires, sig, now + (PROXY_LINK_TTL_S + 1) * 1000)).toBe(
      false
    );
  });

  test('a link does not verify for another service or a tampered expiry', () => {
    const { expires, sig } = parse(signProxyPath(target));
    expect(verifyProxySignature({ ...target, service: 'ai4soar' }, expires, sig)).toBe(false);
    expect(verifyProxySignature(target, expires + 60, sig)).toBe(false);
  });
});

describe('proxied response headers', () => {
  test('replaces the upstream CSP with a sandbox that omits allow-same-origin', () => {
    const headers = proxiedResponseHeaders({
      'content-type': 'text/html',
      'content-security-policy': "default-src 'self'",
      'content-security-policy-report-only': "default-src 'none'",
    });
    expect(headers['content-security-policy']).toBe(PROXIED_CSP);
    expect(PROXIED_CSP).toMatch(/^sandbox /);
    expect(PROXIED_CSP).not.toContain('allow-same-origin');
    expect(headers).not.toHaveProperty('content-security-policy-report-only');
    expect(headers['content-type']).toBe('text/html');
  });

  test('strips upstream Set-Cookie and hop-by-hop headers', () => {
    const headers = proxiedResponseHeaders({
      'set-cookie': ['session=abc; Path=/'],
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'x-app': 'ok',
    });
    expect(headers).not.toHaveProperty('set-cookie');
    expect(headers).not.toHaveProperty('connection');
    expect(headers).not.toHaveProperty('transfer-encoding');
    expect(headers['x-app']).toBe('ok');
  });

  test('proxyToService sends the sandbox CSP and no Set-Cookie to the browser', async () => {
    const upstream = http.createServer((_req, res) => {
      res.setHeader('Set-Cookie', 'session=abc; Path=/');
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('Content-Type', 'text/html');
      res.end('<html>ui</html>');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    const upPort = (upstream.address() as AddressInfo).port;
    const kc = {
      getCurrentCluster: () => ({ server: `http://127.0.0.1:${upPort}` }),
      applyToHTTPSOptions: async () => {},
    } as unknown as KubeConfig;

    const app = express();
    app.use((_req, res, next) => {
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      next();
    });
    app.get('/p', (req, res, next) => {
      proxyToService(kc, 'ns', 'svc', 80, '', req, res).catch(next);
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    try {
      const port = (server.address() as AddressInfo).port;
      const resp = await fetch(`http://127.0.0.1:${port}/p`);
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe('<html>ui</html>');
      expect(resp.headers.get('content-security-policy')).toBe(PROXIED_CSP);
      expect(resp.headers.get('set-cookie')).toBeNull();
    } finally {
      server.closeAllConnections();
      server.close();
      upstream.closeAllConnections();
      upstream.close();
    }
  });
});

describe('proxy path traversal', () => {
  const base = `/proxy/1/s/${'a'.repeat(24)}/${'b'.repeat(24)}/ci-sim`;

  test('keeps a normal path with its percent-encoding intact', () => {
    expect(rawProxyRest(`${base}/static/a%20b.js?x=1`)).toBe('static/a%20b.js');
    expect(rawProxyRest(`${base}/`)).toBe('');
  });

  test.each(['..', '%2e%2e', '%2E.', '.', '%2e'])('rejects the dot segment %s', (seg) => {
    expect(() => rawProxyRest(`${base}/${seg}/api/v1/secrets`)).toThrow(/Invalid proxy path/);
  });

  test('proxyToService refuses a path escaping the service proxy prefix', async () => {
    const kc = {
      getCurrentCluster: () => ({ server: 'http://127.0.0.1:1' }),
      applyToHTTPSOptions: async () => {},
    } as unknown as KubeConfig;
    const req = { headers: {}, method: 'GET' } as unknown as Request;
    await expect(
      proxyToService(kc, 'ns', 'svc', 80, '../../../secrets', req, {} as Response)
    ).rejects.toThrow(/Invalid proxy path/);
  });
});
