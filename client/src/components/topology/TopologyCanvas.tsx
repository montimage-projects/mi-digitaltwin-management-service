import { useCallback, useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
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
import { Server, Database, Network, Shield, Monitor, Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
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
function ServiceNode({ data }: { data: { label: string; type?: string } }) {
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
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-stone-400 min-w-[120px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-teal-500" />
      <div className="flex items-center gap-2">
        <div className="text-stone-600">{getIcon()}</div>
        <div className="text-sm font-medium">{data.label}</div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  // Group services by category and filter by search
  const groupedServices = useMemo(() => {
    const filtered = services.filter((s) => {
      const query = searchQuery.toLowerCase();
      return (
        s.shortName.toLowerCase().includes(query) ||
        s.title.toLowerCase().includes(query) ||
        s.categoryId?.name?.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      );
    });

    const groups: Record<string, ServiceOption[]> = {};
    filtered.forEach((service) => {
      const category = service.categoryId?.name || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(service);
    });

    return groups;
  }, [services, searchQuery]);

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

  // Add a new node from a service
  const addNode = useCallback(
    (service: ServiceOption) => {
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'service',
        position: screenToFlowPosition({ x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 }),
        data: {
          label: service.shortName,
          type: service.categoryId?.name?.toLowerCase() || 'server',
          serviceId: service._id,
          serviceTitle: service.title,
        },
      };
      setNodes((nds) => {
        const newNodes = [...nds, newNode];
        onNodesChangeProp(newNodes);
        return newNodes;
      });
      setAddServiceOpen(false);
      setSearchQuery('');
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
      // Defer the callback to avoid state update during render
      setTimeout(() => {
        setNodes((nds) => {
          onNodesChangeProp(nds);
          return nds;
        });
      }, 0);
    },
    [onNodesChange, setNodes, onNodesChangeProp]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      setTimeout(() => {
        setEdges((eds) => {
          onEdgesChangeProp(eds);
          return eds;
        });
      }, 0);
    },
    [onEdgesChange, setEdges, onEdgesChangeProp]
  );

  return (
    <div className="h-full w-full relative">
      {/* Toolbar */}
      {!readOnly && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded-lg border p-1 shadow-sm">
          <Popover open={addServiceOpen} onOpenChange={setAddServiceOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8" disabled={services.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add Service
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search services..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <ScrollArea className="h-72">
                {services.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No services available
                  </div>
                ) : Object.keys(groupedServices).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No services match your search
                  </div>
                ) : (
                  <div className="p-2">
                    {Object.entries(groupedServices).map(([category, categoryServices]) => (
                      <div key={category} className="mb-3">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {category}
                        </div>
                        {categoryServices.map((service) => (
                          <button
                            key={service._id}
                            onClick={() => addNode(service)}
                            className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors"
                          >
                            <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{service.shortName}</div>
                              <div className="text-xs text-muted-foreground truncate">{service.title}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
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
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          style={{
            backgroundColor: '#f8fafc',
          }}
        />
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
