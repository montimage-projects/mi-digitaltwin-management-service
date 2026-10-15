import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopologyEditor, nodesToYaml } from './TopologyEditor';
import type { TopologyChangeMeta } from './TopologyCanvas';

// Capture the props the editor hands to its children so the split-view
// YAML <-> canvas round trip can be driven deterministically (React Flow's
// measurement pass does not run in jsdom).
const canvasProps: {
  current?: {
    onNodesChange: (nodes: object[], meta?: TopologyChangeMeta) => void;
    onEdgesChange: (edges: object[], meta?: TopologyChangeMeta) => void;
  };
} = {};
const yamlEditorProps: { current?: { onChange: (value: string) => void } } = {};

vi.mock('./TopologyCanvas', () => ({
  TopologyCanvas: (props: NonNullable<typeof canvasProps.current>) => {
    canvasProps.current = props;
    return <div data-testid="canvas" />;
  },
}));

vi.mock('./YamlEditor', () => ({
  YamlEditor: (props: NonNullable<typeof yamlEditorProps.current>) => {
    yamlEditorProps.current = props;
    return <div data-testid="yaml-editor" />;
  },
}));

const nodes = [
  { id: 'soar', position: { x: 400, y: 0 }, data: { label: 'AI4SOAR', type: 'reaction' } },
  { id: 'sim', position: { x: 200, y: 0 }, data: { label: 'CI-SIM', type: 'target' } },
];
const edges = [{ id: 'e1', source: 'soar', target: 'sim', data: { edgeType: 'acts-on' } }];

describe('TopologyEditor split view YAML sync', () => {
  const onYamlChange = vi.fn();
  const onNodesChange = vi.fn();
  const onEdgesChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    canvasProps.current = undefined;
    yamlEditorProps.current = undefined;
  });

  const renderSplit = () => {
    render(
      <TopologyEditor
        yaml={nodesToYaml(nodes, edges)}
        nodes={nodes}
        edges={edges}
        onYamlChange={onYamlChange}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Split/ }));
  };

  it('does not regenerate YAML from view-only canvas changes after a YAML edit', () => {
    renderSplit();
    const edited = `# my comment\n${nodesToYaml(nodes, edges).replace('name: AI4SOAR', 'name: secAI4SOAR')}`;

    act(() => yamlEditorProps.current!.onChange(edited));

    expect(onYamlChange).toHaveBeenCalledTimes(1);
    expect(onYamlChange).toHaveBeenLastCalledWith(edited);
    const parsedNodes = onNodesChange.mock.calls.at(-1)?.[0] as typeof nodes;
    expect(parsedNodes.find((n) => n.id === 'soar')?.data.label).toBe('secAI4SOAR');

    // React Flow measures the re-rendered nodes / updates selection: the
    // parent still receives the nodes, but the user's YAML text is kept.
    const measured = parsedNodes.map((n) => ({ ...n, measured: { width: 180, height: 60 } }));
    act(() => canvasProps.current!.onNodesChange(measured, { viewOnly: true }));
    act(() => canvasProps.current!.onEdgesChange(edges, { viewOnly: true }));

    expect(onNodesChange).toHaveBeenLastCalledWith(measured);
    expect(onEdgesChange).toHaveBeenLastCalledWith(edges);
    expect(onYamlChange).toHaveBeenCalledTimes(1);
  });

  it('still regenerates YAML for topology changes made on the canvas', () => {
    renderSplit();
    const moved = nodes.map((n) => (n.id === 'sim' ? { ...n, position: { x: 250, y: 40 } } : n));

    act(() => canvasProps.current!.onNodesChange(moved, { viewOnly: false }));

    expect(onYamlChange).toHaveBeenCalledWith(nodesToYaml(moved, edges));
  });
});

describe('TopologyEditor YAML sync keeps YAML-invisible data across transient edits', () => {
  const configured = [
    {
      id: 'soar',
      position: { x: 400, y: 0 },
      data: {
        label: 'AI4SOAR',
        type: 'reaction',
        config: { env: [{ name: 'MODE', value: 'auto' }] },
      },
    },
    { id: 'sim', position: { x: 200, y: 0 }, data: { label: 'CI-SIM', type: 'target' } },
  ];
  const styled = [
    {
      id: 'e1',
      source: 'soar',
      target: 'sim',
      animated: true,
      style: { stroke: 'red' },
      data: { edgeType: 'acts-on' },
    },
  ];

  // Stateful parent, like useScenarioTopology: edits feed back as props.
  const latest: { nodes: object[]; edges: object[] } = { nodes: [], edges: [] };
  function Harness() {
    const [yaml, setYaml] = useState(nodesToYaml(configured, styled));
    const [nodes, setNodes] = useState<object[]>(configured);
    const [edges, setEdges] = useState<object[]>(styled);
    latest.nodes = nodes;
    latest.edges = edges;
    return (
      <TopologyEditor
        yaml={yaml}
        nodes={nodes}
        edges={edges}
        onYamlChange={setYaml}
        onNodesChange={setNodes}
        onEdgesChange={setEdges}
        onSave={vi.fn()}
      />
    );
  }

  it('restores node config and edge styling when a retyped id comes back', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Code/ }));
    const original = nodesToYaml(configured, styled);

    // Backspacing the id leaves YAML that still parses: `soa` is a new node
    // and the `soar` connection is dropped.
    act(() => yamlEditorProps.current!.onChange(original.replace('id: soar', 'id: soa')));
    expect((latest.nodes as { id: string }[]).map((n) => n.id)).toEqual(['soa', 'sim']);
    expect(latest.edges).toEqual([]);

    // Retyping the id restores the original data.
    act(() => yamlEditorProps.current!.onChange(original));
    const soar = (latest.nodes as typeof configured).find((n) => n.id === 'soar')!;
    expect(soar.data.config).toEqual({ env: [{ name: 'MODE', value: 'auto' }] });
    expect(latest.edges).toHaveLength(1);
    expect(latest.edges[0]).toMatchObject({
      id: 'e1',
      animated: true,
      style: { stroke: 'red' },
      data: { edgeType: 'acts-on' },
    });
  });
});
