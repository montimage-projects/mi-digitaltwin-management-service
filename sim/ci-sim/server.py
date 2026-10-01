#!/usr/bin/env python3
"""CI-SIM — critical-infrastructure HTTP simulation (issue #231, task 5.1).

A small stdlib-only HTTP service standing in for a critical-infrastructure
workload in the Montimage attack → detect → respond demo:

  GET  /                health — 200 JSON (the Deployment `readinessPath`)
  GET  /api/status      service API surface — uptime and request counters
  GET  /api/metrics     per-source request counts inside the rate window
  POST /admin/block     {"address": "<ip>"} — blocklist a source; every later
                        request from it is answered 403 while other sources
                        keep being served
  POST /admin/unblock   {"address": "<ip>"} — remove a blocklist entry
  GET  /admin/blocks    list the blocklisted addresses
  GET  /metrics         Prometheus metrics: http_requests_total and
                        http_request_duration_seconds by method, route and
                        status code (never rate-limited or blocklisted)

Stop behaviour — the demo attack's win condition: when one source sends more
than CI_SIM_RATE_LIMIT requests inside CI_SIM_RATE_WINDOW_S seconds, the
process logs `service stopped` and exits non-zero. Under Kubernetes the
Deployment's `restartPolicy: Always` brings the container straight back while
the monitor sidecar holds the pod network namespace.

Environment: PORT (default 8080), CI_SIM_RATE_LIMIT (50),
CI_SIM_RATE_WINDOW_S (10).
"""

import json
import os
import sys
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', '8080'))
RATE_LIMIT = int(os.environ.get('CI_SIM_RATE_LIMIT', '50'))
RATE_WINDOW_S = float(os.environ.get('CI_SIM_RATE_WINDOW_S', '10'))

STARTED = time.time()


def log(message):
    print(f'[ci-sim] {message}', flush=True)


