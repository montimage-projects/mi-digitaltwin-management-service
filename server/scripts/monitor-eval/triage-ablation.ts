/**
 * Triage ablation: replay real incidents through the Monitor triage with and
 * without the rule's reference metadata (incl. MITRE) in the prompt.
 *   cd server && MONITOR_MODEL=qwen3:4b npx tsx --env-file=.env \
 *     scripts/monitor-eval/triage-ablation.ts [--reps=5] [--conditions=full,no-mitre,none] [--out=…]
 * Input: results/attack-incident-audit.json (incidents recorded by live runs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triageIncident } from '../../src/agent/monitor/triage.js';
import type { Incident } from '../../src/agent/monitor/incidents.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const REPS = Number(arg('reps', '5'));
const OUT = arg('out', join(HERE, 'results', 'triage-ablation.json'));
// full = name+description+MITRE · no-mitre = name+description · none = MMT cause text only
const CONDITIONS = arg('conditions', 'full,none').split(',');
const OPTS: Record<string, { withReference: boolean; withMitre: boolean }> = {
  full: { withReference: true, withMitre: true },
  'no-mitre': { withReference: true, withMitre: false },
  none: { withReference: false, withMitre: false },
};
const audit = JSON.parse(readFileSync(join(HERE, 'results', 'attack-incident-audit.json'), 'utf8')) as {
  incidents: Incident[];
}[];
const incidents = audit.flatMap((r) => r.incidents);
const rows: Record<string, unknown>[] = [];
for (const condition of CONDITIONS) {
  for (const incident of incidents) {
    for (let rep = 1; rep <= REPS; rep++) {
      const t0 = Date.now();
      try {
        const t = await triageIncident(incident, OPTS[condition]);
        rows.push({ condition, incident: incident.id, rep, ms: Date.now() - t0, ...t });
      } catch (error) {
        rows.push({ condition, incident: incident.id, rep, ms: Date.now() - t0, error: String(error) });
      }
      process.stdout.write('.');
    }
  }
}
writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log(`\n${rows.length} triages → ${OUT}`);
for (const condition of CONDITIONS) {
  const R = rows.filter((r) => r.condition === condition);
  const count = (f: (r: Record<string, unknown>) => string) =>
    JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(R, f)).map(([k, v]) => [k, v!.length])));
  const ms = R.map((r) => r.ms as number).sort((a, b) => a - b);
  console.log(`\n== ${condition} (n=${R.length})`);
  console.log(' exact T1499.001:', R.filter((r) => String(r.mitreTechnique).includes('T1499.001')).length);
  console.log(' T1499 family   :', R.filter((r) => String(r.mitreTechnique).includes('T1499')).length);
  console.log(' technique ids  :', count((r) => String(r.mitreTechnique).match(/T\d{4}(\.\d{3})?/)?.[0] ?? 'none'));
  console.log(' severity       :', count((r) => String(r.severity)));
  console.log(' FP likelihood  :', count((r) => String(r.falsePositiveLikelihood)));
  console.log(' errors         :', R.filter((r) => r.error).length, `| median latency ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)} s`);
}
