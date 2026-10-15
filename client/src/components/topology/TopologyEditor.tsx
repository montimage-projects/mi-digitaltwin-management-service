import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Code,
  Network,
  Columns,
  Save,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  CheckCircle2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { YamlEditor } from './YamlEditor';
import { TopologyCanvas, type TopologyChangeMeta } from './TopologyCanvas';
import { cn } from '@/lib/utils';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { edgeKindOf, EDGE_TYPE_SPELLING } from '@/lib/topology-roles';
import type { ServiceDeployment } from '@/lib/services';

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
  type?: string;
  data?: { edgeType?: unknown; type?: unknown };
}

// Convert nodes and edges to YAML format. Typed edges carry their persisted
// spelling (`attacks`/`monitors`/`notifies`/`acts-on`, task 3.2) so the type
// round-trips through the YAML view.
export function nodesToYaml(nodes: TopologyNode[], edges: TopologyEdge[]): string {
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
    connections: edges.map((edge) => {
      const kind =
        edgeKindOf(edge.data?.edgeType) ?? edgeKindOf(edge.data?.type) ?? edgeKindOf(edge.type);
      return {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        ...(kind ? { type: EDGE_TYPE_SPELLING[kind] } : {}),
      };
    }),
  };

  return yamlDump(topology, { indent: 2, lineWidth: -1 });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Parse YAML edited in the code view back into canvas nodes/edges — the
