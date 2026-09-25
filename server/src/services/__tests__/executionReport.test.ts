import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the execution report service (issue #26).
 *
 * `../kubernetesDeploy.js` is mocked: these tests cover the report building,
 * capping, outcome/metric derivation, capture failure handling and the
 * escaping of attacker-controlled text in the renderers — no MongoDB, no
 * cluster.
 */

const { deploy } = vi.hoisted(() => {
  const deploy = {
    statuses: [] as {
      name: string;
      status: string;
      containers: { name: string; status: string }[];
    }[],
    logs: [] as { name: string; pod: string; container?: string; line: string }[],
    events: [] as { uid?: string; reason?: string; message?: string; type?: string }[],
    statusImpl: null as null | (() => Promise<unknown>),
    logsError: null as unknown,
  };
  return { deploy };
});

vi.mock('../kubernetesDeploy.js', () => ({
  buildClientFromInfrastructure: vi.fn(),
  isDeploymentSettled: vi.fn(() => true),
  getDeploymentStatus: vi.fn(async () => {
    if (deploy.statusImpl) return deploy.statusImpl();
    return { statuses: deploy.statuses, progress: 100 };
  }),
  collectNewPodLogs: vi.fn(async () => {
    if (deploy.logsError) throw deploy.logsError;
    return deploy.logs;
  }),
  collectNewNamespaceEvents: vi.fn(async () => deploy.events),
}));

const kube = await import('../kubernetesDeploy.js');
const {
  buildReport,
  buildProvisionalReport,
  collectArtifacts,
  computeOutcome,
  escapeHtml,
  escapeMarkdown,
  formatDuration,
  markdownCodeBlock,
  renderHtml,
  summarizeReport,
  renderMarkdown,
  takeTail,
  truncateBytes,
  MAX_LOG_LINES,
  MAX_TEXT_BYTES,
  runWindow,
} = await import('../executionReport.js');
type CapturedArtifacts = import('../executionReport.js').CapturedArtifacts;
type K8sClients = import('../kubernetesDeploy.js').K8sClients;

const scenario = { _id: '64b000000000000000000001', title: 'Web attack scenario' };
const startedAt = new Date('2026-09-24T10:00:00.000Z');
const completedAt = new Date('2026-09-24T10:03:05.000Z');

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64b000000000000000000002',
    executedAt: startedAt,
    executedBy: 'tester',
    status: 'running',
    namespace: 'secsim-scn-exec',
    deployedServices: [{ name: 'svc-a', status: 'pending' }],
    ...overrides,
  };
}

function makeArtifacts(overrides: Partial<CapturedArtifacts> = {}): CapturedArtifacts {
  return {
    services: [
      {
        name: 'svc-a',
        status: 'running',
        containers: [
          { name: 'svc-a', status: 'running' },
          { name: 'mmt-probe', status: 'running' },
        ],
      },
    ],
    restarts: 0,
    logs: [],
    events: [],
    captureErrors: [],
    ...overrides,
  };
}

function fakeClients(restartCounts: number[] = []): K8sClients {
  return {
    core: {
      listNamespacedPod: vi.fn(async () => ({
        items: [
          {
            status: { containerStatuses: restartCounts.map((restartCount) => ({ restartCount })) },
          },
        ],
      })),
    },
  } as unknown as K8sClients;
}

beforeEach(() => {
  deploy.statuses = [];
  deploy.logs = [];
  deploy.events = [];
  deploy.statusImpl = null;
  deploy.logsError = null;
  vi.mocked(kube.getDeploymentStatus).mockClear();
  vi.mocked(kube.collectNewPodLogs).mockClear();
  vi.mocked(kube.collectNewNamespaceEvents).mockClear();
});

describe('truncateBytes', () => {
  test('leaves text within the byte cap untouched', () => {
    expect(truncateBytes('hello', 10)).toBe('hello');
  });

  test('caps multibyte text by UTF-8 bytes without a broken trailing character', () => {
    const wide = '界'.repeat(5000); // 3 bytes each -> 15000 bytes
    const cut = truncateBytes(wide, 4096);
    expect(Buffer.byteLength(cut, 'utf8')).toBeLessThanOrEqual(4096);
    expect(cut.endsWith('[truncated]')).toBe(true);
    expect(cut).not.toContain('�');
  });
});

