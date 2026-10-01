#!/usr/bin/env node
/**
 * Kind-based end-to-end driver for the Montimage attack → detect → respond
 * demo scenario (issue #206, playbook task 4.3; two-attack R1 flow #237).
 *
 * Exercises the real engine path against a kind cluster through the public
 * REST API — deploy → attack → detect → respond → attack again → teardown —
 * and asserts the R1 scenario beats:
 *
 *   1. `kubectl exec` attack #1 runs the seeded `mag http-flood` profile in
 *      the idling MAG Deployment (issue #233)
 *   2. secAnoD detects the flood (rule 56) and publishes the report, carrying
 *      the attacker `ip.src`, to Kafka; AI4SOAR consumes it (#234)
 *   3. The flood pushes CI-SIM over its rate threshold — it logs
 *      "service stopped", exits, and the Deployment restarts it (#231)
 *   4. AI4SOAR's playbook POSTs the attacker address to ci-sim
 *      `/admin/block` — the blocklist entry survives the restart (#235)
 *   5. `kubectl exec` attack #2 re-runs the profile against the blocklisted
 *      attacker: answered 403, the probe alerts again, the target stays up
 *   6. Namespace deletion leaves no resources behind
 *
 * Image strategy: the four module images live in the private
 * registry.montimage.eu (does not resolve on the public Internet, and the
 * engine does not attach imagePullSecrets), so the driver repoints the seeded
 * services' `versions[].dockerImage` at a locally-built stub image loaded
 * into kind (`scripts/e2e-kind/stub/`). The scenario document, topology,
 * edges, deployment specs, RBAC, ordering and NetworkPolicy are the real
 * seeded artifacts — only the container images are substituted.
 *
 * Registry gate (AC3): a private-registry preflight runs first. When
 * `SECSIM_E2E_REQUIRE_REAL_IMAGES=1` and the registry is unreachable, the run
 * fails clearly instead of silently exercising stubs. In the default mode the
 * fallback is announced loudly (GitHub `::warning::`) and every assertion is
 * still enforced — nothing is skipped.
 *
 * Environment:
 *   BASE_URL        API base (default http://127.0.0.1:3000)
 *   ADMIN_USERNAME  seeded admin user (default admin)
 *   ADMIN_PASSWORD  seeded admin password (required)
 *   E2E_KUBECONFIG  kubeconfig for the kind cluster (default ~/.kube/config)
 *   STUB_IMAGE      image:tag substituted for the module images
 *                   (default secsim-e2e-stub:local — loaded via `kind load`)
 *   SECSIM_E2E_REQUIRE_REAL_IMAGES  set to 1/true to require the private
 *                   registry and fail instead of falling back to stubs
 */

import { execFileSync } from 'node:child_process';
import dns from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
// gitleaks:allow — env lookups and variable assignments below, no literals
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''; // gitleaks:allow
const KUBECONFIG = process.env.E2E_KUBECONFIG ?? join(homedir(), '.kube', 'config');
const STUB_IMAGE = process.env.STUB_IMAGE ?? 'secsim-e2e-stub:local';
const REQUIRE_REAL = /^(1|true|yes)$/i.test(process.env.SECSIM_E2E_REQUIRE_REAL_IMAGES ?? '');

const PRIVATE_REGISTRY = 'registry.montimage.eu';
const DEMO_PROJECT_SHORTNAME = 'MONTIMAGE-DEMO';
const DEMO_SCENARIO_MATCH = 'AI4SOAR';
const CONTAINMENT_POLICY = 'mag-egress';
// MAG is a Deployment since issue #233 — same resource name, driven via exec.
const MAG_DEPLOYMENT = 'mag';
const HOST_APP = 'ci-sim';
// secAnoD publishes its mmt-security reports to Kafka and to stdout — the
// detections are read from the `secanod` sidecar's log.
const PROBE_CONTAINER = 'secanod';
const REACTION_APP = 'ai4soar';
// The seeded R1 attack profiles (demo.seed.ts `config.profiles`, #236): both
// runs exec the same `mag http-flood` command; attack #2 is rate-limited via
// MAG_REQUEST_COUNT so it alerts the probe (≥8 concurrent connections) while
// staying under CI-SIM's 50 req/10 s stop threshold.
const ATTACK_1_CMD = 'mag http-flood --target-ip ci-sim --target-port 8080';
const ATTACK_2_CMD = 'MAG_REQUEST_COUNT=25 mag http-flood --target-ip ci-sim --target-port 8080';
// Localhost check of the ci-sim API, run inside the target container (the
// blocklist would 403 the same request sourced from the MAG pod).
const ADMIN_BLOCKS_PROBE =
  'python3 -c "import urllib.request,sys;' +
  "sys.stdout.write(urllib.request.urlopen('http://127.0.0.1:8080/admin/blocks',timeout=5).read().decode())\"";
