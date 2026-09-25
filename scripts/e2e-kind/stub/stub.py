#!/usr/bin/env python3
"""E2E stub workload for the kind-based CI test (issue #206).

The Montimage scenario images live in the private `registry.montimage.eu`
registry, which does not resolve outside Montimage's network, and the deploy
engine does not attach `imagePullSecrets` — so CI cannot pull them. This stub
image substitutes for the four modules (`mag`, `ci-sim`, `mmt-probe`,
`ai4soar`) while preserving the *semantics* the end-to-end test asserts for
the R1 two-attack script (issue #237):

  target   (ci-sim)     — mirrors sim/ci-sim/server.py (issue #231): health
                          on GET /, a small /api surface, and the
                          /admin/block|unblock|blocks blocklist, Prometheus
                          GET /metrics; a sustained
                          request rate from one source over CI_SIM_RATE_LIMIT
                          per CI_SIM_RATE_WINDOW_S logs 'service stopped' and
                          exits non-zero so the Deployment restarts it. The
                          blocklist persists to the shared mmt-reports
                          emptyDir so it survives that restart.
  monitor  (mmt-probe)  — watches the shared pod network namespace via
                          /proc/net/tcp and raises an alert when connection
                          volume to :8080 spikes (the flood signature),
                          reporting the attacker source address as `ip.src`
                          (the typed-alert contract from issue #234) to the
                          reaction module — standing in for MMT-Probe's
                          security output channel.
  reaction (ai4soar)    — serves GET /health on :5000 (readiness) and applies
                          the seeded playbook response on alert (issue #235),
                          taking alerts from POST /api/alerts or — with
                          KAFKA_BOOTSTRAP_SERVERS set — from secAnoD's reports
                          on the Kafka topic KAFKA_TOPIC:
                          POST the reported attacker address to the acts-on
                          target's /admin/block endpoint — an
                          application-level block, so the attacker's traffic
                          stays visible to the probe for attack #2's alert.
  attack   (mag)        — the mag workload is a Deployment whose seeded
                          `command` idles (`sleep` loop, issue #233), so the
                          stub's entrypoint never runs there; run-e2e.js
                          drives each attack with `kubectl exec` invoking the
                          `/usr/local/bin/mag` shim (→ this script) through
                          `tee /proc/1/fd/1` so the output also lands in the
                          pod's container log — floods --target-ip:--target-port
                          with HTTP requests, then exits 0. Requests answered
                          403 by the blocklist count as reaching the target —
                          the response proves they arrived.

The role comes from the STUB_ROLE env var (injected per service by
run-e2e.js and inherited by `kubectl exec` processes); the `mag …` argv
fallback keeps the exec-driven attack working even without it.
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TARGET_PORT_HEX = format(8080, '04X').upper()  # :1F90 in /proc/net/tcp
ALERT_THRESHOLD = 8  # concurrent/recent connections to :8080 that read as a flood
ALERT_RESEND_S = 15  # re-emit the alert while the flood signature persists
TARGET_PORT = int(os.environ.get('PORT', '8080'))
RATE_LIMIT = int(os.environ.get('CI_SIM_RATE_LIMIT', '50'))
RATE_WINDOW_S = float(os.environ.get('CI_SIM_RATE_WINDOW_S', '10'))
# The mmt-reports emptyDir the engine shares with the host container survives
# the crash-on-attack container restart — persisting the blocklist there keeps
# the block effective when attack #2 runs.
BLOCKLIST_FILE = os.environ.get(
    'CI_SIM_BLOCKLIST_FILE', '/opt/mmt/probe/result/report/ci-sim-blocklist.json'
)
BLOCK_TARGET_URL = os.environ.get('BLOCK_TARGET_URL', 'http://ci-sim:8080')
BLOCK_RETRY_S = 90  # the block POST retries while the target is mid-restart


def log(role, message):
    print(f'[stub:{role}] {message}', flush=True)


def role():
    """STUB_ROLE env wins; fall back to the seeded MAG args (`mag …`)."""
    env_role = os.environ.get('STUB_ROLE', '').strip().lower()
    if env_role:
        return env_role
    return 'attack' if 'mag' in sys.argv[1:] else 'target'


# ---------------------------------------------------------------------------
# target — ci-sim substitute (mirrors sim/ci-sim/server.py, issue #231)
# ---------------------------------------------------------------------------


class TargetState:
    """Shared mutable state, guarded by `lock` (the server is threaded)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.blocked = set()
        self.hits = defaultdict(deque)  # source -> deque of request timestamps
        self.served = 0
        self.rejected = 0


