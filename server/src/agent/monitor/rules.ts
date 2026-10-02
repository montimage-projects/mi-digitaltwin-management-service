/**
 * Reference metadata for the MMT rules enabled in the SECASSURED demo
 * (security.exclude-rules keeps 20, 51 and 56). Used to ground the Monitor's
 * triage and as the expected MITRE label when evaluating it.
 */
export interface MmtRuleInfo {
  name: string;
  description: string;
  /** Reference MITRE ATT&CK technique. */
  mitre: string;
}

export const MMT_RULES: Record<number, MmtRuleInfo> = {
  20: {
    name: 'ICMP flood',
    description: 'Large volume of ICMP echo requests towards one host.',
    mitre: 'T1498.001 Network Denial of Service: Direct Network Flood',
  },
  51: {
    name: 'Ping of death',
    description: 'Oversized / malformed ICMP packets meant to crash the target stack.',
    mitre: 'T1499.004 Endpoint Denial of Service: Application or System Exploitation',
  },
  56: {
    name: 'SYN flooding',
    description: 'Half-open TCP handshakes (SYN without completion) exhausting the target.',
    mitre: 'T1499.001 Endpoint Denial of Service: OS Exhaustion Flood',
  },
};

export function ruleInfo(ruleId: number): MmtRuleInfo | undefined {
  return MMT_RULES[ruleId];
}
