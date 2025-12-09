import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code, Network, Columns, Save, RotateCcw, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { YamlEditor } from './YamlEditor';
import { TopologyCanvas } from './TopologyCanvas';
import { cn } from '@/lib/utils';
import yaml from 'js-yaml';

interface TopologyNode {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type?: string;
    serviceId?: string;
    serviceTitle?: string;
    version?: string;
  };
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
}

// Convert nodes and edges to YAML format
function nodesToYaml(nodes: TopologyNode[], edges: TopologyEdge[]): string {
  if (nodes.length === 0 && edges.length === 0) {
    return '';
  }

  const topology = {
    services: nodes.map((node) => {
      const service: Record<string, unknown> = {
        id: node.id,
        name: node.data.label,
        title: node.data.serviceTitle || node.data.label,
        type: node.data.type || 'server',
        serviceId: node.data.serviceId,
        position: {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        },
      };
      // Only include version if it's set (not using latest)
      if (node.data.version) {
        service.version = node.data.version;
      }
      return service;
    }),
    connections: edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
    })),
  };

  return yaml.dump(topology, { indent: 2, lineWidth: -1 });
}

type ViewMode = 'code' | 'visual' | 'split';

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
}

interface TopologyEditorProps {
  yaml: string;
  nodes: object[];
  edges: object[];
  onYamlChange: (yaml: string) => void;
  onNodesChange: (nodes: object[]) => void;
  onEdgesChange: (edges: object[]) => void;
  onSave: () => void;
  services?: ServiceOption[];
  isSaving?: boolean;
  isDirty?: boolean;
}

export function TopologyEditor({
  yaml: yamlProp,
  nodes,
  edges,
  onYamlChange,
  onNodesChange,
  onEdgesChange,
  onSave,
  services = [],
  isSaving = false,
  isDirty = false,
}: TopologyEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const isUpdatingFromCanvas = useRef(false);

  // Sync nodes/edges changes to YAML
  const handleNodesChangeWithYamlSync = useCallback(
    (newNodes: object[]) => {
      isUpdatingFromCanvas.current = true;
      onNodesChange(newNodes);
      const newYaml = nodesToYaml(newNodes as TopologyNode[], edges as TopologyEdge[]);
      onYamlChange(newYaml);
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingFromCanvas.current = false;
      }, 100);
    },
    [onNodesChange, onYamlChange, edges]
  );

  const handleEdgesChangeWithYamlSync = useCallback(
    (newEdges: object[]) => {
      isUpdatingFromCanvas.current = true;
      onEdgesChange(newEdges);
      const newYaml = nodesToYaml(nodes as TopologyNode[], newEdges as TopologyEdge[]);
      onYamlChange(newYaml);
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingFromCanvas.current = false;
      }, 100);
    },
    [onEdgesChange, onYamlChange, nodes]
  );

  const handleReset = useCallback(() => {
    // Reset to empty topology
    onYamlChange('');
    onNodesChange([]);
    onEdgesChange([]);
  }, [onYamlChange, onNodesChange, onEdgesChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-1">
            <Button
              variant={viewMode === 'code' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('code')}
              className="h-7 px-2"
            >
              <Code className="h-4 w-4 mr-1" />
              Code
            </Button>
            <Button
              variant={viewMode === 'visual' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('visual')}
              className="h-7 px-2"
            >
              <Network className="h-4 w-4 mr-1" />
              Visual
            </Button>
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('split')}
              className="h-7 px-2"
            >
              <Columns className="h-4 w-4 mr-1" />
              Split
            </Button>
          </div>
          {isDirty && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving || !isDirty}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'code' && (
          <div className="h-full">
            <YamlEditor value={yamlProp} onChange={onYamlChange} />
          </div>
        )}

        {viewMode === 'visual' && (
          <div className="h-full">
            <TopologyCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChangeWithYamlSync}
              onEdgesChange={handleEdgesChangeWithYamlSync}
              services={services}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="flex h-full">
            {/* Collapsible Code Panel */}
            <div
              className={cn(
                'h-full border-r transition-all duration-300 overflow-hidden',
                codeCollapsed ? 'w-0' : 'w-1/2'
              )}
            >
              <div className="h-full w-full min-w-[400px]">
                <YamlEditor value={yamlProp} onChange={onYamlChange} />
              </div>
            </div>
            {/* Toggle Button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 h-6 w-6 rounded-full border bg-background shadow-sm"
                onClick={() => setCodeCollapsed(!codeCollapsed)}
                title={codeCollapsed ? 'Show code editor' : 'Hide code editor'}
              >
                {codeCollapsed ? (
                  <PanelLeftOpen className="h-3 w-3" />
                ) : (
                  <PanelLeftClose className="h-3 w-3" />
                )}
              </Button>
            </div>
            {/* Visual Canvas */}
            <div className={cn('h-full flex-1 transition-all duration-300')}>
              <TopologyCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChangeWithYamlSync}
                onEdgesChange={handleEdgesChangeWithYamlSync}
                services={services}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