TARGET_STATE = TargetState()
TARGET_STARTED = time.time()


def load_blocklist():
    """Reload the persisted blocklist — survives the crash-restart because the
    file lives on the pod's shared emptyDir, not the container layer."""
    try:
        with open(BLOCKLIST_FILE, 'r', encoding='utf-8') as handle:
            entries = json.load(handle)
        return {str(e) for e in entries if str(e).strip()}
    except (OSError, ValueError):
        return set()


def save_blocklist(blocked):
    try:
        os.makedirs(os.path.dirname(BLOCKLIST_FILE), exist_ok=True)
        with open(BLOCKLIST_FILE, 'w', encoding='utf-8') as handle:
            json.dump(sorted(blocked), handle)
    except OSError as exc:
        log('target', f'blocklist persist failed: {exc}')


def source_ip(handler):
    """Client address — X-Forwarded-For wins so the blocklist and the rate
    watcher still see the real source when requests arrive through a proxy."""
    forwarded = handler.headers.get('X-Forwarded-For')
    if forwarded:
        first = forwarded.split(',')[0].strip()
        if first:
            return first
    return handler.client_address[0]


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
    with TARGET_STATE.lock:
        blocked = len(TARGET_STATE.blocked)
    return [('ci_sim_blocked_sources', 'Blocklisted source addresses.', blocked)]


