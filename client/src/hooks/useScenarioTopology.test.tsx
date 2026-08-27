import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useScenarioTopology } from './useScenarioTopology';
import { scenariosApi } from '@/lib/api';
import type { ExecuteResult } from '@/lib/api';

// Mock dependencies
vi.mock('@/lib/api', () => ({
  scenariosApi: {
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/topology-validation', () => ({
  validateTopology: vi.fn(() => ({ isValid: true })),
  getValidationErrorMessage: vi.fn(() => 'Invalid'),
}));

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

describe('useScenarioTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.yaml).toBe('');
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.activeExecution).toBeNull();
  });

  it('initializes state from scenario topology', () => {
    const mockScenario = {
      title: 'Test Scenario',
      topology: {
        yaml: 'test: yaml',
        nodes: [{ id: 'node1' }],
        edges: [{ id: 'edge1' }],
      },
    };

    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: mockScenario,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.yaml).toBe('test: yaml');
    expect(result.current.nodes).toEqual([{ id: 'node1' }]);
    expect(result.current.edges).toEqual([{ id: 'edge1' }]);
    expect(result.current.isDirty).toBe(false);
  });

  it('tracks dirty state on yaml change', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleYamlChange('new yaml');

    expect(result.current.yaml).toBe('new yaml');
    expect(result.current.isDirty).toBe(true);
  });

  it('tracks dirty state on nodes change', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleNodesChange([{ id: 'new-node' }]);

    expect(result.current.nodes).toEqual([{ id: 'new-node' }]);
    expect(result.current.isDirty).toBe(true);
  });

  it('tracks dirty state on edges change', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleEdgesChange([{ id: 'new-edge' }]);

    expect(result.current.edges).toEqual([{ id: 'new-edge' }]);
    expect(result.current.isDirty).toBe(true);
  });

  it('sets active execution on execution start', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    const mockResult: ExecuteResult = {
      executionId: 'exec-123',
      namespace: 'test-ns',
      services: [],
    };

    result.current.handleExecutionStart(mockResult);

    expect(result.current.activeExecution).toEqual(mockResult);
  });

  it('clears active execution on close', () => {
    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    const mockResult: ExecuteResult = {
      executionId: 'exec-123',
      namespace: 'test-ns',
      services: [],
    };

    result.current.handleExecutionStart(mockResult);

    expect(result.current.activeExecution).not.toBeNull();

    result.current.handleCloseExecution();

    expect(result.current.activeExecution).toBeNull();
  });

  it('resets dirty state after save mutation succeeds', async () => {
    vi.mocked(scenariosApi.update).mockResolvedValue({} as Record<string, unknown>);

    const { result } = renderHook(
      () =>
        useScenarioTopology({
          scenarioId: 'test-1',
          scenario: undefined,
          selectedInfrastructure: null,
          onInfrastructureChange: vi.fn(),
        }),
      { wrapper: createWrapper() }
    );

    result.current.handleYamlChange('dirty yaml');

    expect(result.current.isDirty).toBe(true);

    result.current.handleSave();

    await waitFor(() => {
      expect(result.current.isDirty).toBe(false);
    });
  });
});
