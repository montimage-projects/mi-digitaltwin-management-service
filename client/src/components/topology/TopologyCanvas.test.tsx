import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopologyCanvas } from './TopologyCanvas';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const noop = () => {};

const baseProps = {
  onNodesChange: noop,
  onEdgesChange: noop,
};

const makeNode = (id: string, label: string, data: Record<string, unknown> = {}) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label, ...data },
});

const services = [
  {
    _id: 'svc-mag',
    shortName: 'MAG',
    title: 'Montimage Attack Generator',
    categoryId: { name: 'Attack' },
    repositoryTable: 'INTACT_TOOLBOX' as const,
    deployment: { kind: 'Job' as const, role: 'attack' as const },
  },
  {
    _id: 'svc-http',
    shortName: 'HTTP-SIM',
    title: 'HTTP simulator',
    categoryId: { name: 'Target' },
    repositoryTable: 'OTHER_SERVICES' as const,
    deployment: { kind: 'Deployment' as const, role: 'target' as const },
  },
  {
    _id: 'svc-probe',
    shortName: 'MMT-PROBE',
    title: 'Montimage probe',
    categoryId: { name: 'Monitor' },
    repositoryTable: 'INTACT_TOOLBOX' as const,
    deployment: {
      kind: 'Deployment' as const,
      role: 'monitor' as const,
      attachMode: 'sidecar' as const,
    },
  },
  {
    _id: 'svc-soar',
    shortName: 'AI4SOAR',
    title: 'AI4SOAR',
    categoryId: { name: 'Reaction' },
    repositoryTable: 'INTACT_TOOLBOX' as const,
    deployment: { kind: 'Deployment' as const, role: 'reaction' as const },
  },
  {
    _id: 'svc-db',
    shortName: 'DB',
    title: 'Database',
    categoryId: { name: 'Dev Services' },
    repositoryTable: 'INTACT_TOOLBOX' as const,
  },
];

const scenarioNodes = [
  makeNode('n-mag', 'MAG', { serviceId: 'svc-mag', type: 'attack' }),
  makeNode('n-http', 'HTTP-SIM', { serviceId: 'svc-http', type: 'target' }),
  makeNode('n-probe', 'MMT-PROBE', { serviceId: 'svc-probe', type: 'monitor' }),
  makeNode('n-soar', 'AI4SOAR', { serviceId: 'svc-soar', type: 'reaction' }),
  makeNode('n-db', 'DB', { serviceId: 'svc-db', type: 'database' }),
];

describe('TopologyCanvas role badges', () => {
  it('renders attack / target / monitor / reaction badges on nodes', () => {
    render(<TopologyCanvas {...baseProps} nodes={scenarioNodes} edges={[]} services={services} />);

    expect(screen.getByTestId('role-badge-attack')).toHaveTextContent('attack');
    expect(screen.getByTestId('role-badge-target')).toHaveTextContent('target');
    expect(screen.getByTestId('role-badge-monitor')).toHaveTextContent('monitor');
    expect(screen.getByTestId('role-badge-reaction')).toHaveTextContent('reaction');
  });

  it('renders no badge for services without a deployment role', () => {
    render(
      <TopologyCanvas
        {...baseProps}
        nodes={[makeNode('n-db', 'DB', { serviceId: 'svc-db', type: 'database' })]}
        edges={[]}
        services={services}
      />
    );

    expect(screen.queryByTestId(/^role-badge-/)).not.toBeInTheDocument();
  });

  it('renders a badge from role persisted on node data when the service is absent', () => {
    render(
      <TopologyCanvas
        {...baseProps}
        nodes={[makeNode('n-legacy', 'OLD', { type: 'monitor' })]}
        edges={[]}
        services={[]}
      />
    );

    expect(screen.getByTestId('role-badge-monitor')).toBeInTheDocument();
  });
});

describe('TopologyCanvas sidecar attachment', () => {
  const nodes = [
    makeNode('n-http', 'HTTP-SIM', { serviceId: 'svc-http', type: 'target' }),
    makeNode('n-probe', 'MMT-PROBE', { serviceId: 'svc-probe', type: 'monitor' }),
  ];

  it('docks a sidecar node inside the host its monitor edge targets', () => {
    const edges = [
      { id: 'e1', source: 'n-probe', target: 'n-http', data: { edgeType: 'monitors' } },
    ];

    render(<TopologyCanvas {...baseProps} nodes={nodes} edges={edges} services={services} />);

    const sidecarEl = screen.getByTestId('rf__node-n-probe');
    expect(sidecarEl).toBeInTheDocument();
    expect(screen.getByTitle('Sidecar attached to HTTP-SIM')).toBeInTheDocument();
  });

  it('renders an unattached sidecar as a standalone node with a hint', () => {
    render(<TopologyCanvas {...baseProps} nodes={nodes} edges={[]} services={services} />);

    expect(screen.getByTestId('rf__node-n-probe')).toBeInTheDocument();
    expect(screen.getByText('sidecar — needs a monitor edge')).toBeInTheDocument();
    expect(screen.queryByTitle(/Sidecar attached/)).not.toBeInTheDocument();
  });
});