const HEALTH_PROBE =
  'python3 -c "import urllib.request,sys;' +
  "sys.stdout.write(urllib.request.urlopen('http://127.0.0.1:8080/',timeout=5).read().decode())\"";
const METRICS_PROBE =
  'python3 -c "import urllib.request,sys;' +
  "sys.stdout.write(urllib.request.urlopen('http://127.0.0.1:8080/api/metrics',timeout=5).read().decode())\"";

const TIMING = {
  serverWaitMs: 180_000, // server boot + auto-seed
  executeMs: 480_000, // POST /execute blocks through the readiness gate
  rolloutMs: 300_000, // MAG Deployment availability
  execAttackMs: 180_000, // one exec-driven attack run
  alertMs: 180_000,
  reactionMs: 180_000, // blocklist entry — alert → ai4soar → /admin/block
  recoverMs: 300_000, // ci-sim container restart + Ready again
  // "service stopped" log read after the restart: kubelet may still be
  // swapping incarnations (a double stop deletes the first one's log while
  // restartCount still reads 1), so the read is retried until this deadline.
  stopEvidenceMs: 45_000,
  teardownMs: 120_000,
  pollMs: 4_000,
};

const results = [];
let token = '';
let scenarioId = '';
let executionId = '';
let namespace = '';
let tornDown = false;

function note(text) {
  console.log(text);
}

function group(name) {
  console.log(`::group::${name}`);
}

function endGroup() {
  console.log('::endgroup::');
}