class State:
    """Shared mutable state, guarded by `lock` (the server is threaded)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.blocked = set()  # blocklisted source addresses
        self.hits = defaultdict(deque)  # source -> deque of request timestamps
        self.served = 0
        self.rejected = 0


STATE = State()


class HttpMetrics:
    """Prometheus exposition of served traffic (issue #25): request counts by
    method, route and status code plus a latency histogram — the series the
    SecSim scenario observability stack scrapes from `GET /metrics`."""

    BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
    ROUTES = ('/', '/api/status', '/api/metrics', '/admin/block', '/admin/unblock', '/admin/blocks')

    def __init__(self):
        self.lock = threading.Lock()
        self.requests = defaultdict(int)  # (method, route, code) -> count
        self.buckets = {}  # (method, route) -> cumulative bucket counts
        self.sums = defaultdict(float)
        self.counts = defaultdict(int)

    @classmethod
    def route(cls, path):
        """Known route or `other` — never the raw path, which would let any
        client create unbounded series."""
        path = path.split('?', 1)[0]
        return path if path in cls.ROUTES else 'other'

    def observe(self, method, path, code, seconds):
        method = method if method in ('GET', 'POST') else 'OTHER'
        key = (method, self.route(path))
        with self.lock:
            self.requests[(*key, str(code))] += 1
            buckets = self.buckets.setdefault(key, [0] * len(self.BUCKETS))
            for i, bound in enumerate(self.BUCKETS):
                if seconds <= bound:
                    buckets[i] += 1
            self.sums[key] += seconds
            self.counts[key] += 1

    def render(self, gauges):
        lines = [
            '# HELP http_requests_total HTTP requests served.',
            '# TYPE http_requests_total counter',
        ]
        with self.lock:
            for (method, route, code), n in sorted(self.requests.items()):
                lines.append(
                    f'http_requests_total{{method="{method}",route="{route}",status_code="{code}"}} {n}'
                )
            lines += [
                '# HELP http_request_duration_seconds HTTP request latency.',
                '# TYPE http_request_duration_seconds histogram',
            ]
            for (method, route), buckets in sorted(self.buckets.items()):
                labels = f'method="{method}",route="{route}"'
                for bound, n in zip(self.BUCKETS, buckets):
                    lines.append(f'http_request_duration_seconds_bucket{{{labels},le="{bound:g}"}} {n}')
                total = self.counts[(method, route)]
                lines.append(f'http_request_duration_seconds_bucket{{{labels},le="+Inf"}} {total}')
                lines.append(f'http_request_duration_seconds_sum{{{labels}}} {self.sums[(method, route)]:.6f}')
                lines.append(f'http_request_duration_seconds_count{{{labels}}} {total}')
        for name, help_text, value in gauges:
            lines += [f'# HELP {name} {help_text}', f'# TYPE {name} gauge', f'{name} {value}']
        return '\n'.join(lines) + '\n'


METRICS = HttpMetrics()


def metric_gauges():
    with STATE.lock:
        blocked = len(STATE.blocked)
    return [('ci_sim_blocked_sources', 'Blocklisted source addresses.', blocked)]


def source_ip(handler):
    """Client address — X-Forwarded-For wins so the blocklist and the rate
    watcher still see the real source when requests arrive through a proxy or
    a `kubectl port-forward`."""
    forwarded = handler.headers.get('X-Forwarded-For')
    if forwarded:
        first = forwarded.split(',')[0].strip()
        if first:
            return first
    return handler.client_address[0]


class CISimHandler(BaseHTTPRequestHandler):
    server_version = 'CI-SIM/1.0'

    # -- plumbing --------------------------------------------------------

    def _json(self, code, payload):
        body = (json.dumps(payload) + '\n').encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body_json(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return None
        if length <= 0:
            return None
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, OSError):
            return None

    def log_message(self, fmt, *args):
        log(fmt % args)

    # -- metrics -------------------------------------------------------------

    def send_response(self, code, message=None):
        self._status = code
        super().send_response(code, message)

    def _timed(self, handle):
        """Serve one request and record it; `/metrics` scrapes are neither
        counted as traffic nor subject to the rate watcher or blocklist."""
        path = self.path.split('?', 1)[0]
        if self.command == 'GET' and path == '/metrics':
            body = METRICS.render(metric_gauges()).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._status = 500
        started = time.perf_counter()
        try:
            handle()
        finally:
            METRICS.observe(self.command, path, self._status, time.perf_counter() - started)

    # -- admission control -------------------------------------------------

    def _admit(self):
        """Record the hit; 403 blocklisted sources; stop the service when one
        source sustains a rate over the threshold."""
        source = source_ip(self)
        now = time.time()
        with STATE.lock:
            hits = STATE.hits[source]
            hits.append(now)
            while hits and hits[0] < now - RATE_WINDOW_S:
                hits.popleft()
            over = len(hits) > RATE_LIMIT
            blocked = source in STATE.blocked
            if blocked:
                STATE.rejected += 1
            else:
                STATE.served += 1

        if over:
            # Log the contract line first — stdout is what `kubectl logs` and
            # the engine's SSE stream ship — then shut the server down; main()
            # exits non-zero so the Deployment restarts the container.
            log(
                f'service stopped — sustained request rate from {source} '
                f'exceeded {RATE_LIMIT} req/{RATE_WINDOW_S:g}s'
            )
            self._json(503, {'error': 'service stopped'})
            # shutdown() must run outside serve_forever's own thread; spawning
            # it lets this handler finish its response first.
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return False
        if blocked:
            self._json(403, {'error': 'forbidden', 'reason': 'source address is blocked'})
            return False
        return True

    # -- routes ------------------------------------------------------------

    def do_GET(self):  # noqa: N802 — stdlib hook name
        self._timed(self._get)

    def do_POST(self):  # noqa: N802 — stdlib hook name
        self._timed(self._post)

    def _get(self):
        if not self._admit():
            return
        path = self.path.split('?', 1)[0]
        if path == '/':
            self._json(200, {'status': 'ok', 'service': 'ci-sim'})
        elif path == '/api/status':
            with STATE.lock:
                payload = {
                    'status': 'ok',
                    'service': 'ci-sim',
                    'uptime_s': round(time.time() - STARTED, 3),
                    'requests_served': STATE.served,
                    'requests_rejected': STATE.rejected,
                    'blocked_sources': len(STATE.blocked),
                }
            self._json(200, payload)
        elif path == '/api/metrics':
            now = time.time()
            with STATE.lock:
                for hits in STATE.hits.values():
                    while hits and hits[0] < now - RATE_WINDOW_S:
                        hits.popleft()
                per_source = {s: len(h) for s, h in STATE.hits.items() if h}
            self._json(
                200,
                {
                    'window_s': RATE_WINDOW_S,
                    'rate_limit': RATE_LIMIT,
                    'sources': per_source,
                },
            )
        elif path == '/admin/blocks':
            with STATE.lock:
                blocks = sorted(STATE.blocked)
            self._json(200, {'blocks': blocks})
        else:
            self._json(404, {'error': 'not found'})

    def _post(self):
        if not self._admit():
            return
        path = self.path.split('?', 1)[0]
        if path not in ('/admin/block', '/admin/unblock'):
            self._json(404, {'error': 'not found'})
            return
        payload = self._body_json()
        address = (payload or {}).get('address')
        if not isinstance(address, str) or not address.strip():
            self._json(
                400,
                {
                    'error': 'bad request',
                    'reason': 'body must be {"address": "<ip>"}',
                },
            )
            return
        address = address.strip()
        with STATE.lock:
            existed = address in STATE.blocked
            if path == '/admin/block':
                STATE.blocked.add(address)
            else:
                STATE.blocked.discard(address)
        if path == '/admin/block':
            if existed:
                log(f'admin: {address} already blocked')
                self._json(200, {'blocked': address, 'already': True})
            else:
                log(f'admin: blocked {address}')
                self._json(201, {'blocked': address})
        elif existed:
            log(f'admin: unblocked {address}')
            self._json(200, {'unblocked': address})
        else:
            self._json(404, {'error': 'not blocked', 'address': address})


def main():
    server = ThreadingHTTPServer(('0.0.0.0', PORT), CISimHandler)
    log(
        f'serving HTTP on :{PORT} '
        f'(rate limit {RATE_LIMIT} req/{RATE_WINDOW_S:g}s per source)'
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    # serve_forever returns when the rate watcher calls shutdown() — the demo
    # attack has stopped the service, so exit non-zero and let the
    # Deployment's restartPolicy: Always bring the container back.
    sys.exit(1)


if __name__ == '__main__':
    main()