describe('takeTail', () => {
  test('keeps the most recent entries within the count cap', () => {
    const { kept, omitted } = takeTail([1, 2, 3, 4, 5], 2, 1_000, (n) => n);
    expect(kept).toEqual([4, 5]);
    expect(omitted).toBe(3);
  });

  test('stops at the byte budget', () => {
    const items = ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)];
    const { kept, omitted } = takeTail(items, 10, 250, (s) => s);
    expect(kept).toEqual(['b'.repeat(100), 'c'.repeat(100)]);
    expect(omitted).toBe(1);
  });

  test('handles an empty list', () => {
    expect(takeTail([], 10, 100, (x) => x)).toEqual({ kept: [], omitted: 0 });
  });
});

describe('computeOutcome', () => {
  const running = [{ name: 'svc-a', status: 'running' as const, containers: [] }];

  test('a run that failed at deploy is failed', () => {
    expect(
      computeOutcome({ priorStatus: 'failed', services: running, captured: true, partial: false })
    ).toBe('failed');
  });

  test('a failed container fails the run', () => {
    expect(
      computeOutcome({
        priorStatus: 'running',
        services: [
          {
            name: 'svc-a',
            status: 'running',
            containers: [{ name: 'mmt-probe', status: 'failed' }],
          },
        ],
        captured: true,
        partial: false,
      })
    ).toBe('failed');
  });

  test('a capture error, missing snapshot or pending workload yields partial', () => {
    const base = { priorStatus: 'running', services: running, captured: true, partial: false };
    expect(computeOutcome({ ...base, partial: true })).toBe('partial');
    expect(computeOutcome({ ...base, captured: false })).toBe('partial');
    expect(computeOutcome({ ...base, priorStatus: 'pending' })).toBe('partial');
    expect(computeOutcome({ ...base, services: [] })).toBe('partial');
    expect(
      computeOutcome({
        ...base,
        services: [{ name: 'svc-a', status: 'pending', containers: [] }],
      })
    ).toBe('partial');
  });

  test('all workloads up with a full snapshot is passed', () => {
    expect(
      computeOutcome({ priorStatus: 'running', services: running, captured: true, partial: false })
    ).toBe('passed');
  });
});

describe('buildReport', () => {
  test('records outcome, timings and derived metrics', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts({
        restarts: 3,
        logs: [
          { name: 'svc-a', pod: 'svc-a-pod', container: 'svc-a', line: 'GET / 200' },
          { name: 'svc-a', pod: 'svc-a-pod', container: 'svc-a', line: 'ERROR upstream reset' },
          {
            name: 'svc-a',
            pod: 'svc-a-pod',
            container: 'mmt-probe',
            line: JSON.stringify({ 'ip.src': '10.0.0.66', verdict: 'HTTP flood' }),
          },
          {
            name: 'svc-a',
            pod: 'svc-a-pod',
            container: 'mmt-probe',
            line: JSON.stringify({ 'ip.src': '10.0.0.66', verdict: 'HTTP flood' }),
          },
          { name: 'svc-a', pod: 'svc-a-pod', container: 'mmt-probe', line: 'ALERT port scan' },
        ],
        events: [
          { reason: 'Pulled', type: 'Normal' },
          { reason: 'BackOff', type: 'Warning' },
          { reason: 'BackOff', type: 'Warning' },
        ],
      }),
    });

    expect(report.outcome).toBe('passed');
    expect(report.durationMs).toBe(185_000);
    expect(report.startedAt).toEqual(startedAt);
    expect(report.completedAt).toEqual(completedAt);
    expect(report.provisional).toBe(false);
    expect(report.partial).toBe(false);

    expect(report.metrics.services).toEqual({
      total: 1,
      byStatus: { pending: 0, running: 1, completed: 0, failed: 0 },
    });
    expect(report.metrics.containers.total).toBe(2);
    expect(report.metrics.containers.restarts).toBe(3);
    expect(report.metrics.logs).toEqual({ lines: 5, errorLines: 1 });
    expect(report.metrics.events.total).toBe(3);
    expect(report.metrics.events.warnings).toBe(2);
    expect(report.metrics.events.byReason[0]).toEqual({ name: 'BackOff', count: 2 });
    expect(report.metrics.alerts.total).toBe(3);
    expect(report.metrics.alerts.uniqueAttackers).toBe(1);
    expect(report.metrics.alerts.byVerdict[0]).toEqual({ name: 'HTTP flood', count: 2 });

    expect(report.errorLogs).toHaveLength(1);
    expect(report.errorLogs[0].line).toBe('ERROR upstream reset');
    expect(report.alerts).toHaveLength(3);
    expect(report.alerts[0].attacker).toBe('10.0.0.66');
  });

  test('caps logs by count and each line by bytes; metrics still count every line', () => {
    const logs = Array.from({ length: MAX_LOG_LINES + 500 }, (_, i) => ({
      name: 'svc-a',
      pod: 'svc-a-pod',
      line: `line ${i}`,
    }));
    logs[logs.length - 1].line = 'x'.repeat(10_000);

    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts({ logs }),
    });

    expect(report.logs).toHaveLength(MAX_LOG_LINES);
    expect(report.omitted.logs).toBe(500);
    expect(report.metrics.logs.lines).toBe(MAX_LOG_LINES + 500);
    // Most recent lines are kept.
    expect(report.logs[0].line).toBe('line 500');
    const last = report.logs[report.logs.length - 1].line;
    expect(Buffer.byteLength(last, 'utf8')).toBeLessThanOrEqual(MAX_TEXT_BYTES);
    expect(last.endsWith('[truncated]')).toBe(true);
  });

  test('capture errors mark the report partial', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts({ captureErrors: ['logs: cluster unreachable'] }),
    });
    expect(report.partial).toBe(true);
    expect(report.outcome).toBe('partial');
    expect(report.captureErrors).toEqual(['logs: cluster unreachable']);
  });

  test('never serializes fields outside the whitelist (no credentials)', () => {
    const secret = 'super-secret-bearer-token';
    const report = buildReport({
      scenario: {
        ...scenario,
        infrastructureId: { credentials: { encrypted: secret }, endpoint: 'https://k8s' },
      } as unknown as typeof scenario,
      execution: makeExecution({ credentials: secret, token: secret }),
      completedAt,
      artifacts: makeArtifacts(),
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('credentials');
    expect(renderHtml(report)).not.toContain(secret);
    expect(renderMarkdown(report)).not.toContain(secret);
  });

  test('a forced failed outcome carries the truncated deploy error', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution({ status: 'failed', deployedServices: [] }),
      completedAt,
      artifacts: null,
      error: 'e'.repeat(10_000),
      outcome: 'failed',
    });
    expect(report.outcome).toBe('failed');
    expect(Buffer.byteLength(report.error ?? '', 'utf8')).toBeLessThanOrEqual(MAX_TEXT_BYTES);
    expect(report.services).toEqual([]);
  });
});

