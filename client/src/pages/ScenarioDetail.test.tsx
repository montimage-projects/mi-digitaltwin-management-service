import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ScenarioDetail } from './ScenarioDetail';

// Mock dependencies
vi.mock('@/lib/api', () => ({
  scenariosApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
  infrastructuresApi: {
    list: vi.fn(),
  },
}));

vi.mock('@/lib/services', () => ({
  servicesApi: {
    list: vi.fn(),
  },
}));

vi.mock('@/lib/constants', () => ({
  MAX_LIST_LIMIT: 100,
}));

vi.mock('@/hooks/useScenarioTopology', () => ({
  useScenarioTopology: vi.fn(() => ({
    yaml: '',
    nodes: [],
    edges: [],
    isDirty: false,
    activeExecution: null,
    handleYamlChange: vi.fn(),
    handleNodesChange: vi.fn(),
    handleEdgesChange: vi.fn(),
    handleSave: vi.fn(),
    handleValidate: vi.fn(),
    handleExecutionStart: vi.fn(),
    handleCloseExecution: vi.fn(),
    onInfrastructureChange: vi.fn(),
    isSaving: false,
  })),
}));

vi.mock('@/hooks/useWorkspaceTabSync', () => ({
  useWorkspaceTabSync: vi.fn(() => ({
    handleTabClick: vi.fn(),
  })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock react-router-dom hooks used by child components
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'scenario-1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useNavigate: vi.fn(),
    useBlocker: vi.fn(() => ({ state: 'unblocked' as const })),
  };
});

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

describe('ScenarioDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { scenariosApi, infrastructuresApi } = await import('@/lib/api');
    const { servicesApi } = await import('@/lib/services');
    vi.mocked(scenariosApi.get).mockResolvedValue({
      _id: 'scenario-1',
      title: 'Test Scenario',
      description: 'A test scenario',
      topology: { yaml: '', nodes: [], edges: [] },
      infrastructureId: null,
      executions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: 'project-1',
    });
    vi.mocked(infrastructuresApi.list).mockResolvedValue([]);
    vi.mocked(servicesApi.list).mockResolvedValue({ services: [] });

    await act(async () => {
      render(<ScenarioDetail />, { wrapper: createWrapper() });
    });

    await waitFor(() => {
      expect(screen.getByText('Test Scenario')).toBeInTheDocument();
    });
  });

  it('shows unsaved changes toast when dirty', async () => {
    const { toast } = await import('sonner');
    const { useScenarioTopology } = await import('@/hooks/useScenarioTopology');
    vi.mocked(useScenarioTopology).mockReturnValue({
      yaml: '',
      nodes: [],
      edges: [],
      isDirty: true,
      activeExecution: null,
      handleYamlChange: vi.fn(),
      handleNodesChange: vi.fn(),
      handleEdgesChange: vi.fn(),
      handleSave: vi.fn(),
      handleValidate: vi.fn(),
      handleExecutionStart: vi.fn(),
      handleCloseExecution: vi.fn(),
      onInfrastructureChange: vi.fn(),
      isSaving: false,
    });

    const { scenariosApi } = await import('@/lib/api');
    vi.mocked(scenariosApi.get).mockResolvedValue({
      _id: 'scenario-1',
      title: 'Test Scenario',
      description: 'A test scenario',
      topology: { yaml: '', nodes: [], edges: [] },
      infrastructureId: null,
      executions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: 'project-1',
    });

    await act(async () => {
      render(<ScenarioDetail />, { wrapper: createWrapper() });
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
    });
  });
});
