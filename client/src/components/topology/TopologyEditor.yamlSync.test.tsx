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