describe('TopologyCanvas Auto-wire (task 5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires the four typed edges, applies the layout and surfaces what was added', () => {
    const onTopologyChange = vi.fn();
    render(
      <TopologyCanvas
        {...baseProps}
        onTopologyChange={onTopologyChange}
        nodes={scenarioNodes}
        edges={[]}
        services={services}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Auto-wire/ }));

    expect(onTopologyChange).toHaveBeenCalledTimes(1);
    const [newNodes, newEdges] = onTopologyChange.mock.calls[0] as [
      { id: string; position: { x: number; y: number } }[],
      { id: string; source: string; target: string; data?: { edgeType?: string } }[],
    ];
    expect(newEdges).toHaveLength(4);
    expect(newEdges.map((e) => e.data?.edgeType).sort()).toEqual([
      'acts-on',
      'attacks',
      'monitors',
      'notifies',
    ]);
    expect(newEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'n-mag', target: 'n-http' }),
        expect.objectContaining({ source: 'n-probe', target: 'n-http' }),
        expect.objectContaining({ source: 'n-probe', target: 'n-soar' }),
        expect.objectContaining({ source: 'n-soar', target: 'n-http' }),
      ])
    );

    // Layout: attack and monitor left of the target, reaction right;
    // the unroled DB node keeps its position.
    const posOf = (id: string) => newNodes.find((n) => n.id === id)!.position;
    expect(posOf('n-mag').x).toBeLessThan(posOf('n-http').x);
    expect(posOf('n-probe').x).toBeLessThan(posOf('n-http').x);
    expect(posOf('n-soar').x).toBeGreaterThan(posOf('n-http').x);
    expect(posOf('n-db')).toEqual({ x: 0, y: 0 });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Auto-wired 4 edges'));
  });

  it('does not duplicate edges the user already drew', () => {
    const onTopologyChange = vi.fn();
    const existing = [
      { id: 'e1', source: 'n-mag', target: 'n-http', data: { edgeType: 'attacks' } },
    ];
    render(
      <TopologyCanvas
        {...baseProps}
        onTopologyChange={onTopologyChange}
        nodes={scenarioNodes}
        edges={existing}
        services={services}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Auto-wire/ }));

    const [, newEdges] = onTopologyChange.mock.calls[0] as [
      unknown,
      { source: string; target: string }[],
    ];
    expect(newEdges).toHaveLength(4); // 1 existing + 3 generated
    expect(newEdges.filter((e) => e.source === 'n-mag' && e.target === 'n-http')).toHaveLength(1);
  });

  it('reports when every role-derived edge already exists', () => {
    const onTopologyChange = vi.fn();
    const existing = [
      { id: 'e1', source: 'n-mag', target: 'n-http', data: { edgeType: 'attacks' } },
      { id: 'e2', source: 'n-probe', target: 'n-http', data: { edgeType: 'monitors' } },
      { id: 'e3', source: 'n-probe', target: 'n-soar', data: { edgeType: 'notifies' } },
      { id: 'e4', source: 'n-soar', target: 'n-http', data: { edgeType: 'acts-on' } },
    ];
    render(
      <TopologyCanvas
        {...baseProps}
        onTopologyChange={onTopologyChange}
        nodes={scenarioNodes}
        edges={existing}
        services={services}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Auto-wire/ }));

    const [, newEdges] = onTopologyChange.mock.calls[0] as [unknown, unknown[]];
    expect(newEdges).toHaveLength(4); // layout applied, no edge added
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('already exist'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does nothing when no role-tagged services are placed', () => {
    const onTopologyChange = vi.fn();
    render(
      <TopologyCanvas
        {...baseProps}
        onTopologyChange={onTopologyChange}
        nodes={[makeNode('n-db', 'DB', { serviceId: 'svc-db', type: 'database' })]}
        edges={[]}
        services={services}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Auto-wire/ }));

    expect(onTopologyChange).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Nothing to auto-wire'));
  });
});

describe('TopologyCanvas node config panel (task 3.3)', () => {
  it('disables the Configure button until exactly one node is selected', () => {
    render(<TopologyCanvas {...baseProps} nodes={scenarioNodes} edges={[]} services={services} />);

    expect(screen.getByRole('button', { name: 'Configure' })).toBeDisabled();
  });

  it('opens the node config panel on node double-click and propagates edits', () => {
    const onNodesChange = vi.fn();
    render(
      <TopologyCanvas
        {...baseProps}
        onNodesChange={onNodesChange}
        nodes={[makeNode('n-probe', 'MMT-PROBE', { serviceId: 'svc-probe', type: 'monitor' })]}
        edges={[]}
        services={[
          {
            _id: 'svc-probe',
            shortName: 'MMT-PROBE',
            title: 'Montimage probe',
            repositoryTable: 'INTACT_TOOLBOX' as const,
            deployment: {
              kind: 'Deployment' as const,
              role: 'monitor' as const,
              env: [{ name: 'HOST_INTERFACE', value: 'eth0' }],
            },
          },
        ]}
      />
    );

    fireEvent.doubleClick(screen.getByTestId('rf__node-n-probe'));

    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Value for HOST_INTERFACE')).toHaveValue('eth0');

    fireEvent.change(screen.getByLabelText('Value for HOST_INTERFACE'), {
      target: { value: 'eth1' },
    });

    expect(onNodesChange).toHaveBeenCalled();
    const lastNodes = onNodesChange.mock.calls.at(-1)?.[0] as {
      id: string;
      data: { config?: { env?: { name: string; value?: string }[] } };
    }[];
    expect(lastNodes[0].data.config?.env).toEqual([{ name: 'HOST_INTERFACE', value: 'eth1' }]);
  });
});
