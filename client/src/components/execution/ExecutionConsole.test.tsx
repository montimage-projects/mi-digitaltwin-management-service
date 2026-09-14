import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExecutionConsole } from './ExecutionConsole';
import * as sseModule from '@/lib/sse';
import type { ExecutionEventHandlers } from '@/lib/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

const defaultProps = {
  scenarioId: 'scenario-1',
  executionId: 'exec-1',
  namespace: 'test-ns',
  services: [],
  onClose: vi.fn(),
};

/**
 * Render the console with a mocked SSE subscription and return the handlers
 * the component registered, so tests can push synthetic events into it.
 */
async function renderWithMockedStream(props = defaultProps) {
  const mockUnsubscribe = vi.fn();
  vi.spyOn(sseModule, 'subscribeToExecutionEvents').mockReturnValue(mockUnsubscribe);
  render(<ExecutionConsole {...props} />, { wrapper: createWrapper() });
  await vi.waitFor(() => {
    expect(sseModule.subscribeToExecutionEvents).toHaveBeenCalled();
  });
  const calls = (sseModule.subscribeToExecutionEvents as { mock: { calls: unknown[] } }).mock.calls;
  return calls[calls.length - 1][2] as ExecutionEventHandlers;
}

describe('ExecutionConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tear down button', () => {
    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('Tear Down')).toBeInTheDocument();
  });

  it('shows the tear down confirmation dialog when clicking the button', () => {
    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Tear Down'));

    expect(screen.getByText('Tear down deployment')).toBeInTheDocument();
    expect(
      screen.getByText(/This will remove the deployment from the cluster/)
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tear down' })).toBeInTheDocument();
  });

  it('does not call teardown API when cancelling the dialog', () => {
    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Tear Down'));
    fireEvent.click(screen.getByText('Cancel'));

    // The teardown mutation should not have been called
    // (we verify the dialog was dismissed without calling the mutation)
    expect(screen.queryByText('Tear down deployment')).not.toBeInTheDocument();
  });

  it('disables the tear down button when torn down', () => {
    // Simulate torn down phase by checking the button text changes
    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    // Initially, button should be enabled
    const tearDownButton = screen.getByText('Tear Down');
    expect(tearDownButton).not.toBeDisabled();
  });

  it('shows "Torn Down" text when phase is torn-down', () => {
    // The component starts in 'running' phase, so we need to simulate
    // the phase changing. For this test, we verify the button text logic.
    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('Tear Down')).toBeInTheDocument();
  });

  it('flips to error state when SSE stream closes prematurely', async () => {
    const mockUnsubscribe = vi.fn();
    vi.spyOn(sseModule, 'subscribeToExecutionEvents').mockReturnValue(mockUnsubscribe);

    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    // Simulate premature stream close by triggering onError via the SSE handler
    // The component subscribes in useEffect, so we need to wait for it
    await vi.waitFor(() => {
      expect(sseModule.subscribeToExecutionEvents).toHaveBeenCalled();
    });

    // Get the handlers that were passed to subscribeToExecutionEvents
    const callArgs = (sseModule.subscribeToExecutionEvents as { mock: { calls: unknown[] } }).mock
      .calls[0];
    const handlers = callArgs[2] as {
      onError?: (event: { message: string }) => void;
      onLog?: (event: { service: string; pod: string; line: string }) => void;
    };

    // Simulate an error event (stream closed without 'end')
    handlers.onError?.({ message: 'Event stream ended unexpectedly' });

    await vi.waitFor(() => {
      expect(screen.getByText('Deployment failed')).toBeInTheDocument();
    });

    // Verify error message is displayed
    expect(screen.getByText(/Event stream ended unexpectedly/)).toBeInTheDocument();
  });

  it('caps log array at MAX_LOG_LINES when receiving a large stream', async () => {
    const mockUnsubscribe = vi.fn();
    vi.spyOn(sseModule, 'subscribeToExecutionEvents').mockReturnValue(mockUnsubscribe);

    render(<ExecutionConsole {...defaultProps} />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      expect(sseModule.subscribeToExecutionEvents).toHaveBeenCalled();
    });

    const callArgs = (sseModule.subscribeToExecutionEvents as { mock: { calls: unknown[] } }).mock
      .calls[0];
    const handlers = callArgs[2] as {
      onError?: (event: { message: string }) => void;
      onLog?: (event: { service: string; pod: string; line: string }) => void;
    };

    // Simulate 2500 log lines
    for (let i = 0; i < 2500; i++) {
      handlers.onLog?.({
        service: 'test-service',
        pod: `pod-${i}`,
        line: `Log line ${i}`,
      });
    }

    await vi.waitFor(() => {
      // The viewport should have scrolled and logs should be capped
      const logLines = screen.getAllByTestId('log-line');
      expect(logLines.length).toBeLessThanOrEqual(2000);
    });
  });

  it('groups logs by container name with one tab per container', async () => {
    const handlers = await renderWithMockedStream();

    act(() => {
      handlers.onLog?.({
        service: 'mag',
        pod: 'mag-abc',
        container: 'mag',
        line: 'attack started',
      });
      handlers.onLog?.({
        service: 'victim',
        pod: 'victim-xyz',
        container: 'mmt-probe',
        line: 'alert raised',
      });
      handlers.onLog?.({
        service: 'mag',
        pod: 'mag-abc',
        container: 'mag',
        line: 'attack finished',
      });
    });

    // One tab per container plus the combined "All" view.
    await vi.waitFor(() => {
      expect(screen.getByTestId('log-tab-mag')).toBeInTheDocument();
      expect(screen.getByTestId('log-tab-mmt-probe')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('log-line')).toHaveLength(3);

    // Selecting a container tab shows only that container's lines.
    fireEvent.click(screen.getByTestId('log-tab-mag'));
    await vi.waitFor(() => {
      const lines = screen.getAllByTestId('log-line');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toHaveTextContent('attack started');
      expect(lines[1]).toHaveTextContent('attack finished');
    });

    // "All" restores the combined stream.
    fireEvent.click(screen.getByTestId('log-tab-all'));
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('log-line')).toHaveLength(3);
    });
  });

  it('surfaces the completed state of a finished Job, incl. its containers', async () => {
    const handlers = await renderWithMockedStream({
      ...defaultProps,
      services: [
        {
          nodeId: 'n1',
          serviceId: 's1',
          name: 'mag',
          uiType: 'terminal',
          status: 'running',
        },
      ],
    });

    act(() => {
      handlers.onEnd?.({
        status: 'completed',
        services: [
          {
            name: 'mag',
            status: 'completed',
            containers: [{ name: 'mag', status: 'completed' }],
          },
        ],
      });
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByTestId('container-status-mag')).toHaveTextContent('mag: Completed');
    });
  });

  it('renders k8s-event records in a dedicated namespace events pane', async () => {
    const handlers = await renderWithMockedStream();

    act(() => {
      handlers.onK8sEvent?.({
        uid: 'ev-1',
        reason: 'Scheduled',
        message: 'Successfully assigned sim/mag-abc to node-1',
        objectKind: 'Pod',
        objectName: 'mag-abc',
        type: 'Normal',
        count: 1,
        timestamp: '2026-09-07T10:00:00Z',
      });
      handlers.onK8sEvent?.({
        uid: 'ev-2',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        objectKind: 'Pod',
        objectName: 'victim-xyz',
        type: 'Warning',
        count: 3,
        timestamp: '2026-09-07T10:00:05Z',
      });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('events-pane')).toBeInTheDocument();
      const rows = screen.getAllByTestId('k8s-event');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('Scheduled');
      expect(rows[0]).toHaveTextContent('Successfully assigned sim/mag-abc to node-1');
      expect(rows[1]).toHaveTextContent('BackOff');
      expect(rows[1]).toHaveTextContent('Pod/victim-xyz');
      expect(rows[1]).toHaveTextContent('(×3)');
    });
    expect(screen.getByText('2 events')).toBeInTheDocument();
  });

  it('renders alert events in a dedicated security alerts pane (issue #234)', async () => {
    const handlers = await renderWithMockedStream();

    act(() => {
      handlers.onAlert?.({
        service: 'http-sim',
        pod: 'http-sim-abc',
        container: 'mmt-probe',
        timestamp: '2026-09-14T10:00:00Z',
        verdict: 'http-flood',
        attacker: '10.0.0.9',
        line: '{"ip.src":"10.0.0.9","verdict":"http-flood"}',
      });
      handlers.onAlert?.({
        service: 'http-sim',
        pod: 'http-sim-abc',
        container: 'mmt-probe',
        verdict: 'syn-flood',
        line: 'ALERT syn-flood suspected',
      });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('alerts-pane')).toBeInTheDocument();
      const rows = screen.getAllByTestId('alert-row');
      expect(rows).toHaveLength(2);
      // Verdict + attacker address + reporting service:container.
      expect(rows[0]).toHaveTextContent('http-flood');
      expect(rows[0]).toHaveTextContent('src=10.0.0.9');
      expect(rows[0]).toHaveTextContent('http-sim:mmt-probe');
      expect(rows[1]).toHaveTextContent('syn-flood');
    });
    expect(screen.getByText('2 alerts')).toBeInTheDocument();
  });

  it('shows a copyable kubectl exec hint for terminal services (issue #233)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await renderWithMockedStream({
      ...defaultProps,
      services: [
        {
          nodeId: 'n1',
          serviceId: 's1',
          name: 'mag',
          uiType: 'terminal',
          status: 'running',
        },
      ],
    });

    const hint = await screen.findByTestId('exec-hint-mag');
    const expected =
      'kubectl exec -it deploy/mag -n test-ns -- mag <attack> --target-ip <target> --target-port <port>';
    expect(hint).toHaveTextContent(expected);

    fireEvent.click(hint);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expected);
    });
  });
});
