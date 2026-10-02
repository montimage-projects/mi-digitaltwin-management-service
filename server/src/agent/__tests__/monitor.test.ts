import { describe, expect, it, vi } from 'vitest';
import { parseMmtReport } from '../monitor/mmt-report.js';
import { IncidentAggregator, type Incident } from '../monitor/incidents.js';
import { MonitorService } from '../monitor/monitor-service.js';
import { fallbackTriage } from '../monitor/triage.js';

// Shape of a real secAnoD/MMT security report (format id 10).
const REPORT =
  '[10,3,"eth0",1790926937.183873,56,"detected","attack","Probable SYN flooding attack (Half TCP handshake without TCP RST)",' +
  '{"event_1":{"timestamp":1790926937.182,"description":"SYN","attributes":[["ip.src","10.244.0.15"],["ip.dst","10.244.0.12"],["tcp.dest_port",8080]]}}]';

describe('parseMmtReport', () => {
  it('parses a format-10 security report and its nested attributes', () => {
    expect(parseMmtReport(`secanod | ${REPORT}`)).toMatchObject({
      ruleId: 56,
      verdict: 'detected',
      type: 'attack',
      cause: expect.stringContaining('SYN flooding'),
      srcIp: '10.244.0.15',
      dstIp: '10.244.0.12',
      dstPort: 8080,
      timestamp: new Date(1790926937.183873 * 1000).toISOString(),
    });
  });

  it('ignores other lines and other MMT report formats', () => {
    expect(parseMmtReport('GET / 200')).toBeNull();
    expect(parseMmtReport('[100,3,"eth0",1790926937,"stats"]')).toBeNull();
    expect(parseMmtReport('[10, not json')).toBeNull();
  });
});

describe('IncidentAggregator', () => {
  const alert = parseMmtReport(REPORT)!;

  it('folds a flood into one incident until the source is quiet', () => {
    const agg = new IncidentAggregator('exec', 30_000);
    const first = agg.add(alert, 'ci-sim', 0);
    expect(first.isNew).toBe(true);
    for (let t = 1000; t <= 20_000; t += 1000)
      expect(agg.add(alert, 'ci-sim', t).isNew).toBe(false);
    expect(first.incident.alertCount).toBe(21);
    expect(agg.add(alert, 'ci-sim', 60_000).isNew).toBe(true); // quiet for 40 s
  });

  it('separates attackers', () => {
    const agg = new IncidentAggregator('exec');
    agg.add(alert, 'ci-sim', 0);
    expect(agg.add({ ...alert, srcIp: '10.0.0.9' }, 'ci-sim', 10).isNew).toBe(true);
  });
});

describe('MonitorService.ingest', () => {
  it('opens one incident per flood, triages it, then asks the Boss for a proposal', async () => {
    const triage = vi.fn(async (i: Incident) => ({
      ...fallbackTriage(i),
      severity: 'critical' as const,
    }));
    const propose = vi.fn(async () => 'Use AI4SOAR to block 10.244.0.15 on CI-SIM.');
    const service = new MonitorService({ triage, propose });

    const opened = service.ingest('exec', [
      { name: 'ci-sim', line: 'starting probe' },
      { name: 'ci-sim', line: REPORT },
      { name: 'ci-sim', line: REPORT },
    ]);
    expect(opened).toHaveLength(1);
    await vi.waitFor(() => expect(service.list('exec')[0].status).toBe('proposed'));
    const [incident] = service.list('exec');
    expect(incident).toMatchObject({
      alertCount: 2,
      triageSource: 'model',
      triage: { severity: 'critical' },
    });
    expect(incident.proposal).toContain('AI4SOAR');
    expect(triage).toHaveBeenCalledTimes(1);
  });

  it('falls back to deterministic triage when the model fails', async () => {
    const service = new MonitorService({
      triage: async () => {
        throw new Error('model offline');
      },
      propose: async () => 'proposal',
    });
    service.ingest('exec', [{ name: 'ci-sim', line: REPORT }]);
    await vi.waitFor(() => expect(service.list('exec')[0].status).toBe('proposed'));
    expect(service.list('exec')[0]).toMatchObject({
      triageSource: 'fallback',
      triage: { mitreTechnique: expect.stringContaining('T1499.001') },
    });
  });
});