describe('buildProvisionalReport', () => {
  test('builds from the embedded execution only', () => {
    const report = buildProvisionalReport(
      scenario,
      makeExecution({
        deployedServices: [
          { name: 'svc-a', status: 'running' },
          { name: 'svc-a', status: 'running' }, // sidecar row sharing the host name
          { status: 'running' }, // unnamed row is skipped
        ],
      })
    );
    expect(report.provisional).toBe(true);
    expect(report.outcome).toBe('partial');
    expect(report.completedAt).toBeUndefined();
    expect(report.durationMs).toBeUndefined();
    expect(report.services).toEqual([{ name: 'svc-a', status: 'running', containers: [] }]);
    expect(report.logs).toEqual([]);
  });

  test('says whether the run is still open or closed without a report', () => {
    const open = buildProvisionalReport(scenario, makeExecution());
    expect(renderMarkdown(open)).toContain('has not been closed yet');
    const closed = buildProvisionalReport(scenario, makeExecution({ status: 'completed' }));
    expect(renderMarkdown(closed)).toContain('no report was captured when this run closed');
    expect(renderHtml(closed)).toContain('no report was captured when this run closed');
  });

  test('keeps the outcome and close time stamped on the execution', () => {
    const report = buildProvisionalReport(
      scenario,
      makeExecution({ status: 'failed', outcome: 'failed', completedAt })
    );
    expect(report.outcome).toBe('failed');
    expect(report.durationMs).toBe(185_000);
  });
});

