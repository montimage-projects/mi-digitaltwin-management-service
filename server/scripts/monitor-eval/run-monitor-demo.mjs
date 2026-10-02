#!/usr/bin/env node
/**
 * Monitor-agent experiment on the SECASSURED demo (kind): deploy the demo
 * scenario, start the Monitor, run MAG's first attack profile, and record
 * MTTD (attack start → incident opened), triage and Boss-proposal latency.
 *
 *   ADMIN_PASSWORD=… node server/scripts/monitor-eval/run-monitor-demo.mjs [--runs=1] [--out=file.json]
 *     [--mode=attack|benign] [--profile=0] [--duration=300]
 * attack: run attack profile #profile and wait for the Boss proposal.
 * benign: no attack; watch for --duration seconds and count incidents (false positives).
 * Env: BASE_URL (default http://127.0.0.1:3000), SCENARIO_TITLE (default /MMT detection/).
 */
import { writeFileSync } from 'node:fs';
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const RUNS = Number(arg('runs', '1'));
const OUT = arg('out', '');
const MODE = arg('mode', 'attack');
const PROFILE = Number(arg('profile', '0'));
const DURATION_S = Number(arg('duration', '300'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token;
async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
async function until(fn, timeoutMs, label, everyMs = 2000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(everyMs);
  }
}

token = (await api('POST', '/auth/login', { username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD })).token;
const scenarios = await api('GET', '/scenarios/search?q=MMT').catch(() => null);
const scenarioId =
  process.env.SCENARIO_ID ??
  (scenarios?.scenarios ?? scenarios ?? []).find?.((s) => /MMT detection/.test(s.title))?._id;
if (!scenarioId) throw new Error('demo scenario not found — set SCENARIO_ID');
const results = [];
for (let run = 1; run <= RUNS; run++) {
  const { executionId } = await api('POST', `/scenarios/${scenarioId}/execute`);
  console.log(`[run ${run}] execution ${executionId} deploying…`);
  await until(async () => {
    const s = await api('GET', `/scenarios/${scenarioId}`);
    const e = s.executions.find((x) => x._id === executionId);
    if (e?.status === 'failed') throw new Error('deploy failed');
    return e && ['running', 'completed'].includes(e.status) && e.namespace;
  }, 300_000, 'deploy');
  await sleep(15_000); // let the probe settle
  await api('POST', `/agent/monitor/${executionId}/start`);
  if (MODE === 'benign') {
    console.log(`[run ${run}] benign: no attack, watching ${DURATION_S}s`);
    await sleep(DURATION_S * 1000);
    const { incidents } = await api('GET', `/agent/incidents?executionId=${executionId}`);
    results.push({ run, mode: 'benign', executionId, durationS: DURATION_S, falsePositiveIncidents: incidents.length,
      incidents: incidents.map(({ ruleId, srcIp, alertCount, triage }) => ({ ruleId, srcIp, alertCount, severity: triage?.severity })) });
    console.log(`[run ${run}] benign: ${incidents.length} incident(s)`);
  } else {
  const { profiles } = await api('GET', `/scenarios/${scenarioId}/executions/${executionId}/profiles`);
  const profile = profiles[PROFILE];
  if (!profile) throw new Error(`no attack profile #${PROFILE} (have ${profiles.length})`);
  const t0 = Date.now();
  console.log(`[run ${run}] attack "${profile.name}" on ${profile.nodeId}`);
  await api('POST', `/scenarios/${scenarioId}/executions/${executionId}/profiles/run`, { nodeId: profile.nodeId, name: profile.name });
  const incident = await until(async () => {
    const { incidents } = await api('GET', `/agent/incidents?executionId=${executionId}`);
    return incidents.find((i) => ['proposed', 'error'].includes(i.status));
  }, 600_000, 'incident proposal', 1000);
  const ms = (iso) => Date.parse(iso) - t0;
  const r = {
    run, mode: 'attack', executionId, attack: profile.name, ruleId: incident.ruleId, attacker: incident.srcIp, alertCount: incident.alertCount,
    mttdMs: ms(incident.openedAt), triageMs: Date.parse(incident.triagedAt) - Date.parse(incident.openedAt),
    proposalMs: incident.proposedAt ? Date.parse(incident.proposedAt) - Date.parse(incident.triagedAt) : null,
    triageSource: incident.triageSource, triage: incident.triage, proposal: incident.proposal, status: incident.status,
  };
  results.push(r);
  console.log(`[run ${run}] MTTD ${(r.mttdMs / 1000).toFixed(1)}s · triage ${(r.triageMs / 1000).toFixed(1)}s · proposal ${((r.proposalMs ?? 0) / 1000).toFixed(1)}s · ${r.triage?.severity} ${r.triage?.mitreTechnique}`);
  }
  await api('POST', `/agent/monitor/${executionId}/stop`);
  await api('DELETE', `/scenarios/${scenarioId}/executions/${executionId}`).catch((e) => console.warn('teardown:', e.message));
}
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ proposal, ...r }) => r), null, 1));
