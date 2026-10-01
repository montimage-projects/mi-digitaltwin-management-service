import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExecutionPanel } from './ExecutionPanel';
import { scenariosApi, type Execution } from '@/lib/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const closedExecution: Execution = {
  _id: 'exec-1',
  executedAt: '2026-09-24T10:00:00.000Z',
  executedBy: 'tester',
  status: 'completed',
  deployedServices: [],
  completedAt: '2026-09-24T10:03:05.000Z',
  durationMs: 185_000,
  outcome: 'passed',
};

function renderPanel(executions: Execution[] = [closedExecution]) {
  return render(
    <ExecutionPanel
      scenarioId="scenario-1"
      scenarioTitle="Scenario"
      executions={executions}
      open
      onOpenChange={vi.fn()}
    />,
    { wrapper: createWrapper() }
  );
}

describe('ExecutionPanel report action (issue #26)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the recorded outcome and run duration', () => {
    renderPanel();

    expect(screen.getByText('passed')).toBeInTheDocument();
    expect(screen.getByText(/ran 3m 05s/)).toBeInTheDocument();
  });

  it('omits outcome and duration for a run that has not closed', () => {
    renderPanel([
      {
        ...closedExecution,
        status: 'running',
        completedAt: undefined,
        durationMs: undefined,
        outcome: undefined,
      },
    ]);

    expect(screen.queryByText('passed')).not.toBeInTheDocument();
    expect(screen.queryByText(/ran /)).not.toBeInTheDocument();
  });

  it('downloads the report in the chosen format', async () => {
    const getReport = vi
      .spyOn(scenariosApi, 'getReport')
      .mockResolvedValue(new Blob(['# report'], { type: 'text/markdown' }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPanel();

    const trigger = screen.getByRole('button', { name: /Download report for execution/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Markdown' }));

    await vi.waitFor(() => {
      expect(getReport).toHaveBeenCalledWith('scenario-1', 'exec-1', 'md');
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
    });
  });
});
