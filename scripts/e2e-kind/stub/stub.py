#!/usr/bin/env python3
"""E2E stub workload for the kind-based CI test (issue #206).

The Montimage scenario images live in the private `registry.montimage.eu`
registry, which does not resolve outside Montimage's network, and the deploy
engine does not attach `imagePullSecrets` — so CI cannot pull them. This stub
image substitutes for the four modules (`mag`, `ci-sim`, `mmt-probe`,
`ai4soar`) while preserving the *semantics* the end-to-end test asserts:

  target   (ci-sim)     — serves HTTP on :8080 so the readiness probe and the
                          attack traffic have a real victim.
  monitor  (mmt-probe)  — watches the shared pod network namespace via
                          /proc/net/tcp and raises an alert when connection
                          volume to :8080 spikes (the flood signature), then
                          reports it to the reaction module — standing in for
                          MMT-Probe's security output channel.
  reaction (ai4soar)    — serves GET /health on :5000 (readiness) and applies
                          the playbook response on alert: creates a
                          NetworkPolicy in the execution namespace through the
                          Kubernetes API, authenticated with the pod's
                          ServiceAccount token (exactly like Pre.3 describes).
  attack   (mag)        — since issue #233 the mag workload is a Deployment
                          whose seeded `command` idles (`sleep` loop), so the
                          stub's entrypoint never runs there; run-e2e.js
                          drives each attack with `kubectl exec` invoking
                          this script through `tee /proc/1/fd/1` so the
                          output also lands in the pod's container log —
                          floods --target-ip:--target-port with
                          HTTP requests, then exits 0.

The role comes from the STUB_ROLE env var (injected per service by
run-e2e.js and inherited by `kubectl exec` processes); the `mag …` argv
fallback keeps the exec-driven attack working even without it.
"""

import json
import os
import ssl
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TARGET_PORT_HEX = format(8080, '04X').upper()  # :1F90 in /proc/net/tcp
ALERT_THRESHOLD = 8  # concurrent/recent connections to :8080 that read as a flood
ALERT_RESEND_S = 15  # re-emit the alert while the flood signature persists
SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'


def log(role, message):
    print(f'[stub:{role}] {message}', flush=True)


def role():
    """STUB_ROLE env wins; fall back to the seeded MAG args (`mag …`)."""
    env_role = os.environ.get('STUB_ROLE', '').strip().lower()
    if env_role:
        return env_role
    return 'attack' if 'mag' in sys.argv[1:] else 'target'


# ---------------------------------------------------------------------------
# target — ci-sim substitute
# ---------------------------------------------------------------------------


def run_target():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 — stdlib hook name
            body = b'{"status":"ok","module":"ci-sim"}\n'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            log('target', fmt % args)

    server = ThreadingHTTPServer(('0.0.0.0', 8080), Handler)
    log('target', 'serving HTTP on :8080')
    server.serve_forever()


# ---------------------------------------------------------------------------
# monitor — mmt-probe substitute
# ---------------------------------------------------------------------------


def connections_to_target():
    """Connections on the shared pod interface whose local port is 8080.

    The sidecar shares the target's network namespace, so /proc/net/tcp shows
    the listener plus every ESTABLISHED/TIME_WAIT socket the attack creates.
    TIME_WAIT entries linger ~60 s, so even a short flood stays visible.
    """
    count = 0
    for table in ('/proc/net/tcp', '/proc/net/tcp6'):
        try:
            with open(table, 'r', encoding='ascii') as handle:
                next(handle)  # header
                for line in handle:
                    parts = line.split()
                    if len(parts) > 1 and parts[1].endswith(f':{TARGET_PORT_HEX}'):
                        count += 1
        except OSError:
            continue
    return count


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
        count = connections_to_target()
        if count >= ALERT_THRESHOLD and time.time() - last_alert >= ALERT_RESEND_S:
            last_alert = time.time()
            message = (
                f'ALERT http-flood suspected: {count} connections to :8080 '
                f'on interface {iface}'
            )
            # stdout is what the engine ships as `log` SSE events and what
            # `kubectl logs -c mmt-probe` reads — the e2e asserts on it.
            print(message, flush=True)
            try:
                os.makedirs(report_dir, exist_ok=True)
                with open(
                    os.path.join(report_dir, f'alert-{int(last_alert)}.txt'),
                    'w',
                    encoding='utf-8',
                ) as handle:
                    handle.write(message + '\n')
            except OSError as exc:
                log('monitor', f'report write failed: {exc}')
            post_alert(
                f'{alert_url}/api/alerts',
                {
                    'alert': message,
                    'source': 'mmt-probe',
                    'connections': count,
                    'timestamp': last_alert,
                },
            )
        time.sleep(1)