def run_target():
    with TARGET_STATE.lock:
        TARGET_STATE.blocked |= load_blocklist()

    class Handler(BaseHTTPRequestHandler):
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

        def _admit(self):
            """Record the hit; 403 blocklisted sources; stop the service when
            one source sustains a rate over the threshold (crash-on-attack)."""
            source = source_ip(self)
            now = time.time()
            with TARGET_STATE.lock:
                hits = TARGET_STATE.hits[source]
                hits.append(now)
                while hits and hits[0] < now - RATE_WINDOW_S:
                    hits.popleft()
                over = len(hits) > RATE_LIMIT
                blocked = source in TARGET_STATE.blocked
                if blocked:
                    TARGET_STATE.rejected += 1
                else:
                    TARGET_STATE.served += 1

            if over:
                # Log the contract line first — stdout is what `kubectl logs`
                # and the engine's SSE stream ship — then shut the server
                # down so the process exits non-zero below and the
                # Deployment's restartPolicy: Always brings it back.
                log(
                    'target',
                    f'service stopped — sustained request rate from {source} '
                    f'exceeded {RATE_LIMIT} req/{RATE_WINDOW_S:g}s',
                )
                self._json(503, {'error': 'service stopped'})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return False
            if blocked:
                self._json(
                    403, {'error': 'forbidden', 'reason': 'source address is blocked'}
                )
                return False
            return True

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
                with TARGET_STATE.lock:
                    payload = {
                        'status': 'ok',
                        'service': 'ci-sim',
                        'uptime_s': round(time.time() - TARGET_STARTED, 3),
                        'requests_served': TARGET_STATE.served,
                        'requests_rejected': TARGET_STATE.rejected,
                        'blocked_sources': len(TARGET_STATE.blocked),
                    }
                self._json(200, payload)
            elif path == '/api/metrics':
                now = time.time()
                with TARGET_STATE.lock:
                    for hits in TARGET_STATE.hits.values():
                        while hits and hits[0] < now - RATE_WINDOW_S:
                            hits.popleft()
                    per_source = {s: len(h) for s, h in TARGET_STATE.hits.items() if h}
                self._json(
                    200,
                    {
                        'window_s': RATE_WINDOW_S,
                        'rate_limit': RATE_LIMIT,
                        'sources': per_source,
                    },
                )
            elif path == '/admin/blocks':
                with TARGET_STATE.lock:
                    blocks = sorted(TARGET_STATE.blocked)
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
            # The seeded playbook posts {"ip": "<attacker>"} (#235) while the
            # CI-SIM contract reads {"address": "<ip>"} (#231) — accept both.
            address = (payload or {}).get('address') or (payload or {}).get('ip')
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
            with TARGET_STATE.lock:
                existed = address in TARGET_STATE.blocked
                if path == '/admin/block':
                    TARGET_STATE.blocked.add(address)
                else:
                    TARGET_STATE.blocked.discard(address)
                save_blocklist(TARGET_STATE.blocked)
            if path == '/admin/block':
                if existed:
                    log('target', f'admin: {address} already blocked')
                    self._json(200, {'blocked': address, 'already': True})
                else:
                    log('target', f'admin: blocked {address}')
                    self._json(201, {'blocked': address})
            elif existed:
                log('target', f'admin: unblocked {address}')
                self._json(200, {'unblocked': address})
            else:
                self._json(404, {'error': 'not blocked', 'address': address})

        def log_message(self, fmt, *args):
            log('target', fmt % args)

    server = ThreadingHTTPServer(('0.0.0.0', TARGET_PORT), Handler)
    log(
        'target',
        f'serving HTTP on :{TARGET_PORT} (rate limit {RATE_LIMIT} '
        f'req/{RATE_WINDOW_S:g}s per source)',
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
    # serve_forever returns when the rate watcher calls shutdown() — the demo
    # attack has stopped the service, so exit non-zero and let the
    # Deployment's restartPolicy: Always bring the container back.
    sys.exit(1)


# ---------------------------------------------------------------------------
# monitor — mmt-probe substitute
# ---------------------------------------------------------------------------


def decode_remote(hex_address):
    """Decode a /proc/net/tcp{,6} remote address to a dotted IP, or None.

    IPv4 entries are little-endian hex (0100007F = 127.0.0.1). tcp6 stores
    four little-endian 32-bit words; only v4-mapped addresses decode — the
    kind cluster is IPv4, so other v6 remotes are counted but never reported
    as the attacker.
    """
    addr = hex_address.split(':', 1)[0]
    try:
        raw = bytes.fromhex(addr)
    except ValueError:
        return None
    if len(raw) == 4:
        ip = '.'.join(str(b) for b in raw[::-1])
    elif len(raw) == 16:
        full = b''.join(raw[i : i + 4][::-1] for i in range(0, 16, 4))
        if full[:12] != b'\x00' * 10 + b'\xff\xff':
            return None
        ip = '.'.join(str(b) for b in full[12:])
    else:
        return None
    if ip == '0.0.0.0' or ip.startswith('127.'):
        return None
    return ip


def target_traffic():
    """(count, {remote_ip: hits}) for sockets whose local port is 8080.

    The sidecar shares the target's network namespace, so /proc/net/tcp shows
    the listener plus every ESTABLISHED/TIME_WAIT socket the attack creates.
    TIME_WAIT entries linger ~60 s, so even a short flood stays visible.
    """
    count = 0
    remotes = {}
    for table in ('/proc/net/tcp', '/proc/net/tcp6'):
        try:
            with open(table, 'r', encoding='ascii') as handle:
                next(handle)  # header
                for line in handle:
                    parts = line.split()
                    if len(parts) > 2 and parts[1].endswith(f':{TARGET_PORT_HEX}'):
                        count += 1
                        remote = decode_remote(parts[2])
                        if remote:
                            remotes[remote] = remotes.get(remote, 0) + 1
        except OSError:
            continue
    return count, remotes


def post_alert(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status
    except Exception as exc:  # alert delivery is retried on the next cycle
        log('monitor', f'alert delivery to {url} failed: {exc}')
        return None


def run_monitor():
    alert_url = os.environ.get('MMT_ALERT_URL', 'http://ai4soar:5000')
    report_dir = '/opt/mmt/probe/result/report'
    iface = os.environ.get('HOST_INTERFACE', 'eth0')
    log('monitor', f'capturing on {iface} (pod netns), alerting to {alert_url}/api/alerts')
    last_alert = 0.0
    while True:
        count, remotes = target_traffic()
        if count >= ALERT_THRESHOLD and time.time() - last_alert >= ALERT_RESEND_S:
            last_alert = time.time()
            attacker = max(remotes, key=remotes.get) if remotes else None
            message = (
                f'ALERT http-flood suspected: {count} connections to :8080 '
                f'on interface {iface}'
            )
            # One JSON report line is both contracts at once: the `alert`
            # field keeps the ALERT text the log grep matches, and `ip.src`
            # is the typed attacker address the SSE alert event (#234) and
            # the AI4SOAR playbook (#235) consume.
            report = {
                'alert': message,
                'ip.src': attacker,
                'ip_src': attacker,
                'source': 'mmt-probe',
                'connections': count,
                'timestamp': last_alert,
            }
            # stdout is what the engine ships as `log`/`alert` SSE events and
            # what `kubectl logs -c mmt-probe` reads — the e2e asserts on it.
            print(json.dumps(report), flush=True)
            try:
                os.makedirs(report_dir, exist_ok=True)
                with open(
                    os.path.join(report_dir, f'alert-{int(last_alert)}.txt'),
                    'w',
                    encoding='utf-8',
                ) as handle:
                    handle.write(json.dumps(report) + '\n')
            except OSError as exc:
                log('monitor', f'report write failed: {exc}')
            post_alert(f'{alert_url}/api/alerts', report)
        time.sleep(1)


# ---------------------------------------------------------------------------
# reaction — ai4soar substitute (seeded playbook, issue #235)
# ---------------------------------------------------------------------------

ATTACKER_KEYS = ('ip.src', 'ip_src', 'src', 'attacker', 'source_ip', 'src_ip')


def attacker_of(payload):
    """The alert's attacker source address — `ip.src` and its spellings, plus
    a nested {"ip": {"src": …}} for safety."""
    if not isinstance(payload, dict):
        return None
    for key in ATTACKER_KEYS:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    nested = payload.get('ip')
    if isinstance(nested, dict):
        value = nested.get('src')
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def block_attacker(address):
    """POST {"address": <ip>} to the acts-on target's /admin/block.

    Retries while the target is mid-restart — the attack that triggered the
    alert also stops the service, so the first attempts may hit a refused or
    503 target; a definitive 4xx answer (never expected here) ends it early.
    """
    request_body = json.dumps({'address': address}).encode()
    deadline = time.time() + BLOCK_RETRY_S
    attempts = 0
    while True:
        attempts += 1
        request = urllib.request.Request(
            f'{BLOCK_TARGET_URL}/admin/block',
            data=request_body,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return (
                    f'blocked {address} at {BLOCK_TARGET_URL} '
                    f'(HTTP {response.status}, attempt {attempts})'
                )
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 502, 503) or time.time() >= deadline:
                return f'block {address} at {BLOCK_TARGET_URL} → HTTP {exc.code}'
        except Exception as exc:
            if time.time() >= deadline:
                return f'block {address} at {BLOCK_TARGET_URL} failed: {exc}'
        time.sleep(5)



def mmt_report_attacker(report):
    """Attacker address of an mmt-security JSON report — the array
    [10, probe, iface, ts, rule, verdict, type, description, events] whose
    events.event_1.attributes carries ["ip.src", <addr>]."""
    if not (isinstance(report, list) and len(report) >= 9 and report[0] == 10):
        return None
    if report[5] not in ('detected', 'not_respected'):
        return None
    first = report[8].get('event_1') if isinstance(report[8], dict) else None
    for pair in (first or {}).get('attributes', []):
        if isinstance(pair, list) and len(pair) == 2 and pair[0] in ('ip.src', 'ipv6.src'):
            return str(pair[1])
    return None


def run_kafka_consumer(bootstrap, topic):
    """Consume secAnoD's security reports from Kafka (the seeded playbook's
    `source: kafka:mmt-security-alerts`). mmt-security reports every matching
    packet, so a source is acted on only once it crosses a flood signature
    (KAFKA_ALERT_MIN_REPORTS reports within KAFKA_ALERT_WINDOW_S) — sparse
    traffic such as kubelet readiness probes never gets blocked — and at most
    once per KAFKA_ALERT_RESEND_S."""
    from kafka import KafkaConsumer  # installed in the stub image

    min_reports = int(os.environ.get('KAFKA_ALERT_MIN_REPORTS', '10'))
    window_s = float(os.environ.get('KAFKA_ALERT_WINDOW_S', '10'))
    resend_s = float(os.environ.get('KAFKA_ALERT_RESEND_S', '5'))
    recent, last_acted = {}, {}
    while True:
        try:
            # earliest + a short metadata refresh: the topic is auto-created by
            # the first report, possibly before this consumer is assigned it —
            # those early reports must not be skipped.
            consumer = KafkaConsumer(
                topic, bootstrap_servers=bootstrap, auto_offset_reset='earliest',
                group_id='ai4soar', metadata_max_age_ms=5000,
            )
            break
        except Exception as exc:  # broker still starting
            log('reaction', f'kafka {bootstrap} not ready: {exc}')
            time.sleep(3)
    log('reaction', f'consuming kafka {bootstrap} topic {topic}')
    for message in consumer:
        try:
            report = json.loads(message.value)
        except ValueError:
            continue
        attacker = mmt_report_attacker(report)
        if not attacker:
            continue
        now = time.time()
        hits = [t for t in recent.get(attacker, []) if now - t < window_s] + [now]
        recent[attacker] = hits
        if len(hits) < min_reports or now - last_acted.get(attacker, 0) < resend_s:
            continue
        last_acted[attacker] = now
        log('reaction', f'ALERT from kafka: rule {report[4]} {report[7]} (ip.src={attacker})')
        threading.Thread(
            target=lambda a=attacker: print(f'REACTION {block_attacker(a)}', flush=True),
            daemon=True,
        ).start()


def run_reaction():
    class Handler(BaseHTTPRequestHandler):
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

        def do_GET(self):  # noqa: N802 — stdlib hook name
            if self.path == '/health':
                self._json(200, {'status': 'healthy'})
            else:
                self._json(200, {'status': 'ok', 'module': 'ai4soar'})

        def do_POST(self):  # noqa: N802 — stdlib hook name
            if self.path.startswith('/api/alerts'):
                attacker = attacker_of(self._body_json())
                if attacker:
                    outcome = block_attacker(attacker)
                else:
                    outcome = 'no attacker address in the alert — skipped'
                print(f'REACTION {outcome}', flush=True)
                self._json(202, {'reaction': outcome})
            else:
                self._json(404, {'error': 'not found'})

        def log_message(self, fmt, *args):
            log('reaction', fmt % args)

    bootstrap = os.environ.get('KAFKA_BOOTSTRAP_SERVERS')
    if bootstrap:
        topic = os.environ.get('KAFKA_TOPIC', 'mmt-security-alerts')
        threading.Thread(target=run_kafka_consumer, args=(bootstrap, topic), daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', 5000), Handler)
    log('reaction', f'serving :5000 (/health, /api/alerts → {BLOCK_TARGET_URL}/admin/block)')
    server.serve_forever()


# ---------------------------------------------------------------------------
# attack — mag substitute
# ---------------------------------------------------------------------------


def arg_value(flag, default=None):
    if flag in sys.argv:
        index = sys.argv.index(flag)
        if index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    return default


def run_attack():
    target_ip = arg_value('--target-ip', 'ci-sim')
    target_port = arg_value('--target-port', '8080')
    # `--count` mirrors the real mag CLI; MAG_REQUEST_COUNT is the env form.
    total = int(arg_value('--count') or os.environ.get('MAG_REQUEST_COUNT', '400'))
    url = f'http://{target_ip}:{target_port}/'
    log('attack', f'http-flood → {url} ({total} requests)')

    sent = [0]
    ok = [0]
    blocked = [0]
    lock = threading.Lock()

    def worker():
        while True:
            with lock:
                index = sent[0]
                if index >= total:
                    return
                sent[0] += 1
            try:
                with urllib.request.urlopen(url, timeout=3) as response:
                    response.read()
                with lock:
                    ok[0] += 1
            except urllib.error.HTTPError as exc:
                if exc.code == 403:
                    # The blocklist answered — the request reached the target
                    # and was rejected application-side: still observable
                    # attack traffic, which is what attack #2 needs.
                    with lock:
                        blocked[0] += 1
                else:
                    log('attack', f'request {index} failed: HTTP {exc.code}')
            except Exception as exc:
                log('attack', f'request {index} failed: {exc}')
            if index % 50 == 0:
                log('attack', f'{index}/{total} requests sent')

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    log(
        'attack',
        f'attack profile finished — {ok[0]}/{sent[0]} requests reached the '
        f'target, {blocked[0]} blocked',
    )
    # An attack that never reached the target is a failed run, not a
    # completed one — mirror MAG's own non-zero exit semantics. A blocklisted
    # run still reached the target (the 403 is the target answering).
    sys.exit(0 if ok[0] + blocked[0] > 0 else 1)


def main():
    dispatch = {
        'target': run_target,
        'monitor': run_monitor,
        'reaction': run_reaction,
        'attack': run_attack,
    }
    selected = role()
    runner = dispatch.get(selected)
    if not runner:
        print(f'[stub] unknown STUB_ROLE "{selected}"', flush=True)
        sys.exit(2)
    runner()


if __name__ == '__main__':
    main()
