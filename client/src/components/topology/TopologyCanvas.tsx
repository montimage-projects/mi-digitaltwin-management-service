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
import { Server, Database, Network, Shield, Monitor, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  // Separate state for each dropdown
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [infraOpen, setInfraOpen] = useState(false);
  const [infraSearch, setInfraSearch] = useState('');

  // Selected service and version for version selection
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Filter services by repository table
  const toolboxServices = useMemo(() => {
    return services.filter((s) => s.repositoryTable === 'INTACT_TOOLBOX');
  }, [services]);

  const infraServices = useMemo(() => {
    return services.filter((s) => s.repositoryTable === 'OTHER_SERVICES');
  }, [services]);

  // Helper function to group and filter services
  const getGroupedServices = (serviceList: ServiceOption[], searchQuery: string) => {
    const filtered = serviceList.filter((s) => {
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
  };

  // Grouped services for each dropdown
  const groupedToolboxServices = useMemo(() => {
    return getGroupedServices(toolboxServices, toolboxSearch);
  }, [toolboxServices, toolboxSearch]);

  const groupedInfraServices = useMemo(() => {
    return getGroupedServices(infraServices, infraSearch);
  }, [infraServices, infraSearch]);

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
    (service: ServiceOption, isToolbox: boolean, version?: string) => {
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
      if (isToolbox) {
        setToolboxOpen(false);
        setToolboxSearch('');
      } else {
        setInfraOpen(false);
        setInfraSearch('');
      }
      // Reset selected service and version
      setSelectedService(null);
      setSelectedVersion('');
    },
    [setNodes, onNodesChangeProp, screenToFlowPosition]
  );

  // Handle service selection (opens version selector if multiple versions available)
  const handleServiceSelect = useCallback(
    (service: ServiceOption, isToolbox: boolean) => {
      if (service.versions && service.versions.length > 1) {
        // Service has multiple versions - show version selector
        setSelectedService(service);
        setSelectedVersion(service.currentVersion || service.versions[0]?.version || '');
      } else {
        // Single version or no versions - add directly
        addNode(service, isToolbox);
      }
    },
    [addNode]
  );

  // Confirm adding service with selected version
  const confirmAddService = useCallback(
    (isToolbox: boolean) => {
      if (selectedService) {
        addNode(selectedService, isToolbox, selectedVersion);
      }
    },
    [selectedService, selectedVersion, addNode]
  );

  // Cancel version selection
  const cancelVersionSelection = useCallback(() => {
    setSelectedService(null);
    setSelectedVersion('');
  }, []);

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
          {/* Add Security Tool (Toolbox) */}
          <Popover open={toolboxOpen} onOpenChange={setToolboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={toolboxServices.length === 0}
              >
                <Shield className="h-4 w-4 mr-1" />
                Add Security Tool
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              {selectedService && selectedService.repositoryTable === 'INTACT_TOOLBOX' ? (
                // Version selection view
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{selectedService.shortName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedService.title}
                      </div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Select Version
                    </label>
                    <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedService.versions?.map((v) => (
                          <SelectItem key={v.version} value={v.version}>
                            {v.version}
                            {v.version === selectedService.currentVersion && ' (latest)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={cancelVersionSelection}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => confirmAddService(true)}>
                      Add Service
                    </Button>
                  </div>
                </div>
              ) : (
                // Service list view
                <>
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search security tools..."
                        value={toolboxSearch}
                        onChange={(e) => setToolboxSearch(e.target.value)}
                        className="pl-8 h-9"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-72">
                    {toolboxServices.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No security tools available
                      </div>
                    ) : Object.keys(groupedToolboxServices).length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No security tools match your search
                      </div>
                    ) : (
                      <div className="p-2">
                        {Object.entries(groupedToolboxServices).map(
                          ([category, categoryServices]) => (
                            <div key={category} className="mb-3">
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {category}
                              </div>
                              {categoryServices.map((service) => (
                                <button
                                  key={service._id}
                                  onClick={() => handleServiceSelect(service, true)}
                                  className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors"
                                >
                                  <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">
                                      {service.shortName}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {service.title}
                                      {service.versions && service.versions.length > 1 && (
                                        <span className="ml-1 text-muted-foreground/60">
                                          ({service.versions.length} versions)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
            </PopoverContent>
          </Popover>

          {/* Add Infrastructure Service (Critical Infrastructure) */}
          <Popover open={infraOpen} onOpenChange={setInfraOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={infraServices.length === 0}
              >
                <Server className="h-4 w-4 mr-1" />
                Add Target
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              {selectedService && selectedService.repositoryTable === 'OTHER_SERVICES' ? (
                // Version selection view
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{selectedService.shortName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedService.title}
                      </div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Select Version
                    </label>
                    <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedService.versions?.map((v) => (
                          <SelectItem key={v.version} value={v.version}>
                            {v.version}
                            {v.version === selectedService.currentVersion && ' (latest)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={cancelVersionSelection}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => confirmAddService(false)}>
                      Add Service
                    </Button>
                  </div>
                </div>
              ) : (
                // Service list view
                <>
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search infrastructure services..."
                        value={infraSearch}
                        onChange={(e) => setInfraSearch(e.target.value)}
                        className="pl-8 h-9"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-72">
                    {infraServices.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No infrastructure services available
                      </div>
                    ) : Object.keys(groupedInfraServices).length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No infrastructure services match your search
                      </div>
                    ) : (
                      <div className="p-2">
                        {Object.entries(groupedInfraServices).map(
                          ([category, categoryServices]) => (
                            <div key={category} className="mb-3">
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {category}
                              </div>
                              {categoryServices.map((service) => (
                                <button
                                  key={service._id}
                                  onClick={() => handleServiceSelect(service, false)}
                                  className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors"
                                >
                                  <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">
                                      {service.shortName}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {service.title}
                                      {service.versions && service.versions.length > 1 && (
                                        <span className="ml-1 text-muted-foreground/60">
                                          ({service.versions.length} versions)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
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
