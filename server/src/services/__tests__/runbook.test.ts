import { describe, test, expect } from 'vitest';
import { fillPlaceholders, renderRunbook } from '../runbook.js';

const ctx = {
  namespace: 'secsim-a-b',
  pods: { mag: { pod: 'mag-123', ip: '10.244.0.7' } },
};

describe('runbook rendering', () => {
  test('fills namespace, pod and IP placeholders; unknown nodes become hints', () => {
    expect(fillPlaceholders('kubectl exec {{pod:mag}} -n {{namespace}}', ctx)).toBe(
      'kubectl exec mag-123 -n secsim-a-b'
    );
    expect(fillPlaceholders('block {{ip:mag}} / {{ip:ci-sim}}', ctx)).toBe(
      'block 10.244.0.7 / <ip:ci-sim>'
    );
  });

  test('renders every text field of every step', () => {
    const [step] = renderRunbook(
      {
        steps: [
          {
            id: 's1',
            title: 'Attack {{namespace}}',
            commands: ['kubectl get pods -n {{namespace}}'],
            expect: [{ label: 'blocks {{ip:mag}}', source: 'log', pattern: 'blocked {{ip:mag}}' }],
          },
        ],
      },
      ctx
    );
    expect(step.title).toBe('Attack secsim-a-b');
    expect(step.commands).toEqual(['kubectl get pods -n secsim-a-b']);
    expect(step.expect?.[0]).toMatchObject({
      label: 'blocks 10.244.0.7',
      pattern: 'blocked 10.244.0.7',
    });
    expect(renderRunbook(undefined, ctx)).toEqual([]);
  });
});
