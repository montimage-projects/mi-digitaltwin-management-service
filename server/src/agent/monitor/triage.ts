import { z } from 'zod';
import { env } from '../../config/env.js';
import { getLLMGateway } from '../index.js';
import type { Incident, Triage } from './incidents.js';
import { ruleInfo } from './rules.js';

export const MONITOR_SYSTEM_PROMPT = `You are the Monitor agent of a cybersecurity digital twin.
You triage incidents raised by the MMT intrusion-detection probe for a human operator.
Rules:
- Base your assessment only on the incident facts and rule reference you are given.
- severity: low | medium | high | critical, considering the attack type, volume and the targeted service.
- mitreTechnique: the MITRE ATT&CK technique id and name (use the rule reference when it fits).
- confidence: 0..1, your confidence that this is a real attack.
- falsePositiveLikelihood: low | medium | high.
- summary: at most two sentences for the operator.
- recommendedAction: one short sentence (a proposal; you never execute anything).`;

const triageSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  mitreTechnique: z.string().min(1),
  confidence: z.number().min(0).max(1),
  falsePositiveLikelihood: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  recommendedAction: z.string().min(1),
});

/** JSON schema handed to the model (Ollama structured outputs). */
export const TRIAGE_JSON_SCHEMA = z.toJSONSchema(triageSchema);

/** Facts the model sees: the incident, without bookkeeping fields. */
export function incidentFacts(incident: Incident) {
  const rule = ruleInfo(incident.ruleId);
  return {
    rule: {
      id: incident.ruleId,
      cause: incident.cause,
      verdict: incident.verdict,
      reference: rule ?? 'unknown rule',
    },
    attacker: incident.srcIp ?? 'unknown',
    target: { service: incident.service, ip: incident.dstIp, port: incident.dstPort },
    alertCount: incident.alertCount,
    firstSeen: incident.firstSeen,
    lastSeen: incident.lastSeen,
  };
}

export async function triageIncident(incident: Incident): Promise<Triage> {
  const raw = await getLLMGateway().chatJson<unknown>(
    [
      { role: 'system', content: MONITOR_SYSTEM_PROMPT },
      { role: 'user', content: `Incident:\n${JSON.stringify(incidentFacts(incident), null, 2)}` },
    ],
    TRIAGE_JSON_SCHEMA,
    env.MONITOR_MODEL || env.OLLAMA_MODEL
  );
  return triageSchema.parse(raw);
}

/** Deterministic triage used when the model is unavailable or returns garbage. */
export function fallbackTriage(incident: Incident): Triage {
  const rule = ruleInfo(incident.ruleId);
  return {
    severity: 'high',
    mitreTechnique: rule?.mitre ?? 'unknown',
    confidence: 0.5,
    falsePositiveLikelihood: 'medium',
    summary: `${rule?.name ?? `MMT rule ${incident.ruleId}`} from ${incident.srcIp ?? 'an unknown source'} against ${incident.service} (${incident.alertCount} alerts). Automatic fallback triage: the Monitor model was unavailable.`,
    recommendedAction: 'Review the alerts and consider blocking the source address.',
  };
}
