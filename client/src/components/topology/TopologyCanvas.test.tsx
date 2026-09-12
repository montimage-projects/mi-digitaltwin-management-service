import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TopologyCanvas } from './TopologyCanvas';

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
