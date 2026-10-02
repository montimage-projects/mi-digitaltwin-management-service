/**
 * Deterministic parser for MMT security reports (format id 10), as emitted by
 * the MMT monitor (secAnoD sidecar) on stdout / Kafka:
 *
 *   [10, probeId, source, timestamp, ruleId, verdict, type, cause, history]
 *
 * `history` holds the events that matched the rule; the attacker / victim
 * addresses sit in their attributes (`ip.src`, `ip.dst`, `tcp.dest_port`…),
 * nested at varying depth, so they are searched recursively.
 */
export interface MmtAlert {
  probeId: number | string;
  source: string;
  /** ISO time of the detection (from the report's epoch seconds). */
  timestamp: string;
  ruleId: number;
  verdict: string;
  type: string;
  cause: string;
  srcIp?: string;
  dstIp?: string;
  dstPort?: number;
}

const MMT_SECURITY_FORMAT = 10;

/** Find the first value for any of `keys` in a nested object/array structure. */
function findAttribute(node: unknown, keys: string[], depth = 0): unknown {
  if (depth > 6 || node === null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    // MMT attributes are often [name, value] pairs.
    if (node.length === 2 && typeof node[0] === 'string' && keys.includes(node[0])) return node[1];
    for (const item of node) {
      const found = findAttribute(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  for (const value of Object.values(obj)) {
    const found = findAttribute(value, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

const asString = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asPort = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined;
};

/** Parse one log line; returns null when it is not an MMT security report. */
export function parseMmtReport(line: string): MmtAlert | null {
  const start = line.indexOf('[');
  if (start < 0) return null;
  let report: unknown;
  try {
    report = JSON.parse(line.slice(start));
  } catch {
    return null;
  }
  if (!Array.isArray(report) || report.length < 8 || report[0] !== MMT_SECURITY_FORMAT) return null;
  const [, probeId, source, ts, ruleId, verdict, type, cause, history] = report;
  if (typeof ruleId !== 'number' || typeof verdict !== 'string') return null;
  const seconds = typeof ts === 'number' ? ts : Number(ts);
  return {
    probeId: typeof probeId === 'number' || typeof probeId === 'string' ? probeId : String(probeId),
    source: String(source ?? ''),
    timestamp: new Date(Number.isFinite(seconds) ? seconds * 1000 : Date.now()).toISOString(),
    ruleId,
    verdict,
    type: String(type ?? ''),
    cause: String(cause ?? ''),
    srcIp: asString(findAttribute(history, ['ip.src', 'ip_src', 'src_ip'])),
    dstIp: asString(findAttribute(history, ['ip.dst', 'ip_dst', 'dst_ip'])),
    dstPort: asPort(findAttribute(history, ['tcp.dest_port', 'tcp.dst_port', 'udp.dest_port'])),
  };
}
