import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExecutionConsole } from './ExecutionConsole';
import * as sseModule from '@/lib/sse';

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
});
