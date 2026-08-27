import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScenarioHeader } from './ScenarioHeader';
import type { Scenario } from '@/lib/api';

const mockNavigate = vi.fn();
const mockOnDeploy = vi.fn();
const mockOnEdit = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the pdf-export module before any component renders
vi.mock('@/lib/pdf-export', () => ({
  exportScenarioToPdf: vi.fn().mockResolvedValue(undefined),
}));

const createScenario = (overrides = {}): Scenario => ({
  _id: 'scenario-1',
  title: 'Test Scenario',
  description: 'A test scenario',
  topology: { yaml: '', nodes: [], edges: [] },
  infrastructureId: null,
  executions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  projectId: null,
  ...overrides,
});

describe('ScenarioHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders scenario title and buttons', () => {
    const scenario = createScenario();
    render(
      <ScenarioHeader
        scenario={scenario}
        selectedInfrastructure="infra-1"
        onDeploy={mockOnDeploy}
        onEdit={mockOnEdit}
        onNavigateProject={mockNavigate}
      />
    );

    expect(screen.getByText('Test Scenario')).toBeInTheDocument();
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
    expect(screen.getByText('Edit Details')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('disables deploy button when no infrastructure selected', () => {
    const scenario = createScenario();
    render(
      <ScenarioHeader
        scenario={scenario}
        selectedInfrastructure={null}
        onDeploy={mockOnDeploy}
        onEdit={mockOnEdit}
        onNavigateProject={mockNavigate}
      />
    );

    const deployBtn = screen.getByText('Deploy').closest('button');
    expect(deployBtn).toBeDisabled();
  });

  it('shows loading state when exporting PDF', async () => {
    const scenario = createScenario();
    render(
      <ScenarioHeader
        scenario={scenario}
        selectedInfrastructure="infra-1"
        onDeploy={mockOnDeploy}
        onEdit={mockOnEdit}
        onNavigateProject={mockNavigate}
      />
    );

    const exportBtn = screen.getByRole('button', { name: /export pdf/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText('Generating...')).toBeInTheDocument();
      const btn = exportBtn.closest('button');
      expect(btn).toBeDisabled();
    });
  });
});
