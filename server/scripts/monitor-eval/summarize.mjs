#!/usr/bin/env node
/**
 * Summarize Monitor-agent experiment results (one or more JSON files written by
 * run-monitor-demo.mjs) into the metrics table for the report.
 *   node server/scripts/monitor-eval/summarize.mjs results/*.json
 * Reference MITRE labels: rule 56 → T1499.001, 20 → T1498.001, 51 → T1499.004.
 */
import { readFileSync } from 'node:fs';
const REF = { 56: 'T1499.001', 20: 'T1498.001', 51: 'T1499.004' };
const rows = process.argv.slice(2).flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
const attacks = rows.filter((r) => (r.mode ?? 'attack') === 'attack');
const benign = rows.filter((r) => r.mode === 'benign');
const stats = (xs) => {
  if (!xs.length) return 'n/a';
  const s = [...xs].sort((a, b) => a - b), mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `median ${(s[Math.floor(s.length / 2)] / 1000).toFixed(1)} s · mean ${(mean / 1000).toFixed(1)} s · min ${(s[0] / 1000).toFixed(1)} · max ${(s.at(-1) / 1000).toFixed(1)}`;
};
const detected = attacks.filter((r) => r.ruleId !== undefined);
const mitreOk = detected.filter((r) => String(r.triage?.mitreTechnique ?? '').includes(REF[r.ruleId] ?? '???'));
console.log(`| Metric | Value |\n|---|---|`);
console.log(`| Attack runs | ${attacks.length} |`);
console.log(`| Detection rate (incident opened) | ${detected.length}/${attacks.length} |`);
console.log(`| MTTD (attack start → incident) | ${stats(detected.map((r) => r.mttdMs))} |`);
console.log(`| Triage latency | ${stats(detected.map((r) => r.triageMs))} |`);
console.log(`| Boss proposal latency | ${stats(detected.filter((r) => r.proposalMs != null).map((r) => r.proposalMs))} |`);
console.log(`| Triage by model (not fallback) | ${detected.filter((r) => r.triageSource === 'model').length}/${detected.length} |`);
console.log(`| MITRE technique matches reference | ${mitreOk.length}/${detected.length} |`);
console.log(`| Severities | ${JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(detected, (r) => r.triage?.severity ?? 'none')).map(([k, v]) => [k, v.length])))} |`);
console.log(`| Alerts per incident | ${detected.map((r) => r.alertCount).join(', ') || 'n/a'} |`);
console.log(`| Benign runs (no attack) | ${benign.length} (${benign.reduce((a, r) => a + (r.durationS ?? 0), 0)} s observed) |`);
console.log(`| False-positive incidents | ${benign.reduce((a, r) => a + r.falsePositiveIncidents, 0)} |`);
