import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { load as yamlLoad } from 'js-yaml';
import { TopologyEditor, nodesToYaml } from './TopologyEditor';
import { edgeKindOf } from '@/lib/topology-roles';

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

  it('auto-wire syncs the four typed edges and layout to YAML in one update (task 5.3)', () => {
    const nodes = [
      { id: 'mag', position: { x: 0, y: 0 }, data: { label: 'MAG', role: 'attack' } },
      { id: 'sim', position: { x: 200, y: 0 }, data: { label: 'CI-SIM', role: 'target' } },
      { id: 'probe', position: { x: 0, y: 120 }, data: { label: 'MMT-PROBE', role: 'monitor' } },
      { id: 'soar', position: { x: 400, y: 0 }, data: { label: 'AI4SOAR', role: 'reaction' } },
    ];
    render(<TopologyEditor {...defaultProps} nodes={nodes} />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /Auto-wire/ }));

    // The combined topology change propagates nodes, edges and YAML together.
    expect(defaultProps.onNodesChange).toHaveBeenCalled();
    expect(defaultProps.onEdgesChange).toHaveBeenCalled();
    const yaml = vi.mocked(defaultProps.onYamlChange).mock.calls.at(-1)?.[0] as string;
    const parsed = yamlLoad(yaml) as {
      services: { id: string; position: { x: number; y: number } }[];
      connections: { from: string; to: string; type?: string }[];
    };
    expect(parsed.connections).toHaveLength(4);
    expect(parsed.connections.map((c) => c.type).sort()).toEqual([
      'acts-on',
      'attacks',
      'monitors',
      'notifies',
    ]);
    // Laid-out positions landed in the same update: the attack node sits
    // left of the target anchor (x=200).
    const mag = parsed.services.find((s) => s.id === 'mag')!;
    expect(mag.position.x).toBeLessThan(200);
  });
});

describe('nodesToYaml typed edges', () => {
  interface ParsedTopology {
    connections: { id: string; from: string; to: string; type?: string }[];
  }
  const parse = (yaml: string) => yamlLoad(yaml) as ParsedTopology;

  it('emits the persisted edge type on each typed connection', () => {
    const yaml = nodesToYaml(
      [],
      [
        { id: 'e1', source: 'mag', target: 'http', data: { edgeType: 'attacks' } },
        { id: 'e2', source: 'probe', target: 'http', data: { edgeType: 'monitors' } },
        { id: 'e3', source: 'probe', target: 'soar', data: { edgeType: 'notifies' } },
        { id: 'e4', source: 'soar', target: 'http', data: { edgeType: 'acts-on' } },
      ]
    );

    expect(parse(yaml).connections.map((c) => c.type)).toEqual([
      'attacks',
      'monitors',
      'notifies',
      'acts-on',
    ]);
  });

  it('round-trips: a parsed connection type resolves to the same canonical kind', () => {
    const yaml = nodesToYaml(
      [],
      [{ id: 'e1', source: 'probe', target: 'http', data: { edgeType: 'monitors' } }]
    );

    expect(edgeKindOf(parse(yaml).connections[0].type)).toBe('monitor');
  });

  it('accepts legacy type spellings on edge.type and data.type', () => {
    const yaml = nodesToYaml(
      [],
      [
        { id: 'e1', source: 'mag', target: 'http', type: 'attack' },
        { id: 'e2', source: 'probe', target: 'http', data: { type: 'monitor' } },
      ]
    );

    expect(parse(yaml).connections.map((c) => c.type)).toEqual(['attacks', 'monitors']);
  });

  it('omits type on untyped connections', () => {
    const yaml = nodesToYaml(
      [],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c', type: 'default' },
      ]
    );

    const connections = parse(yaml).connections;
    expect(connections[0]).not.toHaveProperty('type');
    expect(connections[1]).not.toHaveProperty('type');
  });
});