# ---------------------------------------------------------------------------
# reaction — ai4soar substitute
# ---------------------------------------------------------------------------


def read_sa_file(name):
    try:
        with open(os.path.join(SA_DIR, name), 'r', encoding='utf-8') as handle:
            return handle.read().strip()
    except OSError:
        return None


def apply_network_policy():
    """Create the playbook's deny-ingress NetworkPolicy via the pod's SA.

    Mirrors the AI4SOAR → ci-sim wiring row: `networkpolicies create`,
    namespace-scoped, least-privilege — the same call the real reaction would
    make. Returns a human-readable outcome string.
    """
    token = read_sa_file('token')  # gitleaks:allow — reads the pod SA token at runtime
    namespace = read_sa_file('namespace')
    cafile = os.path.join(SA_DIR, 'ca.crt')
    if not token or not namespace or not os.path.exists(cafile):
        return 'no in-cluster ServiceAccount credentials — skipped'

    policy = {
        'apiVersion': 'networking.k8s.io/v1',
        'kind': 'NetworkPolicy',
        'metadata': {
            'name': 'ai4soar-block-mag',
            'labels': {'app.kubernetes.io/managed-by': 'ai4soar'},
        },
        'spec': {
            'podSelector': {'matchLabels': {'app': 'ci-sim'}},
            'policyTypes': ['Ingress'],
            'ingress': [],  # deny all ingress to the target — the playbook response
        },
    }
    request = urllib.request.Request(
        'https://kubernetes.default.svc/apis/networking.k8s.io/v1'
        f'/namespaces/{namespace}/networkpolicies',
        data=json.dumps(policy).encode(),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    context = ssl.create_default_context(cafile=cafile)
    try:
        with urllib.request.urlopen(request, timeout=10, context=context) as response:
            return f'created NetworkPolicy ai4soar-block-mag (HTTP {response.status})'
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            return 'NetworkPolicy ai4soar-block-mag already exists'
        return f'Kubernetes API error {exc.code}: {exc.read().decode(errors="replace")[:200]}'
    except Exception as exc:
        return f'Kubernetes API call failed: {exc}'


def run_reaction():
    class Handler(BaseHTTPRequestHandler):
        def _json(self, code, payload):
            body = (json.dumps(payload) + '\n').encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802 — stdlib hook name
            if self.path == '/health':
                self._json(200, {'status': 'healthy'})
            else:
                self._json(200, {'status': 'ok', 'module': 'ai4soar'})

        def do_POST(self):  # noqa: N802 — stdlib hook name
            if self.path.startswith('/api/alerts'):
                outcome = apply_network_policy()
                print(f'REACTION {outcome}', flush=True)
                self._json(202, {'reaction': outcome})
            else:
                self._json(404, {'error': 'not found'})

        def log_message(self, fmt, *args):
            log('reaction', fmt % args)

    server = ThreadingHTTPServer(('0.0.0.0', 5000), Handler)
    log('reaction', 'serving :5000 (/health, /api/alerts)')
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
    total = int(os.environ.get('MAG_REQUEST_COUNT', '400'))
    url = f'http://{target_ip}:{target_port}/'
    log('attack', f'http-flood → {url} ({total} requests)')

    sent = [0]
    ok = [0]
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
            except Exception as exc:
                log('attack', f'request {index} failed: {exc}')
            if index % 50 == 0:
                log('attack', f'{index}/{total} requests sent')

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    log('attack', f'attack profile finished — {ok[0]}/{sent[0]} requests reached the target')
    # An attack that never reached the target is a failed run, not a
    # completed one — mirror MAG's own non-zero exit semantics.
    sys.exit(0 if ok[0] > 0 else 1)


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
