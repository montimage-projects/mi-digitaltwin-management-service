import { useCallback, useMemo, useEffect, useState } from 'react';
import {
  ReactFlowProvider,
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeTypes,
  Handle,
  Position,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Network, Shield, Monitor, Server, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ServicePalette } from './ServicePalette';

interface ServiceVersion {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
  releasedAt: string;
}

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
  repositoryTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  currentVersion?: string;
  versions?: ServiceVersion[];
  uiType?: string;
}

interface TopologyCanvasProps {
  nodes: object[];
  edges: object[];
  onNodesChange: (nodes: object[]) => void;
  onEdgesChange: (edges: object[]) => void;
  services?: ServiceOption[];
  readOnly?: boolean;
}

// Custom node component
function ServiceNode({ data }: { data: { label: string; type?: string; version?: string } }) {
  const getIcon = () => {
    switch (data.type) {
      case 'database':
        return <Database className="h-5 w-5" />;
      case 'network':
        return <Network className="h-5 w-5" />;
      case 'security':
        return <Shield className="h-5 w-5" />;
      case 'monitor':
        return <Monitor className="h-5 w-5" />;
      default:
        return <Server className="h-5 w-5" />;
    }
  };

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-card border-2 border-border min-w-[120px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-teal-500" />
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-card-foreground">{data.label}</div>
          {data.version && (
            <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1 py-0.5 inline-block mt-0.5">
              v{data.version}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-teal-500" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  service: ServiceNode,
};

function TopologyCanvasInner({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  services = [],
  readOnly = false,
}: TopologyCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  // Convert to React Flow format
  const flowNodes = useMemo(
    () =>
      (initialNodes as Node[]).map((node) => ({
        ...node,
        type: 'service',
      })),
    [initialNodes]
  );

  const flowEdges = useMemo(() => initialEdges as Edge[], [initialEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync with prop changes
  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  // Add a new node from a service with optional version
  const addNode = useCallback(
    (service: ServiceOption, _isToolbox?: boolean, version?: string) => {
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'service',
        position: screenToFlowPosition({
          x: 200 + Math.random() * 200,
          y: 100 + Math.random() * 200,
        }),
        data: {
          label: service.shortName,
          type: service.categoryId?.name?.toLowerCase() || 'server',
          serviceId: service._id,
          serviceTitle: service.title,
          uiType: service.uiType || 'web',
          repositoryTable: service.repositoryTable || 'OTHER_SERVICES',
          // Only include version if it's explicitly selected and not the current/latest version
          ...(version && version !== service.currentVersion && { version }),
        },
      };
      setNodes((nds) => {
        const newNodes = [...nds, newNode];
        onNodesChangeProp(newNodes);
        return newNodes;
      });
    },
    [setNodes, onNodesChangeProp, screenToFlowPosition]
  );

  // Delete selected nodes
  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodes.length === 0) return;
    setNodes((nds) => {
      const newNodes = nds.filter((n) => !selectedNodes.includes(n.id));
      onNodesChangeProp(newNodes);
      return newNodes;
    });
    setEdges((eds) => {
      const newEdges = eds.filter(
        (e) => !selectedNodes.includes(e.source) && !selectedNodes.includes(e.target)
      );
      onEdgesChangeProp(newEdges);
      return newEdges;
    });
    setSelectedNodes([]);
  }, [selectedNodes, setNodes, setEdges, onNodesChangeProp, onEdgesChangeProp]);

  // Track selection
  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[] }) => {
    setSelectedNodes(selectedNodesList.map((n) => n.id));
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      setEdges((eds) => {
        const newEdges = addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#64748b' },
          },
          eds
        );
        onEdgesChangeProp(newEdges);
        return newEdges;
      });
    },
    [readOnly, setEdges, onEdgesChangeProp]
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Notify parent after React Flow has processed changes internally.
      // Using requestAnimationFrame avoids the race-condition risk of setTimeout
      // while still deferring past the current render cycle.
      requestAnimationFrame(() => {
        setNodes((nds) => {
          onNodesChangeProp(nds);
          return nds;
        });
      });
    },
    [onNodesChange, setNodes, onNodesChangeProp]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      requestAnimationFrame(() => {
        setEdges((eds) => {
          onEdgesChangeProp(eds);
          return eds;
        });
      });
    },
    [onEdgesChange, setEdges, onEdgesChangeProp]
  );

  return (
    <div className="h-full w-full relative">
      {/* Toolbar */}
      {!readOnly && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded-lg border p-1 shadow-sm">
          <ServicePalette
            services={services}
            readOnly={readOnly}
            onAddToolboxService={(service, version) => addNode(service, true, version)}
            onAddInfraService={(service, version) => addNode(service, false, version)}
          />

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={deleteSelectedNodes}
            disabled={selectedNodes.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {nodes.length} nodes, {edges.length} edges
          </span>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        selectNodesOnDrag={!readOnly}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls
          showInteractive={false}
          position="top-right"
          className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted [&>button>svg]:!fill-current"
        />
        <MiniMap nodeStrokeWidth={3} zoomable pannable className="!bg-muted" />
      </ReactFlow>
    </div>
  );
}

// Wrap with ReactFlowProvider for proper context
export function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