describe('collectArtifacts', () => {
  test('reads status, restarts, full logs and events', async () => {
    deploy.statuses = [{ name: 'svc-a', status: 'running', containers: [] }];
    deploy.logs = [{ name: 'svc-a', pod: 'p', line: 'hello' }];
    deploy.events = [{ uid: 'e1', reason: 'Pulled' }];

    const result = await collectArtifacts(fakeClients([2, 1]), {
      namespace: 'ns',
      names: ['svc-a', 'svc-a'],
    });

    expect(result.services).toEqual(deploy.statuses);
    expect(result.restarts).toBe(3);
    expect(result.logs).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.captureErrors).toEqual([]);
    // Names are deduplicated; a fresh `seen` map means the full log is read.
    const logCall = vi.mocked(kube.collectNewPodLogs).mock.calls[0][1];
    expect(logCall.names).toEqual(['svc-a']);
    expect(logCall.seen.size).toBe(0);
  });

  test('a failing step is recorded and the other steps still run', async () => {
    deploy.statuses = [{ name: 'svc-a', status: 'running', containers: [] }];
    deploy.logsError = new Error('pod log read failed');
    deploy.events = [{ uid: 'e1', reason: 'Pulled' }];

    const result = await collectArtifacts(fakeClients(), { namespace: 'ns', names: ['svc-a'] });

    expect(result.captureErrors).toEqual(['logs: pod log read failed']);
    expect(result.services).toHaveLength(1);
    expect(result.events).toHaveLength(1);

    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: result,
    });
    expect(report.partial).toBe(true);
    expect(report.outcome).toBe('partial');
  });

  test('skips workload reads when nothing was deployed', async () => {
    deploy.events = [{ uid: 'e1', reason: 'FailedCreate', type: 'Warning' }];

    const result = await collectArtifacts(fakeClients(), { namespace: 'ns', names: [] });

    expect(kube.getDeploymentStatus).not.toHaveBeenCalled();
    expect(kube.collectNewPodLogs).not.toHaveBeenCalled();
    expect(result.services).toBeNull();
    expect(result.events).toHaveLength(1);
  });

  test('gives up after the timeout and reports it', async () => {
    deploy.statusImpl = () => new Promise(() => {}); // never settles

    const started = Date.now();
    const result = await collectArtifacts(fakeClients(), { namespace: 'ns', names: ['svc-a'] }, 20);

    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.captureErrors).toEqual(['capture timed out after 20ms']);
    expect(result.services).toBeNull();
  });
});

describe('renderers', () => {
  const hostile = '<script>alert(1)</script>';

  function hostileReport() {
    return buildReport({
      scenario: { ...scenario, title: `Title ${hostile}` },
      execution: makeExecution({ conclusion: { text: `done ${hostile}` } }),
      completedAt,
      artifacts: makeArtifacts({
        logs: [
          { name: 'svc-a', pod: 'svc-a-pod', line: `payload ${hostile} "quoted" 'single' & amp` },
          { name: 'svc-a', pod: 'svc-a-pod', line: 'fence ``` break ```` out' },
          {
            name: 'svc-a',
            pod: 'svc-a-pod',
            line: JSON.stringify({ 'ip.src': '10.0.0.66', verdict: `a|b\nc ${hostile}` }),
          },
        ],
        events: [{ reason: 'Evil|Reason', message: `msg ${hostile}\nnext`, type: 'Warning' }],
      }),
    });
  }

  test('escapeHtml escapes & < > " \'', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });

  test('HTML output escapes attacker text and contains no script', () => {
    const html = renderHtml(hostileReport());
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).toContain('&#39;single&#39;');
    expect(html).toContain('<style>');
    expect(html).toContain('outcome-passed');
  });

  test('escapeMarkdown collapses newlines and escapes markup and pipes', () => {
    expect(escapeMarkdown('a|b\nc <x> *y* `z`')).toBe('a\\|b c \\<x\\> \\*y\\* \\`z\\`');
    expect(escapeMarkdown(undefined)).toBe('—');
  });

  test('markdownCodeBlock uses a fence longer than any backtick run', () => {
    const block = markdownCodeBlock('a ``` b ```` c');
    expect(block.startsWith('`````\n')).toBe(true);
    expect(block.endsWith('\n`````')).toBe(true);
  });

  test('Markdown output keeps attacker text inert', () => {
    const md = renderMarkdown(hostileReport());
    // Table cells: pipes escaped, newlines collapsed, raw HTML escaped.
    expect(md).toContain('a\\|b c \\<script\\>alert(1)\\</script\\>');
    expect(md).toContain('Evil\\|Reason');
    // Outside fenced code blocks (whose content is literal) no raw HTML survives.
    const outsideFences = md.replace(/(`{3,})\n[\s\S]*?\n\1(?!`)/g, '');
    expect(outsideFences).not.toMatch(/(^|[^\\])<script>/);
    // The log fence outlasts the 4-backtick run inside the log.
    expect(md).toContain('`````\n');
    expect(md).toContain('**PASSED**');
  });

  test('every report carries a generated conclusion, even without an analyst note', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts({
        logs: [
          {
            name: 'svc-a',
            pod: 'svc-a-pod',
            line: JSON.stringify({ 'ip.src': '10.0.0.66', verdict: 'SYN flood' }),
          },
        ],
      }),
    });
    expect(report.conclusion).toBeUndefined();
    const { verdict, findings } = summarizeReport(report);
    expect(verdict).toMatch(/^The run passed/);
    expect(findings.join(' ')).toContain('1 security alert from 1 distinct attacker');
    expect(renderMarkdown(report)).toContain('## Conclusion');
    expect(renderMarkdown(report)).not.toContain('### Analyst note');
    const html = renderHtml(report);
    expect(html).toContain('[ Conclusion ]');
    expect(html).toContain(escapeHtml(verdict));
  });

  test('the analyst note is rendered under the generated conclusion', () => {
    const report = hostileReport();
    expect(renderMarkdown(report)).toContain('### Analyst note');
    expect(renderHtml(report)).toContain('Analyst note');
  });

  test('formatDuration renders compact durations', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(185_000)).toBe('3m 05s');
    expect(formatDuration(3_723_000)).toBe('1h 02m 03s');
  });
});

