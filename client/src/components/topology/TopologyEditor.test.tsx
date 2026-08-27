import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TopologyEditor } from './TopologyEditor';

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
  yaml: '',
  nodes: [],
  edges: [],
  onYamlChange: vi.fn(),
  onNodesChange: vi.fn(),
  onEdgesChange: vi.fn(),
  onSave: vi.fn(),
  isDirty: false,
  isSaving: false,
  infrastructures: [],
  selectedInfrastructure: null,
};

describe('TopologyEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor with all toolbar buttons', () => {
    render(<TopologyEditor {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
    expect(screen.getByText('Split')).toBeInTheDocument();
    expect(screen.getByText('Validate')).toBeInTheDocument();
    expect(screen.getByText('Clear canvas')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('shows the clear canvas dialog when clicking the button', () => {
    render(<TopologyEditor {...defaultProps} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Clear canvas' }));

    expect(screen.getByText(/This will remove all services and connections/)).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear canvas' })).toBeInTheDocument();
  });

  it('clears topology when confirming the dialog', () => {
    render(<TopologyEditor {...defaultProps} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Clear canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear canvas' }));

    expect(defaultProps.onYamlChange).toHaveBeenCalledWith('');
    expect(defaultProps.onNodesChange).toHaveBeenCalledWith([]);
    expect(defaultProps.onEdgesChange).toHaveBeenCalledWith([]);
  });

  it('does not clear topology when cancelling the dialog', () => {
    render(<TopologyEditor {...defaultProps} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText('Clear canvas'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(defaultProps.onYamlChange).not.toHaveBeenCalled();
    expect(defaultProps.onNodesChange).not.toHaveBeenCalled();
    expect(defaultProps.onEdgesChange).not.toHaveBeenCalled();
  });

  it('disables the clear canvas button when saving', () => {
    render(<TopologyEditor {...defaultProps} isSaving />, { wrapper: createWrapper() });

    const button = screen.getByRole('button', { name: 'Clear canvas' });
    expect(button).toBeDisabled();
  });

  it('shows unsaved changes badge when dirty', () => {
    render(<TopologyEditor {...defaultProps} isDirty />, { wrapper: createWrapper() });

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('does not show unsaved changes badge when clean', () => {
    render(<TopologyEditor {...defaultProps} isDirty={false} />, { wrapper: createWrapper() });

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});
