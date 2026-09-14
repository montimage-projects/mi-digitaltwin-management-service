#!/usr/bin/env node
/**
 * Kind-based end-to-end driver for the Montimage attack → detect → respond
 * demo scenario (issue #206, playbook task 4.3).
 *
 * Exercises the real engine path against a kind cluster through the public
 * REST API — deploy → status → teardown — and asserts the four scenario
 * outcomes:
 *
 *   1. MMT-Probe emits an alert       (probe sidecar log line, kubectl logs)
 *   2. AI4SOAR creates a NetworkPolicy (`ai4soar-block-mag` in the exec ns)
 *   3. The MAG Deployment rolls out and an exec-driven attack run succeeds
 *      (issue #233 — MAG is a long-running terminal workload now)
 *   4. Namespace deletion leaves no resources behind
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
const REACTION_POLICY = 'ai4soar-block-mag';
const CONTAINMENT_POLICY = 'mag-egress';
// MAG is a Deployment since issue #233 — same resource name, driven via exec.
const MAG_DEPLOYMENT = 'mag';
const HOST_APP = 'ci-sim';
const PROBE_CONTAINER = 'mmt-probe';

const TIMING = {
  serverWaitMs: 180_000, // server boot + auto-seed
  executeMs: 480_000, // POST /execute blocks through the readiness gate
  rolloutMs: 300_000, // MAG Deployment availability
  execAttackMs: 180_000, // one exec-driven attack run
  alertMs: 180_000,
  reactionMs: 180_000,
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

function kubectl(args, { allowFail = false } = {}) {
  try {
    return execFileSync('kubectl', args, {
      env: { ...process.env, KUBECONFIG },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    if (allowFail) return '';
    const stderr = err.stderr?.toString().trim();
    throw new Error(`kubectl ${args.join(' ')} failed: ${stderr || err.message}`);
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
 * Repoint the four seeded Montimage services at the stub image and inject a
 * STUB_ROLE env var per module. The demo scenario document itself is left
 * untouched — image resolution flows through `versions[].dockerImage` exactly
 * as production deploys do. The probe additionally gets `MMT_ALERT_URL` with
 * `fromEdge: 'reaction'`, exercising the engine's notify-edge env resolution
 * (task 1.4) against the real topology.
 */
// The demo scenario's target is CI-SIM since issue #236 — the stub stands in
// for whatever catalog service the seeded `attacks`/`monitors`/`acts-on`
// edges point at, so the map follows the seed, not the module list.
const STUB_ROLES = {
  MAG: 'attack',
  'CI-SIM': 'target',
  'MMT-PROBE': 'monitor',
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
    if (stubRole === 'monitor') {
      env.push({ name: 'MMT_ALERT_URL', fromEdge: 'reaction' });
    }
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
  for (const svc of result.services ?? []) {
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

async function assertMagDeploymentAndExecAttack() {
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
    return;
  }

  // Issue #233 contract: attacks are launched into the idling pod via
  // `kubectl exec`, so a second run needs no redeploy. The real module would
  // exec `mag <attack> --target-ip … --target-port …`; the stub image has no
  // `mag` binary, so exec runs stub.py with `mag` in argv (STUB_ROLE=attack is
  // also inherited) and the same flag surface. The `tee /proc/1/fd/1` wrapper
  // mirrors the UI hint: exec output normally only reaches the exec channel,
  // so teeing into PID 1's stdout also lands it in the MAG container log.
  try {
    const out = kubectl(
      [
        '-n',
        namespace,
        'exec',
        `deploy/${MAG_DEPLOYMENT}`,
        '--',
        'sh',
        '-c',
        `python3 -u /app/stub.py mag http-flood --target-ip ${HOST_APP} --target-port 8080 2>&1 | tee /proc/1/fd/1`,
      ],
      { allowFail: true }
    );
    const finished = /attack profile finished/.test(out);
    record(
      'exec-driven attack completes in the MAG pod',
      finished,
      out
        .split('\n')
        .find((l) => /finished|failed/.test(l))
        ?.slice(0, 120) || '(no output)'
    );

    // Issue #233 AC: attack output lands in the MAG container logs — the
    // tee redirect above is what puts it there (exec output alone never
    // reaches `kubectl logs`).
    const podLog = kubectl(['-n', namespace, 'logs', `deploy/${MAG_DEPLOYMENT}`, '--tail=100'], {
      allowFail: true,
    });
    record(
      'attack output lands in the MAG container log',
      /attack profile finished/.test(podLog),
      podLog
        .split('\n')
        .find((l) => /finished|failed/.test(l))
        ?.slice(0, 120) || '(no matching pod log line)'
    );
  } catch (err) {
    record('exec-driven attack completes in the MAG pod', false, err.message);
  }
}

async function assertProbeAlert() {
  try {
    const logs = await poll(
      async () => {
        const out = kubectl(
          ['-n', namespace, 'logs', '-l', `app=${HOST_APP}`, '-c', PROBE_CONTAINER, '--tail=500'],
          { allowFail: true }
        );
        // Case-sensitive `ALERT ` — the probe's detection line. A lowercase
        // match would also hit the startup "alerting to …" banner.
        return /\bALERT[:\s]/.test(out) ? out : null;
      },
      TIMING.alertMs,
      'an MMT-Probe alert in the sidecar logs'
    );
    const line = logs.split('\n').find((l) => /\bALERT[:\s]/.test(l));
    record('MMT-Probe emits an alert', true, line?.slice(0, 120));
  } catch (err) {
    record('MMT-Probe emits an alert', false, err.message);
  }
}

async function assertReactionPolicy() {
  try {
    await poll(
      async () =>
        kubectl(['-n', namespace, 'get', 'networkpolicy', REACTION_POLICY, '-o', 'name'], {
          allowFail: true,
        }),
      TIMING.reactionMs,
      `the AI4SOAR NetworkPolicy ${REACTION_POLICY}`
    );
    record('AI4SOAR creates a NetworkPolicy', true, REACTION_POLICY);
  } catch (err) {
    record('AI4SOAR creates a NetworkPolicy', false, err.message);
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

    group('Assert — rollout, exec attack, detection, reaction');
    assertNamespaceShape();
    await assertMagDeploymentAndExecAttack();
    await assertProbeAlert();
    await assertReactionPolicy();
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
