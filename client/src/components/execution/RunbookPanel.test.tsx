import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RunbookPanel, expectationMet, type RunbookLogLine } from './RunbookPanel';
import type { RunbookStep } from '@/lib/api';

const attackStep: RunbookStep = {
  id: 'attack-1',
  title: 'Attack #1',
  profile: { nodeId: 'mag', name: 'attack-1-stop-the-server' },
  commands: ['kubectl exec -it deploy/mag -n ns -- mag'],
  expect: [
    { label: 'CI-SIM stops', source: 'log', container: 'ci-sim', pattern: 'service stopped' },
    { label: 'secAnoD detects', source: 'alert', container: 'secanod' },
  ],
};

function props(overrides: Partial<Parameters<typeof RunbookPanel>[0]> = {}) {
  return {
    steps: [attackStep],
    isLoading: false,
    logs: [],
    alerts: [],
    live: true,
    runProfile: vi.fn(),
    isRunning: false,
    openInterface: vi.fn(),
    copy: vi.fn(),
    ...overrides,
  };
}

describe('RunbookPanel', () => {
  it('only counts events received after the step started', () => {
    const logs: RunbookLogLine[] = [
      { service: 'ci-sim', container: 'ci-sim', line: 'service stopped', at: 100 },
    ];
    const expectation = attackStep.expect![0];
    expect(expectationMet(expectation, 50, logs, [])).toBe(true);
    expect(expectationMet(expectation, 150, logs, [])).toBe(false);
    expect(expectationMet({ ...expectation, container: 'mag' }, 50, logs, [])).toBe(false);
  });

  it('runs the step profile and checks off beats as they arrive', () => {
    const p = props();
    const { rerender } = render(<RunbookPanel {...p} />);
    const beat = screen.getByTestId('runbook-expect-attack-1-0');
    expect(beat).toHaveAttribute('data-met', 'false');

    fireEvent.click(screen.getByTestId('runbook-run-attack-1'));
    expect(p.runProfile).toHaveBeenCalledWith(attackStep.profile);

    rerender(
      <RunbookPanel
        {...p}
        logs={[
          { service: 'ci-sim', container: 'ci-sim', line: 'service stopped', at: Date.now() + 1 },
        ]}
      />
    );
    expect(screen.getByTestId('runbook-expect-attack-1-0')).toHaveAttribute('data-met', 'true');
    expect(screen.getByTestId('runbook-expect-attack-1-1')).toHaveAttribute('data-met', 'false');
  });

  it('copies a command on click', () => {
    const p = props();
    render(<RunbookPanel {...p} />);
    fireEvent.click(screen.getByText('kubectl exec -it deploy/mag -n ns -- mag'));
    expect(p.copy).toHaveBeenCalledWith('kubectl exec -it deploy/mag -n ns -- mag');
  });
});
