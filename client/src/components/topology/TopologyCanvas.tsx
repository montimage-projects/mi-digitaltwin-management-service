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
import {
  Database,
  Network,
  Shield,
  Monitor,
  Server,
  Trash2,
  Swords,
  Target,
  Zap,
  Link2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ServicePalette } from './ServicePalette';
import { NodeConfigPanel } from './NodeConfigPanel';
import type { NodeConfig } from '@/lib/node-config';
import {
  applyTopologyDecorations,
  planTopologyEdge,
  type BadgedRole,
  type RoleEdge,
  type RoleNode,
} from '@/lib/topology-roles';
import type { ServiceDeployment } from '@/lib/services';

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
  deployment?: ServiceDeployment;
}

interface TopologyCanvasProps {
  nodes: object[];
  edges: object[];
  onNodesChange: (nodes: object[]) => void;
  onEdgesChange: (edges: object[]) => void;
  services?: ServiceOption[];
  readOnly?: boolean;
}

interface ServiceNodeData {
  label: string;
  type?: string;
  version?: string;
  /** Scenario role resolved from `Service.deployment.role` (task 3.1). */
  role?: BadgedRole;
  attachMode?: 'standalone' | 'sidecar';
  /** Host node id when this sidecar is docked inside its host. */
  attachedTo?: string;
  /** Display label of the host node this sidecar is attached to. */
  hostLabel?: string;
}

/** Badge colors per scenario role — task 3.1 (attack/target/monitor/reaction). */
const ROLE_BADGE_STYLES: Record<BadgedRole, string> = {
  attack: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400',
  target: 'border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  monitor: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  reaction: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

// Custom node component
function ServiceNode({ data }: { data: ServiceNodeData }) {
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
      case 'attack':
        return <Swords className="h-5 w-5" />;
      case 'target':
        return <Target className="h-5 w-5" />;
      case 'reaction':
        return <Zap className="h-5 w-5" />;
      default:
        return <Server className="h-5 w-5" />;
    }
  };

  const isSidecar = data.attachMode === 'sidecar';
  const attached = isSidecar && Boolean(data.attachedTo);

  return (
    <div
      className={cn(
        'px-4 py-2 shadow-md rounded-md bg-card border-2 border-border min-w-[120px] h-full',
        isSidecar && 'border-dashed border-teal-500/70',
        attached && 'min-w-[100px] px-3 py-1.5 shadow-sm'
      )}
      title={attached ? `Sidecar attached to ${data.hostLabel ?? 'host'}` : undefined}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-teal-500" />
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-medium text-card-foreground">
            {attached && <Link2 className="h-3 w-3 text-teal-500 shrink-0" aria-hidden />}
            <span className="truncate">{data.label}</span>
          </div>
          {data.version && (
            <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1 py-0.5 inline-block mt-0.5">
              v{data.version}
            </div>
          )}
          {data.role && (
            <Badge
              variant="outline"
              data-testid={`role-badge-${data.role}`}
              className={cn(
                'mt-0.5 h-4 px-1.5 py-0 text-[10px] leading-none font-semibold uppercase tracking-wide',
                ROLE_BADGE_STYLES[data.role]
              )}
            >
              {data.role}
            </Badge>
          )}
          {isSidecar && !attached && (
            <div className="text-[10px] italic text-muted-foreground mt-0.5">
              sidecar — needs a monitor edge
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
  /** Node id whose config panel is open — task 3.3. */
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);

  const servicesById = useMemo(
    () => new Map<string, ServiceOption>(services.map((s) => [s._id, s])),
    [services]
  );

  // Resolve roles onto nodes and dock sidecars under their monitor-edge host.
  const decorated = useMemo(
    () =>
      applyTopologyDecorations(
        initialNodes as RoleNode[],
        initialEdges as RoleEdge[],
        servicesById
      ),
    [initialNodes, initialEdges, servicesById]
  );

  // Convert to React Flow format
  const flowNodes = useMemo(
    () =>
      decorated.nodes.map((node) => ({
        ...node,
        type: 'service',
      })) as Node[],
    [decorated]
  );

  const flowEdges = useMemo(() => decorated.edges as Edge[], [decorated]);

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
          // Persist the deployment spec's scenario role/attach mode so badges
          // and sidecar docking still resolve if the catalog entry is gone.
          ...(service.deployment?.role && { role: service.deployment.role }),
          ...(service.deployment?.attachMode && { attachMode: service.deployment.attachMode }),
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

  // Delete selected nodes — deleting a host also removes the sidecar nodes
  // docked inside it (parentId), transitively.
  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodes.length === 0) return;
    const removed = new Set(selectedNodes);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of nodes) {
        const parentId = (n as Node).parentId;
        if (!removed.has(n.id) && parentId && removed.has(parentId)) {
          removed.add(n.id);
          grew = true;
        }
      }
    }
    setNodes((nds) => {
      const newNodes = nds.filter((n) => !removed.has(n.id));
      onNodesChangeProp(newNodes);
      return newNodes;
    });
    setEdges((eds) => {
      const newEdges = eds.filter((e) => !removed.has(e.source) && !removed.has(e.target));
      onEdgesChangeProp(newEdges);
      return newEdges;
    });
    setSelectedNodes([]);
  }, [selectedNodes, nodes, setNodes, setEdges, onNodesChangeProp, onEdgesChangeProp]);

  // Track selection
  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[] }) => {
    setSelectedNodes(selectedNodesList.map((n) => n.id));
  }, []);

  // The node open in the config panel, plus its catalog deployment spec for
  // defaults (env/args/configFiles — task 3.3).
  const configNode = useMemo(
    () => nodes.find((n) => n.id === configNodeId) ?? null,
    [nodes, configNodeId]
  );
  const configDeployment = configNode?.data?.serviceId
    ? servicesById.get(String(configNode.data.serviceId))?.deployment
    : undefined;

  // Persist an edited `data.config` document onto the node and propagate —
  // `undefined` removes the key entirely. (task 3.3)
  const handleConfigChange = useCallback(
    (nodeId: string, config: NodeConfig | undefined) => {
      const newNodes = nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const data = { ...n.data };
        if (config === undefined) {
          delete data.config;
        } else {
          data.config = config;
        }
        return { ...n, data };
      });
      setNodes(newNodes);
      onNodesChangeProp(newNodes);
    },
    [nodes, setNodes, onNodesChangeProp]
  );

  // Connect two nodes: the scenario role pair decides the persisted edge type
  // (task 3.2); an illegal pair is rejected with a visible message.
  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      const plan = planTopologyEdge(params, nodes as RoleNode[], servicesById);
      if (!plan.ok) {
        toast.error(plan.error);
        return;
      }
      setEdges((eds) => {
        const newEdges = addEdge(
          {
            ...params,
            animated: true,
            ...(plan.edgeType && {
              label: plan.edgeType,
              data: { edgeType: plan.edgeType },
            }),
          },
          eds
        );
        onEdgesChangeProp(newEdges);
        return newEdges;
      });
    },
    [readOnly, setEdges, onEdgesChangeProp, nodes, servicesById]
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
            onClick={() => setConfigNodeId(selectedNodes[0])}
            disabled={selectedNodes.length !== 1}
            title="Edit this node's env, args and config-file overrides"
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Configure
          </Button>

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
        onNodeDoubleClick={(_event, node) => {
          if (!readOnly) setConfigNodeId(node.id);
        }}
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

      <NodeConfigPanel
        node={configNode}
        deployment={configDeployment}
        open={configNode !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfigNodeId(null);
        }}
        onConfigChange={handleConfigChange}
      />
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
