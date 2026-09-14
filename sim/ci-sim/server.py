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


def source_ip(handler):
    """Client address — X-Forwarded-For wins so the blocklist and the rate
    watcher still see the real source when requests arrive through a proxy or
    a `kubectl port-forward`."""
    forwarded = handler.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
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
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0:
            return None
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, OSError):
            return None

    def log_message(self, fmt, *args):
        log(fmt % args)

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

    def do_POST(self):  # noqa: N802 — stdlib hook name
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
