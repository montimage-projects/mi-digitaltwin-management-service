import { getLLMGateway, getRAGRetriever } from '../index.js';
import { BOSS_AGENT_SYSTEM_PROMPT, buildRagContextPrompt } from '../prompts.js';
import type { Incident } from './incidents.js';
import { incidentFacts } from './triage.js';
import { ruleInfo } from './rules.js';

/**
 * Hand-off Monitor → Boss: the Boss Agent proposes a response grounded in the
 * service catalog (RAG). Proposal only — nothing is executed (Step 1).
 */
export async function proposeResponse(incident: Incident): Promise<string> {
  const retriever = getRAGRetriever();
  const query = `respond to ${ruleInfo(incident.ruleId)?.name ?? incident.cause} attack: block the attacker, security orchestration and response`;
  const retrieved = await retriever.retrieveSimilar(query, 4);
  return getLLMGateway().chat([
    { role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT },
    { role: 'system', content: buildRagContextPrompt(retriever.formatContextForPrompt(retrieved)) },
    {
      role: 'user',
      content:
        `The Monitor agent reports this incident:\n${JSON.stringify({ ...incidentFacts(incident), triage: incident.triage }, null, 2)}\n\n` +
        'Propose a response for the human operator: which catalog service should act and how, and what to verify afterwards. ' +
        'This is a proposal awaiting human approval; do not claim anything was executed. At most 6 lines.',
    },
  ]);
}