// inverse of nodesToYaml. Existing nodes/edges are matched by id so fields the
// YAML does not carry (role decorations, edge styling) survive the edit.
// Returns null while the YAML is invalid or mid-edit (unparseable, missing a
// `services` list, entries without an id, duplicate ids) so the canvas keeps
// its last good state instead of flickering on every keystroke.
export function yamlToTopology(
  yaml: string,
  prevNodes: TopologyNode[],
  prevEdges: TopologyEdge[]
): { nodes: TopologyNode[]; edges: TopologyEdge[] } | null {
  let doc: unknown;
  try {
    doc = yamlLoad(yaml);
  } catch {
    return null;
  }
  if (!isRecord(doc) || !Array.isArray(doc.services)) return null;
  const rawConnections = doc.connections ?? [];
  if (!Array.isArray(rawConnections)) return null;

  const prevNodesById = new Map(prevNodes.map((n) => [n.id, n]));
  const nodes: TopologyNode[] = [];
  for (const raw of doc.services) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
    if (nodes.some((n) => n.id === raw.id)) return null;
    const prev = prevNodesById.get(raw.id);
    const pos = isRecord(raw.position) ? raw.position : {};
    const label = raw.name != null ? String(raw.name) : raw.id;
    const data: TopologyNode['data'] = {
      ...prev?.data,
      label,
      serviceTitle: raw.title != null ? String(raw.title) : label,
      type: raw.type != null ? String(raw.type) : undefined,
      serviceId: raw.serviceId != null ? String(raw.serviceId) : undefined,
    };
    if (raw.version != null && raw.version !== '') {
      data.version = String(raw.version);
    } else {
      delete data.version;
    }
    nodes.push({
      ...prev,
      id: raw.id,
      position: {
        x: typeof pos.x === 'number' ? pos.x : (prev?.position.x ?? 0),
        y: typeof pos.y === 'number' ? pos.y : (prev?.position.y ?? 0),
      },
      data,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const prevEdgesById = new Map(prevEdges.map((e) => [e.id, e]));
  const edges: TopologyEdge[] = [];
  for (const raw of rawConnections) {
    if (!isRecord(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string') return null;
    // A connection to a service removed from the YAML cannot be drawn.
    if (!nodeIds.has(raw.from) || !nodeIds.has(raw.to)) continue;
    const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : `${raw.from}-${raw.to}`;
    if (edges.some((e) => e.id === id)) return null;
    const kind = edgeKindOf(raw.type);
    // Start from the existing edge, then let the YAML own the edge type.
    const edge = {
      ...prevEdgesById.get(id),
      id,
      source: raw.from,
      target: raw.to,
    } as TopologyEdge & {
      label?: string;
    };
    const data: Record<string, unknown> = { ...edge.data };
    delete data.edgeType;
    delete data.type;
    delete edge.label;
    if (kind) {
      data.edgeType = EDGE_TYPE_SPELLING[kind];
      edge.label = EDGE_TYPE_SPELLING[kind];
    }
    edge.data = data;
    edges.push(edge);
  }

  return { nodes, edges };
}

type ViewMode = 'code' | 'visual' | 'split';

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
  deployment?: ServiceDeployment;
}

interface Infrastructure {
  _id: string;
  name: string;
  type: string;
  status?: string;
  endpoint?: string;
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
  infrastructures?: Infrastructure[];
  selectedInfrastructure?: string | null;
  onInfrastructureChange?: (id: string | null) => void;
  onValidate?: () => void;
  onHelpClick?: () => void;
  /** Callback invoked when the user confirms clearing the canvas. */
  onClearCanvas?: () => void;
  /** Focus mode hides the page chrome and infrastructure row to enlarge the canvas. */
  focusMode?: boolean;
  onFocusModeChange?: (focusMode: boolean) => void;
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
  infrastructures = [],
  selectedInfrastructure = null,
  onInfrastructureChange,
  onValidate,
  onHelpClick,
  onClearCanvas,
  focusMode = false,
  onFocusModeChange,
}: TopologyEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const isUpdatingFromCanvas = useRef(false);

  // Sync nodes/edges changes to YAML. View-only changes (React Flow measuring
  // nodes, selection) leave the topology untouched, so they must not
  // regenerate the YAML — in split view that would overwrite the user's
  // in-progress text (comments, formatting, cursor) right after a YAML edit
  // re-renders the canvas.
  const handleNodesChangeWithYamlSync = useCallback(
    (newNodes: object[], meta?: TopologyChangeMeta) => {
      onNodesChange(newNodes);
      if (meta?.viewOnly) return;
      isUpdatingFromCanvas.current = true;
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
    (newEdges: object[], meta?: TopologyChangeMeta) => {
      onEdgesChange(newEdges);
      if (meta?.viewOnly) return;
      isUpdatingFromCanvas.current = true;
      const newYaml = nodesToYaml(nodes as TopologyNode[], newEdges as TopologyEdge[]);
      onYamlChange(newYaml);
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingFromCanvas.current = false;
      }, 100);
    },
    [onEdgesChange, onYamlChange, nodes]
  );

  // Combined nodes+edges update (task 5.3 Auto-wire): regenerating YAML in
  // one pass keeps the view consistent — two sequential single-channel
  // updates would each compose YAML with the other channel's stale prop.
  const handleTopologyChangeWithYamlSync = useCallback(
    (newNodes: object[], newEdges: object[]) => {
      isUpdatingFromCanvas.current = true;
      onNodesChange(newNodes);
      onEdgesChange(newEdges);
      const newYaml = nodesToYaml(newNodes as TopologyNode[], newEdges as TopologyEdge[]);
      onYamlChange(newYaml);
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingFromCanvas.current = false;
      }, 100);
    },
    [onNodesChange, onEdgesChange, onYamlChange]
  );

  // Every node/edge seen so far, by id. YAML is parsed on each keystroke, so a
  // transient state that still parses (an id half-retyped, a service block cut
  // to be pasted elsewhere) drops nodes/edges; when the id comes back, its
  // YAML-invisible data (deployment config overrides, edge styling) is
  // restored from here instead of being lost for good.
  const seenNodesById = useRef(new Map<string, TopologyNode>());
  const seenEdgesById = useRef(new Map<string, TopologyEdge>());

  // Sync YAML edits from the code view back to the canvas (split mode shows
  // both at once, so a renamed node must update its visual label).
  const handleYamlChangeWithCanvasSync = useCallback(
    (newYaml: string) => {
      onYamlChange(newYaml);
      for (const node of nodes as TopologyNode[]) seenNodesById.current.set(node.id, node);
      for (const edge of edges as TopologyEdge[]) seenEdgesById.current.set(edge.id, edge);
      // The seen maps are only used to look up prior data by id; the result
      // still contains exactly the services/connections the YAML lists.
      const topology = yamlToTopology(
        newYaml,
        [...seenNodesById.current.values()],
        [...seenEdgesById.current.values()]
      );
      if (!topology) return;
      onNodesChange(topology.nodes);
      onEdgesChange(topology.edges);
    },
    [onYamlChange, onNodesChange, onEdgesChange, nodes, edges]
  );

  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleReset = useCallback(() => {
    // Reset to empty topology
    seenNodesById.current.clear();
    seenEdgesById.current.clear();
    onYamlChange('');
    onNodesChange([]);
    onEdgesChange([]);
  }, [onYamlChange, onNodesChange, onEdgesChange]);

  const handleResetConfirm = useCallback(() => {
    handleReset();
    onClearCanvas?.();
    setResetDialogOpen(false);
  }, [handleReset, onClearCanvas]);

  return (
    <div className="flex flex-col h-full">
      {/* Infrastructure Selector and Help Section */}
      <div className={cn('border-b px-4 py-3 bg-background space-y-3', focusMode && 'hidden')}>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-xs">
            <label className="text-sm font-medium text-foreground block mb-1">
              Target Infrastructure *
            </label>
            <Select
              value={selectedInfrastructure || 'none'}
              onValueChange={(value: string) => {
                onInfrastructureChange?.(value === 'none' ? null : value);
              }}
            >
              <SelectTrigger
                className={cn(selectedInfrastructure ? '' : 'border-orange-500 bg-orange-50/50')}
              >
                <SelectValue placeholder="Select infrastructure..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {infrastructures.map((infra) => (
                  <SelectItem key={infra._id} value={infra._id}>
                    <div className="flex items-center gap-2">
                      <span>{infra.name}</span>
                      <span className="text-xs text-muted-foreground">({infra.type})</span>
                      {infra.status === 'active' && (
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={onHelpClick}
              title="Learn how to build and deploy scenarios"
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              Help
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 bg-muted/30">
        <div className="flex flex-wrap items-center gap-2">
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
            <Badge
              variant="outline"
              className="text-yellow-700 border-yellow-700 dark:text-yellow-400 dark:border-yellow-400"
            >
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onFocusModeChange && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFocusModeChange(!focusMode)}
              title={
                focusMode
                  ? 'Show the scenario header and infrastructure selector'
                  : 'Hide the scenario header and infrastructure selector to enlarge the canvas'
              }
            >
              {focusMode ? (
                <Minimize2 className="h-4 w-4 mr-1" />
              ) : (
                <Maximize2 className="h-4 w-4 mr-1" />
              )}
              {focusMode ? 'Show header' : 'Hide header'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onValidate}
            title="Validate the topology configuration"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Validate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetDialogOpen(true)}
            disabled={isSaving}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Clear canvas
          </Button>
          <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear canvas</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all services and connections from the topology. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-red-700"
                >
                  Clear canvas
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
            <YamlEditor value={yamlProp} onChange={handleYamlChangeWithCanvasSync} />
          </div>
        )}

        {viewMode === 'visual' && (
          <div className="h-full">
            <TopologyCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChangeWithYamlSync}
              onEdgesChange={handleEdgesChangeWithYamlSync}
              onTopologyChange={handleTopologyChangeWithYamlSync}
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
                <YamlEditor value={yamlProp} onChange={handleYamlChangeWithCanvasSync} />
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
                onTopologyChange={handleTopologyChangeWithYamlSync}
                services={services}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