function warn(text) {
  console.log(`::warning::${text}`);
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

let errorPrinted = false;

function fail(message) {
  console.log(`::error::${message}`);
  errorPrinted = true;
  throw new Error(message);
}

function kubectl(args, { allowFail = false, timeoutMs } = {}) {
  try {
    return execFileSync('kubectl', args, {
      env: { ...process.env, KUBECONFIG },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
    }).trim();
  } catch (err) {
    if (allowFail) return '';
    const stderr = err.stderr?.toString().trim();
    throw new Error(`kubectl ${args.join(' ')} failed: ${stderr || err.message}`);
  }
}

/** Like kubectl() with allowFail, but opt-in keeps the failure reason:
 * never throws, returns `{ out, err }` (err is '' on success). */
function kubectlCapture(args) {
  try {
    return { out: kubectl(args), err: '' };
  } catch (err) {
    return { out: '', err: err.message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(method, path, body, { timeoutMs = 30_000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    fail(`${method} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

/** Poll `fn` until it returns a truthy value or the deadline passes. */
async function poll(fn, deadlineMs, label) {
  const deadline = Date.now() + deadlineMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(TIMING.pollMs);
  }
  throw new Error(
    `Timed out after ${Math.round(deadlineMs / 1000)}s waiting for ${label}${lastError ? ` (last error: ${lastError})` : ''}`
  );
}

// ---------------------------------------------------------------------------
// Preflight — private registry gate (AC3)
// ---------------------------------------------------------------------------

async function registryGate() {
  let reachable = false;
  try {
    await dns.lookup(PRIVATE_REGISTRY);
    reachable = true;
  } catch {
    reachable = false;
  }

  if (reachable) {
    note(
      `Registry ${PRIVATE_REGISTRY} resolves — the module images still need ` +
        'credentials the engine cannot attach, so the run uses the stub image ' +
        'with the real scenario manifests.'
    );
    return;
  }

  if (REQUIRE_REAL) {
    fail(
      `SECSIM_E2E_REQUIRE_REAL_IMAGES is set but ${PRIVATE_REGISTRY} is ` +
        'unreachable — the real module images cannot be pulled and the run ' +
        'refuses to silently fall back to stubs.'
    );
  }

  warn(
    `Private registry ${PRIVATE_REGISTRY} is unreachable from this runner. ` +
      `Falling back to the locally-built stub image ${STUB_IMAGE}; the ` +
      'scenario topology, specs and every assertion are unchanged. Set ' +
      'SECSIM_E2E_REQUIRE_REAL_IMAGES=1 to fail here instead.'
  );
}

// ---------------------------------------------------------------------------
// Setup — server, login, infrastructure, service/image patching
// ---------------------------------------------------------------------------

async function waitForServer() {
  await poll(
    async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    TIMING.serverWaitMs,
    `the API at ${BASE_URL}/api/health (boot + auto-seed)`
  );
  note(`API healthy at ${BASE_URL}`);
}

async function login() {
  const data = await api('POST', '/api/auth/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD, // gitleaks:allow
  });
  if (!data.token) fail('Login returned no token');
  token = data.token; // gitleaks:allow
  note(`Authenticated as ${ADMIN_USERNAME}`);
}

async function findDemoScenario() {
  const projects = await api('GET', '/api/projects?limit=100');
  const list = Array.isArray(projects) ? projects : (projects.projects ?? projects.data ?? []);
  const project = list.find((p) => p.shortName === DEMO_PROJECT_SHORTNAME);
  if (!project) {
    fail(`Demo project ${DEMO_PROJECT_SHORTNAME} not found — did the seed run?`);
  }
  const scenarios = await api('GET', `/api/projects/${project._id}/scenarios`);
  const scenario = (Array.isArray(scenarios) ? scenarios : []).find((s) =>
    String(s.title ?? '').includes(DEMO_SCENARIO_MATCH)
  );
  if (!scenario) {
    fail(`Demo scenario (title contains "${DEMO_SCENARIO_MATCH}") not found`);
  }
  scenarioId = String(scenario._id);
  note(`Demo scenario: ${scenario.title} (${scenarioId})`);
}

async function registerInfrastructure() {
  const kubeconfig = readFileSync(KUBECONFIG, 'utf-8');
  const server = /^\s*server:\s*(\S+)/m.exec(kubeconfig)?.[1];
  if (!server) fail(`No cluster server URL found in ${KUBECONFIG}`);
  const infra = await api('POST', '/api/infrastructures', {
    name: `kind-e2e-${Date.now()}`,
    type: 'kubernetes',
    endpoint: server,
    credentials: kubeconfig,
  });
  note(`Infrastructure registered: ${infra.name} → ${server}`);
  return String(infra._id);
}

/**
 * Repoint the seeded private-registry Montimage services (MAG, CI-SIM,
 * AI4SOAR) at the stub image and inject a STUB_ROLE env var per module. The
 * demo scenario document itself is left untouched — image resolution flows
 * through `versions[].dockerImage` exactly as production deploys do. The
 * secAnoD sidecar and the Kafka broker keep their images
 * (secanod-mmt-image:kafka — load it into kind first — and apache/kafka), so
 * detection runs the real secAnoD rules
 * and alerts travel over the real Kafka bus to the stubbed AI4SOAR.
 */
// The demo scenario's target is CI-SIM since issue #236 — the stub stands in
// for whatever catalog service the seeded `attacks`/`monitors`/`acts-on`
// edges point at, so the map follows the seed, not the module list.
const STUB_ROLES = {
  MAG: 'attack',
  'CI-SIM': 'target',
  AI4SOAR: 'reaction',
};

async function patchServicesToStub() {
  for (const [shortName, stubRole] of Object.entries(STUB_ROLES)) {
    const matches = await api('GET', `/api/services?search=${encodeURIComponent(shortName)}`);
    const list = Array.isArray(matches) ? matches : (matches.services ?? matches.data ?? []);
    const found = list.find((s) => s.shortName === shortName);
    if (!found) fail(`Catalog service ${shortName} not found — did the seed run?`);

    const service = await api('GET', `/api/services/${found._id}`);
    const deployment = { ...(service.deployment ?? {}) };
    // Re-runnable: drop prior stub entries so a second run does not append
    // duplicate env vars.
    const env = (deployment.env ?? []).filter(
      (e) => e.name !== 'STUB_ROLE' && e.name !== 'MMT_ALERT_URL'
    );
    env.push({ name: 'STUB_ROLE', value: stubRole });
    deployment.env = env;

    await api('PUT', `/api/services/${found._id}`, {
      currentVersion: 'v1.0.0',
      versions: [{ version: 'v1.0.0', dockerImage: STUB_IMAGE }],
      deployment,
    });
    note(`${shortName} → ${STUB_IMAGE} (STUB_ROLE=${stubRole})`);
  }
}

async function assignInfrastructure(infrastructureId) {
  await api('PUT', `/api/scenarios/${scenarioId}`, { infrastructureId });
  note('Infrastructure assigned to the demo scenario');
}

// ---------------------------------------------------------------------------
// Execute + assertions
// ---------------------------------------------------------------------------

async function executeScenario() {
  const result = await api('POST', `/api/scenarios/${scenarioId}/execute`, undefined, {
    timeoutMs: TIMING.executeMs,
  });
  executionId = result.executionId;
  namespace = result.namespace;
  if (!executionId || !namespace) {
    fail(`Execute response missing executionId/namespace: ${JSON.stringify(result)}`);
  }
  note(`Execution ${executionId} deploying into namespace ${namespace}`);
  // POST /execute answers 202 with the plan; the rollout (readiness gate
  // included) runs in the background — wait for the record to leave pending.
  const execution = await poll(
    async () => {
      const scenario = await api('GET', `/api/scenarios/${scenarioId}`);
      const record = (scenario.executions ?? []).find((e) => e._id === executionId);
      return record && record.status !== 'pending' ? record : null;
    },
    TIMING.executeMs,
    `execution ${executionId} to finish rolling out`
  );
  if (execution.status === 'failed') fail(`Background deploy failed for ${executionId}`);
  for (const svc of execution.deployedServices ?? []) {
    note(
      `  service ${svc.name} (${svc.uiType}) status=${svc.status}${svc.dashboardUrl ? ` url=${svc.dashboardUrl}` : ''}`
    );
  }
}

function assertNamespaceShape() {
  const got = kubectl(['get', 'namespace', namespace, '-o', 'name'], { allowFail: true });
  record('execution namespace exists', got.includes(namespace), namespace);

  const labels = kubectl(
    [
      'get',
      'namespace',
      namespace,
      '-o',
      'jsonpath={.metadata.labels.pod-security\\.kubernetes\\.io/enforce}',
    ],
    { allowFail: true }
  );
  record('namespace is labelled pod-security privileged', labels === 'privileged', labels);

  const policies = kubectl(
    ['-n', namespace, 'get', 'networkpolicy', CONTAINMENT_POLICY, '-o', 'name'],
    { allowFail: true }
  );
  record(
    `engine containment NetworkPolicy ${CONTAINMENT_POLICY} exists`,
    policies.includes(CONTAINMENT_POLICY)
  );
}

async function assertMagDeployment() {
  try {
    kubectl(
      [
        '-n',
        namespace,
        'rollout',
        'status',
        `deploy/${MAG_DEPLOYMENT}`,
        `--timeout=${Math.round(TIMING.rolloutMs / 1000)}s`,
      ],
      { allowFail: true }
    );
    const available = kubectl(
      [
        '-n',
        namespace,
        'get',
        'deploy',
        MAG_DEPLOYMENT,
        '-o',
        'jsonpath={.status.availableReplicas}',
      ],
      { allowFail: true }
    );
    record(
      'MAG Deployment is available',
      Number(available) >= 1,
      `availableReplicas=${available || '0'}`
    );
  } catch (err) {
    record('MAG Deployment is available', false, err.message);
  }
}

/** The exec-driven R1 attack beat (issue #237): `kubectl exec` into the
 * idling MAG pod runs the seeded `mag http-flood` runbook verbatim through
 * the stub image's `mag` shim; the `tee /proc/1/fd/1` wrapper lands the run
 * output in the MAG container log (exec output alone only reaches the exec
 * channel), which is also what the SSE stream ships. The exec exit code is
 * ignored on purpose — the assertions read the run's own log lines. */
function execAttack(command) {
  kubectl(
    [
      '-n',
      namespace,
      'exec',
      `deploy/${MAG_DEPLOYMENT}`,
      '--',
      'sh',
      '-c',
      `${command} 2>&1 | tee /proc/1/fd/1`,
    ],
    { allowFail: true, timeoutMs: TIMING.execAttackMs }
  );
}

function magLogTail(tail = 200) {
  return kubectl(['-n', namespace, 'logs', `deploy/${MAG_DEPLOYMENT}`, `--tail=${tail}`], {
    allowFail: true,
  });
}

function finishedRuns(logs) {
  return logs.split('\n').filter((l) => /attack profile finished/.test(l));
}

async function assertExecAttack(round, command) {
  try {
    execAttack(command);
    // The exec returns as soon as the run ends; the tee'd finish line can
    // take a beat to show in the container log, so poll briefly for it.
    const runs = await poll(
      async () => {
        const found = finishedRuns(magLogTail());
        return found.length >= round ? found : null;
      },
      60_000,
      `attack #${round}'s finish line in the MAG container log`
    );
    record(
      `exec-driven attack #${round} completes in the MAG pod`,
      true,
      runs[runs.length - 1]?.replace(/^.*attack profile finished/, 'attack profile finished')
    );
  } catch (err) {
    record(`exec-driven attack #${round} completes in the MAG pod`, false, err.message);
  }
}

/**
 * secAnoD detections logged since `sinceTime` (RFC 3339) — mmt-security JSON
 * reports `[10, probe, iface, ts, rule, "detected", …]`, one per matching
 * packet, so a time window rather than a line count separates the attacks.
 */
function probeAlertLines(sinceTime) {
  const out = kubectl(
    [
      '-n',
      namespace,
      'logs',
      '-l',
      `app=${HOST_APP}`,
      '-c',
      PROBE_CONTAINER,
      `--since-time=${sinceTime}`,
    ],
    { allowFail: true }
  );
  // Match on the report's own packet timestamp too: --since-time filters by
  // log-write time, which can trail the packet that raised the detection.
  const sinceEpoch = Date.parse(sinceTime) / 1000;
  return out.split('\n').filter((l) => {
    if (!l.startsWith('[10,') || !l.includes('"detected"')) return false;
    try {
      return JSON.parse(l)[3] >= sinceEpoch;
    } catch {
      return false;
    }
  });
}

async function assertProbeAlert(sinceTime, name) {
  try {
    const lines = await poll(
      async () => {
        const found = probeAlertLines(sinceTime);
        return found.length > 0 ? found : null;
      },
      TIMING.alertMs,
      `a secAnoD detection in the sidecar logs since ${sinceTime}`
    );
    record(name, true, lines[lines.length - 1]?.slice(0, 160));
  } catch (err) {
    record(name, false, err.message);
  }
}

/** AI4SOAR consumed secAnoD's report from the Kafka alert bus. */
async function assertKafkaDelivery(sinceTime) {
  const name = 'AI4SOAR consumes the secAnoD alert from Kafka';
  try {
    const line = await poll(
      async () => {
        const out = kubectl(
          ['-n', namespace, 'logs', '-l', `app=${REACTION_APP}`, `--since-time=${sinceTime}`],
          { allowFail: true }
        );
        return out.split('\n').find((l) => l.includes('ALERT from kafka')) ?? null;
      },
      TIMING.alertMs,
      'an AI4SOAR "ALERT from kafka" log line'
    );
    record(name, true, line.slice(0, 160));
  } catch (err) {
    record(name, false, err.message);
  }
}

function targetContainerStatus() {
  const out = kubectl(
    [
      '-n',
      namespace,
      'get',
      'pods',
      '-l',
      `app=${HOST_APP}`,
      '-o',
      `jsonpath={.items[0].status.containerStatuses[?(@.name=='${HOST_APP}')].restartCount} {.items[0].status.conditions[?(@.type=='Ready')].status}`,
    ],
    { allowFail: true }
  );
  const [restarts = '0', ready = ''] = out.split(/\s+/);
  return { restarts: Number(restarts) || 0, ready: ready === 'True' };
}

function targetPodName() {
  return kubectl(
    [
      '-n',
      namespace,
      'get',
      'pods',
      '-l',
      `app=${HOST_APP}`,
      '-o',
      'jsonpath={.items[0].metadata.name}',
    ],
    { allowFail: true }
  );
}

/** One-line container status for failure detail: restart count, current
 * state, and why the previous incarnation terminated. */
function targetContainerSummary(pod) {
  if (!pod) return 'pod=(none)';
  const { out, err } = kubectlCapture(['-n', namespace, 'get', 'pod', pod, '-o', 'json']);
  if (err) return `pod=${pod} status unavailable (${err.slice(0, 160)})`;
  try {
    const statuses = JSON.parse(out).status?.containerStatuses ?? [];
    const cs = statuses.find((c) => c.name === HOST_APP);
    if (!cs) return `pod=${pod} no ${HOST_APP} container status`;
    const state = Object.keys(cs.state ?? {})[0] ?? 'unknown';
    const last = cs.lastState?.terminated;
    const lastText = last ? `${last.reason ?? '?'}/exit ${last.exitCode ?? '?'}` : 'none';
    return `pod=${pod} restartCount=${cs.restartCount} state=${state} lastState.terminated=${lastText}`;
  } catch {
    return `pod=${pod} status unparseable`;
  }
}

/** Read the "service stopped" line from the target pod — the previous
 * incarnation's log first, then the current one's — retrying until
 * TIMING.stopEvidenceMs. A double stop makes the kubelet drop the first
 * incarnation's log while restartCount still reads 1, so a one-shot `-p`
 * read can fail spuriously; the second stop's line lands in `-p` (or the
 * current log) shortly after. Keeps the last kubectl error and lines seen
 * so a real miss explains itself. */
async function targetStoppedEvidence() {
  const deadline = Date.now() + TIMING.stopEvidenceMs;
  let pod = '';
  let lastError = '';
  const lastLines = { previous: [], current: [] };
  for (;;) {
    pod = targetPodName() || pod;
    if (!pod) lastError = `no pod with label app=${HOST_APP}`;
    for (const source of pod ? ['previous', 'current'] : []) {
      const { out, err } = kubectlCapture([
        '-n',
        namespace,
        'logs',
        pod,
        '-c',
        HOST_APP,
        ...(source === 'previous' ? ['-p'] : []),
        '--tail=60',
      ]);
      if (err) {
        lastError = err;
        continue;
      }
      const lines = out.split('\n').filter(Boolean);
      const line = lines.find((l) => /service stopped/.test(l));
      if (line) return { ok: true, pod, line };
      if (lines.length) lastLines[source] = lines.slice(-5);
    }
    if (Date.now() >= deadline) return { ok: false, pod, lastError, lastLines };
    await sleep(TIMING.pollMs);
  }
}

/** Evidence for a failed stop check, printed before teardown deletes the
 * namespace (the finally-block diagnostics() runs too late for ci-sim). */
function printTargetSnapshot(pod) {
  if (!pod) return;
  for (const args of [
    ['-n', namespace, 'describe', 'pod', pod],
    ['-n', namespace, 'logs', pod, '-c', HOST_APP, '-p', '--tail=40'],
    ['-n', namespace, 'logs', pod, '-c', HOST_APP, '--tail=40'],
  ]) {
    const { out, err } = kubectlCapture(args);
    note(`$ kubectl ${args.join(' ')}\n${out || err || '(empty)'}`);
  }
}

/** Attack #1's win condition (#231): the flood pushes CI-SIM over its rate
 * threshold, the process logs "service stopped" and exits, and the
 * Deployment's restartPolicy brings the container back — asserted as the
 * container restartCount rising and the pod reporting Ready again. */
async function assertTargetStoppedAndRecovered() {
  try {
    await poll(
      async () => (targetContainerStatus().restarts >= 1 ? true : null),
      TIMING.recoverMs,
      'the ci-sim container restart after "service stopped"'
    );
    const evidence = await targetStoppedEvidence();
    if (evidence.ok) {
      record(
        'attack #1 stops the CI-SIM service (container restarted)',
        true,
        evidence.line.slice(0, 140)
      );
    } else {
      const seen = [
        ...evidence.lastLines.previous.map((l) => `[previous] ${l.slice(0, 140)}`),
        ...evidence.lastLines.current.map((l) => `[current] ${l.slice(0, 140)}`),
      ];
      record(
        'attack #1 stops the CI-SIM service (container restarted)',
        false,
        `restartCount>=1 but no "service stopped" in previous or current logs within ` +
          `${Math.round(TIMING.stopEvidenceMs / 1000)}s — ${targetContainerSummary(evidence.pod)}` +
          `${evidence.lastError ? `; last kubectl error: ${evidence.lastError.slice(0, 240)}` : ''}` +
          `; last lines seen: ${seen.length ? `\n  ${seen.join('\n  ')}` : '(none)'}`
      );
      printTargetSnapshot(evidence.pod);
    }
    const recovered = await poll(
      async () => (targetContainerStatus().ready ? true : null),
      TIMING.recoverMs,
      'the ci-sim pod Ready again after the restart'
    );
    record('CI-SIM target recovers after the stop', Boolean(recovered), 'pod Ready');
  } catch (err) {
    record('attack #1 stops the CI-SIM service (container restarted)', false, err.message);
    record('CI-SIM target recovers after the stop', false, 'never evaluated');
  }
}

function magPodAddress() {
  return kubectl(
    [
      '-n',
      namespace,
      'get',
      'pods',
      '-l',
      `app=${MAG_DEPLOYMENT}`,
      '-o',
      'jsonpath={.items[0].status.podIP}',
    ],
    { allowFail: true }
  );
}

/** The R1 reaction (#235): AI4SOAR's playbook POSTs the alert's `ip.src` to
 * ci-sim `/admin/block`. Asserted by querying the blocklist from inside the
 * target container — the same query sourced from MAG would itself be 403.
 * Returns the attacker address for the rate-window drain before attack #2. */
async function assertBlocklistEntry() {
  try {
    const attacker = await poll(async () => magPodAddress() || null, 60_000, 'the MAG pod address');
    const out = await poll(
      async () => {
        const blocks = kubectl(
          [
            '-n',
            namespace,
            'exec',
            `deploy/${HOST_APP}`,
            '-c',
            HOST_APP,
            '--',
            'sh',
            '-c',
            ADMIN_BLOCKS_PROBE,
          ],
          { allowFail: true }
        );
        return blocks.includes(attacker) ? blocks : null;
      },
      TIMING.reactionMs,
      `ci-sim /admin/blocks to list ${attacker}`
    );
    record('AI4SOAR blocklists the attacker on CI-SIM', true, out.slice(0, 120));
    return attacker;
  } catch (err) {
    record('AI4SOAR blocklists the attacker on CI-SIM', false, err.message);
    return magPodAddress();
  }
}

/** CI-SIM's rate window is 10 s sliding per source — attack #2 must not
 * start while enough of attack #1's flood is still in-window or even a
 * short run would re-trip the stop threshold. `/api/metrics` reports the
 * per-source windowed counts, so wait until the attacker's drains. */
async function waitForRateWindowDrain(attacker) {
  const safe = 15; // attack #2 sends 25; residual ≤15 keeps total < 50
  try {
    await poll(
      async () => {
        const out = kubectl(
          [
            '-n',
            namespace,
            'exec',
            `deploy/${HOST_APP}`,
            '-c',
            HOST_APP,
            '--',
            'sh',
            '-c',
            METRICS_PROBE,
          ],
          { allowFail: true }
        );
        try {
          const metrics = JSON.parse(out);
          return (metrics.sources?.[attacker] ?? 0) <= safe ? true : null;
        } catch {
          return null;
        }
      },
      120_000,
      `the attacker's ci-sim rate-window hits to drain below ${safe}`
    );
    record('ci-sim rate window drained before attack #2', true, `sources[${attacker}] ≤ ${safe}`);
  } catch (err) {
    record('ci-sim rate window drained before attack #2', false, err.message);
  }
}

/** After attack #2 the blocklist answers the flood 403 — the target must
 * still be healthy: no additional restart, Ready, and `GET /` still 200
 * (checked from inside the pod — the blocked MAG source cannot ask). */
async function assertTargetStillHealthy(restartsBefore) {
  try {
    const status = targetContainerStatus();
    const health = kubectl(
      [
        '-n',
        namespace,
        'exec',
        `deploy/${HOST_APP}`,
        '-c',
        HOST_APP,
        '--',
        'sh',
        '-c',
        HEALTH_PROBE,
      ],
      { allowFail: true }
    );
    const healthy =
      status.restarts === restartsBefore && status.ready && /"status":\s*"ok"/.test(health);
    record(
      'CI-SIM target still healthy after attack #2',
      healthy,
      `restarts=${status.restarts} (was ${restartsBefore}) ready=${status.ready} health=${health.slice(0, 80)}`
    );
  } catch (err) {
    record('CI-SIM target still healthy after attack #2', false, err.message);
  }
}

async function sampleStatusStream() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(
      `${BASE_URL}/api/scenarios/${scenarioId}/executions/${executionId}/events`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    let text = '';
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += Buffer.from(value).toString('utf-8');
        if (text.includes('event: end') || text.length > 64_000) break;
      }
    } catch {
      // abort on timeout is expected — partial stream is enough
    } finally {
      clearTimeout(timer);
      reader.cancel().catch(() => undefined);
    }
    record(
      'execution status streams over SSE',
      /event:\s*(progress|log|k8s-event|alert|end)/.test(text),
      `${text.length} bytes read`
    );
  } catch (err) {
    record('execution status streams over SSE', false, err.message);
  }
}

async function teardownAndVerifyClean() {
  if (!executionId) {
    // Deploy never produced an execution — nothing to tear down via the API;
    // a partially-created namespace is still possible, so remove it directly.
    if (namespace) {
      kubectl(['delete', 'namespace', namespace, '--ignore-not-found=true'], {
        allowFail: true,
      });
    }
    return;
  }
  try {
    await api('DELETE', `/api/scenarios/${scenarioId}/executions/${executionId}`);
    tornDown = true;
  } catch (err) {
    record('teardown deletes the execution namespace', false, err.message);
    return;
  }

  try {
    await poll(
      async () => {
        const out = kubectl(['get', 'namespace', namespace], { allowFail: true });
        return out === '';
      },
      TIMING.teardownMs,
      `namespace ${namespace} deletion`
    );
  } catch (err) {
    record('teardown deletes the execution namespace', false, err.message);
    return;
  }
  record('teardown deletes the execution namespace', true, namespace);

  // No engine resource is cluster-scoped (Role/RoleBinding only), so once the
  // namespace is gone nothing may remain. Verify both halves explicitly.
  const leftoverNamespaces = kubectl(
    ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
    { allowFail: true }
  )
    .split(/\s+/)
    .filter((n) => n.startsWith('secsim-'));
  const clusterScoped = kubectl(
    ['get', 'clusterroles,clusterrolebindings', '-o', 'jsonpath={.items[*].metadata.name}'],
    { allowFail: true }
  )
    .split(/\s+/)
    .filter((n) => n.includes(namespace) || n.startsWith('secsim'));
  const leftovers = [...leftoverNamespaces, ...clusterScoped];
  record(
    'namespace deletion leaves no resources behind',
    leftovers.length === 0,
    leftovers.length ? `leftovers: ${leftovers.join(', ')}` : 'no leftovers'
  );
}

async function bestEffortCleanup() {
  if (!namespace || tornDown) return;
  try {
    await api('DELETE', `/api/scenarios/${scenarioId}/executions/${executionId}`);
    tornDown = true;
  } catch {
    kubectl(['delete', 'namespace', namespace, '--ignore-not-found=true'], { allowFail: true });
  }
}

function diagnostics() {
  if (!namespace) return;
  for (const args of [
    ['get', 'all', '-n', namespace, '-o', 'wide'],
    ['get', 'networkpolicies,configmaps,serviceaccounts,roles,rolebindings', '-n', namespace],
    ['describe', 'deployment', MAG_DEPLOYMENT, '-n', namespace],
  ]) {
    try {
      note(`$ kubectl ${args.join(' ')}\n${kubectl(args, { allowFail: true }) || '(empty)'}`);
    } catch {
      /* best effort */
    }
  }
  for (const container of [HOST_APP, PROBE_CONTAINER]) {
    const logs = kubectl(
      ['-n', namespace, 'logs', '-l', `app=${HOST_APP}`, '-c', container, '--tail=80'],
      { allowFail: true }
    );
    if (logs) note(`--- logs ${HOST_APP}/${container} ---\n${logs}`);
  }
  // The crashed ci-sim container's last lines — where "service stopped" shows.
  const previous = kubectl(
    ['-n', namespace, 'logs', '-l', `app=${HOST_APP}`, '-c', HOST_APP, '-p', '--tail=40'],
    { allowFail: true }
  );
  if (previous) note(`--- logs ${HOST_APP}/${HOST_APP} (previous) ---\n${previous}`);
  const magLogs = magLogTail(80);
  if (magLogs) note(`--- logs ${MAG_DEPLOYMENT} ---\n${magLogs}`);
}

async function main() {
  if (!ADMIN_PASSWORD) {
    fail('ADMIN_PASSWORD is required — the seeded admin credentials drive the API');
  }

  group('Preflight — private registry gate');
  await registryGate();
  endGroup();

  group('Setup — server, auth, infrastructure, stub images');
  await waitForServer();
  await login();
  await findDemoScenario();
  const infrastructureId = await registerInfrastructure();
  await patchServicesToStub();
  await assignInfrastructure(infrastructureId);
  endGroup();

  try {
    group('Execute — deploy the demo scenario');
    await executeScenario();
    endGroup();

    group('Assert — rollout, attack #1, detection, stop+recover, block');
    assertNamespaceShape();
    await assertMagDeployment();
    // Attack #1 — the seeded runbook verbatim; the flood trips the probe's
    // connection alert AND pushes CI-SIM over its rate threshold.
    const attack1Start = new Date().toISOString();
    await assertExecAttack(1, ATTACK_1_CMD);
    await assertProbeAlert(attack1Start, 'secAnoD emits an alert for attack #1');
    await assertTargetStoppedAndRecovered();
    await assertKafkaDelivery(attack1Start);
    const attacker = await assertBlocklistEntry();
    endGroup();

    group('Assert — attack #2 blocked, second alert, target stays up');
    // Let attack #1's hits age out of ci-sim's 10 s rate window so attack
    // #2's 25-request burst cannot re-trip the stop threshold.
    if (attacker) await waitForRateWindowDrain(attacker);
    const attack2Start = new Date().toISOString();
    const restartsBefore = targetContainerStatus().restarts;
    await assertExecAttack(2, ATTACK_2_CMD);
    await assertProbeAlert(attack2Start, 'secAnoD alerts again for attack #2');
    await assertTargetStillHealthy(restartsBefore);
    await sampleStatusStream();
    endGroup();
  } finally {
    group('Teardown — delete execution, verify nothing remains');
    await teardownAndVerifyClean();
    if (results.some((r) => !r.ok)) {
      await bestEffortCleanup();
      diagnostics();
    }
    endGroup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n================ E2E summary ================');
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  if (failed.length) {
    console.log(`::error::${failed.length} assertion(s) failed`);
    process.exit(1);
  }
  console.log('All assertions passed.');
}

main().catch(async (err) => {
  if (!errorPrinted) console.log(`::error::${err.message}`);
  try {
    await bestEffortCleanup();
  } catch {
    /* ignore */
  }
  diagnostics();
  process.exit(1);
});