describe('observability section (issue #25)', () => {
  const vector = (result: { metric: Record<string, string>; value: number }[]) =>
    JSON.stringify({
      status: 'success',
      data: {
        resultType: 'vector',
        result: result.map((r) => ({ metric: r.metric, value: [0, String(r.value)] })),
      },
    });
  const hostile = '<img src=x onerror=alert(1)>';

  /** svc-a probed at 97.5 % / 20 ms; a pushed span series names an undeployed service. */
  const get = vi.fn(async (path: string) => {
    const query = decodeURIComponent(path.split('query=')[1]);
    const url = { http_url: 'http://svc-a:8080/' };
    if (query.startsWith('(sum by (http_url)'))
      return { status: 200, body: vector([{ metric: url, value: 1 }]) };
    if (query.startsWith('avg_over_time(((sum'))
      return { status: 200, body: vector([{ metric: url, value: 0.975 }]) };
    if (query.startsWith('avg_over_time(httpcheck_duration'))
      return { status: 200, body: vector([{ metric: url, value: 20 }]) };
    if (query.startsWith('sum by (service_name) (rate(traces') && !query.includes('/'))
      return { status: 200, body: vector([{ metric: { service_name: hostile }, value: 9 }]) };
    return { status: 200, body: vector([]) };
  });

  test('bounds the query window to the run, between a minute and a day', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(runWindow(new Date('2026-09-24T11:59:50Z'), now)).toBe('60s');
    expect(runWindow(new Date('2026-09-24T11:00:00Z'), now)).toBe('3600s');
    expect(runWindow(new Date('2026-09-20T00:00:00Z'), now)).toBe('86400s');
    expect(runWindow(undefined, now)).toBe('60s');
  });

  test('collects health for deployed components only, over the given window', async () => {
    deploy.statuses = [{ name: 'svc-a', status: 'running', containers: [] }];
    const result = await collectArtifacts(fakeClients(), {
      namespace: 'ns',
      names: ['svc-a'],
      traffic: { get, window: '185s' },
    });

    expect(result.traffic).toEqual([
      { service: 'svc-a', probe: 'http', up: true, availability: 0.975, probeLatencyMs: 20 },
    ]);
    expect(get.mock.calls.some(([path]) => decodeURIComponent(path).includes('[185s'))).toBe(true);
    expect(result.captureErrors).toEqual([]);
  });

  test('an unreachable stack is a capture error, not a failed capture', async () => {
    deploy.statuses = [{ name: 'svc-a', status: 'running', containers: [] }];
    const result = await collectArtifacts(fakeClients(), {
      namespace: 'ns',
      names: ['svc-a'],
      traffic: { get: async () => ({ status: 503, body: '' }), window: '60s' },
    });
    expect(result.traffic).toBeUndefined();
    expect(result.services).toHaveLength(1);
    expect(result.captureErrors).toEqual(['observability: Prometheus query failed (HTTP 503)']);
  });

  test('renders a component health table in both formats, escaped', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts({
        traffic: [
          { service: 'svc-a', probe: 'http', up: false, availability: 0.5, probeLatencyMs: 20 },
          { service: hostile, requestRate: 4.2, errorRate: 0.1, latencyP95Ms: 180 },
        ],
      }),
    });

    const md = renderMarkdown(report);
    expect(md).toContain('## Component health');
    expect(md).toMatch(/svc-a \| HTTP · down \| 50\.0% \| 20 ms/);
    expect(md).toMatch(/4\.20 \| 10\.0% \| 180 ms/);

    const html = renderHtml(report);
    expect(html).toContain('Component health');
    expect(html).not.toContain(hostile);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('omits the section for runs without the stack', () => {
    const report = buildReport({
      scenario,
      execution: makeExecution(),
      completedAt,
      artifacts: makeArtifacts(),
    });
    expect(report).not.toHaveProperty('traffic');
    expect(renderMarkdown(report)).not.toContain('Component health');
    expect(renderHtml(report)).not.toContain('Component health');
  });
});
