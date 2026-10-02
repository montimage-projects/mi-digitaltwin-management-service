import type { MmtAlert } from './mmt-report.js';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Triage {
  severity: Severity;
  mitreTechnique: string;
  confidence: number;
  falsePositiveLikelihood: 'low' | 'medium' | 'high';
  summary: string;
  recommendedAction: string;
}

/**
 * One incident = all alerts of the same rule from the same attacker against
 * the same service, until the source has been quiet for `gapMs`. A flood
 * produces hundreds of identical detections; the Monitor reasons once per
 * incident, not once per packet.
 */
export interface Incident {
  id: string;
  executionId: string;
  ruleId: number;
  cause: string;
  verdict: string;
  srcIp?: string;
  dstIp?: string;
  dstPort?: number;
  /** Workload (service) whose monitor sidecar reported the alerts. */
  service: string;
  firstSeen: string;
  lastSeen: string;
  alertCount: number;
  /** Wall-clock time the incident was opened by the Monitor (for MTTD). */
  openedAt: string;
  status: 'triaging' | 'triaged' | 'proposed' | 'error';
  triage?: Triage;
  /** 'fallback' when the model failed and the deterministic triage was used. */
  triageSource?: 'model' | 'fallback';
  triagedAt?: string;
  /** Boss Agent's proposed response (proposal only — nothing is executed). */
  proposal?: string;
  proposedAt?: string;
  error?: string;
}

let counter = 0;

export class IncidentAggregator {
  private readonly open = new Map<string, Incident>();
  /** Wall-clock ms of each open incident's latest alert (drives the quiet gap). */
  private readonly lastAlertAt = new Map<string, number>();

  constructor(
    private readonly executionId: string,
    private readonly gapMs = 30_000
  ) {}

  /** Fold an alert into an incident; `isNew` is true when one was opened. */
  add(alert: MmtAlert, service: string, now = Date.now()): { incident: Incident; isNew: boolean } {
    const key = `${alert.ruleId}|${alert.srcIp ?? '?'}|${service}`;
    const current = this.open.get(key);
    const previous = this.lastAlertAt.get(key);
    this.lastAlertAt.set(key, now);
    if (current && previous !== undefined && now - previous <= this.gapMs) {
      current.alertCount += 1;
      current.lastSeen = alert.timestamp;
      return { incident: current, isNew: false };
    }
    const incident: Incident = {
      id: `inc-${now.toString(36)}-${(counter++).toString(36)}`,
      executionId: this.executionId,
      ruleId: alert.ruleId,
      cause: alert.cause,
      verdict: alert.verdict,
      srcIp: alert.srcIp,
      dstIp: alert.dstIp,
      dstPort: alert.dstPort,
      service,
      firstSeen: alert.timestamp,
      lastSeen: alert.timestamp,
      alertCount: 1,
      openedAt: new Date(now).toISOString(),
      status: 'triaging',
    };
    this.open.set(key, incident);
    return { incident, isNew: true };
  }
}
