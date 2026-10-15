import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { load as yamlLoad } from 'js-yaml';
import { TopologyEditor, nodesToYaml, yamlToTopology } from './TopologyEditor';
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

describe('TopologyEditor focus mode', () => {
  it('toggles focus mode and hides the infrastructure row while focused', () => {
    const onFocusModeChange = vi.fn();
    const { rerender } = render(
      <TopologyEditor {...defaultProps} onFocusModeChange={onFocusModeChange} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/Target Infrastructure/)).toBeVisible();

    const toggle = screen.getByRole('button', { name: /Hide header/ });
    // The swapping visible label conveys the state; aria-pressed would
    // contradict it for screen readers (WCAG 4.1.2).
    expect(toggle).not.toHaveAttribute('aria-pressed');
    fireEvent.click(toggle);
    expect(onFocusModeChange).toHaveBeenCalledWith(true);

    rerender(<TopologyEditor {...defaultProps} focusMode onFocusModeChange={onFocusModeChange} />);
    expect(screen.getByText(/Target Infrastructure/).closest('.hidden')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show header/ }));
    expect(onFocusModeChange).toHaveBeenLastCalledWith(false);
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

describe('yamlToTopology (code view → canvas sync)', () => {
  const nodes = [
    {
      id: 'soar',
      position: { x: 400, y: 0 },
      data: { label: 'AI4SOAR', type: 'reaction', serviceId: 's1', role: 'reaction' },
    },
    { id: 'sim', position: { x: 200, y: 0 }, data: { label: 'CI-SIM', type: 'target' } },
  ];
  const edges = [
    { id: 'e1', source: 'soar', target: 'sim', data: { edgeType: 'acts-on' }, animated: true },
  ];

  it('applies a renamed service to the node label and keeps other node data', () => {
    const yaml = nodesToYaml(nodes, edges).replace('name: AI4SOAR', 'name: secAI4SOAR');

    const result = yamlToTopology(yaml, nodes, edges)!;

    const soar = result.nodes.find((n) => n.id === 'soar')!;
    expect(soar.data.label).toBe('secAI4SOAR');
    expect(soar.data).toMatchObject({ serviceId: 's1', role: 'reaction' });
    expect(result.edges[0]).toMatchObject({
      id: 'e1',
      animated: true,
      label: 'acts-on',
      data: { edgeType: 'acts-on' },
    });
  });

  it('round-trips nodesToYaml output unchanged', () => {
    const result = yamlToTopology(nodesToYaml(nodes, edges), nodes, edges)!;

    expect(nodesToYaml(result.nodes, result.edges)).toBe(nodesToYaml(nodes, edges));
  });

  it('returns null for invalid or mid-edit YAML so the canvas keeps its state', () => {
    expect(yamlToTopology('services: [', nodes, edges)).toBeNull();
    expect(yamlToTopology('foo: bar', nodes, edges)).toBeNull();
    expect(yamlToTopology('services:\n  - name: x', nodes, edges)).toBeNull();
    expect(yamlToTopology('services:\n  - id: a\n  - id: a', nodes, edges)).toBeNull();
  });

  it('drops connections that reference a removed service', () => {
    const yaml =
      'services:\n  - id: sim\n    name: CI-SIM\nconnections:\n  - id: e1\n    from: soar\n    to: sim\n';

    const result = yamlToTopology(yaml, nodes, edges)!;

    expect(result.nodes.map((n) => n.id)).toEqual(['sim']);
    expect(result.edges).toEqual([]);
  });
});
