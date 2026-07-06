import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Play,
  Server,
  FileDown,
  PanelRightClose,
  PanelRightOpen,
  X,
  Settings2,
  Rocket,
} from 'lucide-react';
import {
  scenariosApi,
  servicesApi,
  infrastructuresApi,
  CreateScenarioData,
  type DeployedServiceResult,
  type ExecuteResult,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TopologyEditor } from '@/components/topology/TopologyEditor';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { ExecutionPanel } from '@/components/execution/ExecutionPanel';
import { ExecutionConsole } from '@/components/execution/ExecutionConsole';
import { ScenarioEditorGuidelinesModal } from '@/components/scenarios/ScenarioEditorGuidelinesModal';
import { useWorkspaceStore } from '@/store/workspace-store';
import { exportScenarioToPdf } from '@/lib/pdf-export';
import { validateTopology, getValidationErrorMessage } from '@/lib/topology-validation';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

export function ScenarioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { openTab, updateTab, tabs } = useWorkspaceStore();

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.get(id!),
    enabled: !!id,
  });

  // Fetch infrastructures for the selector
  const { data: infrastructuresData = [] } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  // Fetch services for topology canvas (get all services with high limit)
  const { data: servicesData } = useQuery({
    queryKey: ['services', 'all'],
    queryFn: () => servicesApi.list({ limit: 1000 }),
  });
  const services = servicesData?.services || [];

  // Local state for topology editing
  const [yaml, setYaml] = useState('');
  const [nodes, setNodes] = useState<object[]>([]);
  const [edges, setEdges] = useState<object[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedInfrastructure, setSelectedInfrastructure] = useState<string | null>(null);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [activeExecution, setActiveExecution] = useState<{
    executionId: string;
    namespace: string;
    services: DeployedServiceResult[];
  } | null>(null);

  // Check if guidelines should auto-open on first load
  useEffect(() => {
    const hideGuidelines = sessionStorage.getItem('hideScenarioGuidelinesModal');
    if (!hideGuidelines && scenario) {
      setGuidelinesOpen(true);
    }
  }, [scenario]);

  // Check if deployment should be triggered from query param
  useEffect(() => {
    const deployParam = searchParams.get('deploy');
    const executeParam = searchParams.get('execute'); // backward compatibility
    if (
      (deployParam === 'true' || executeParam === 'true') &&
      !executionPanelOpen &&
      selectedInfrastructure
    ) {
      setExecutionPanelOpen(true);
    }
  }, [searchParams, executionPanelOpen, selectedInfrastructure]);

  // Handle deployment start - open the live execution console for the new run.
  const handleExecutionStart = useCallback((result: ExecuteResult) => {
    setActiveExecution({
      executionId: result.executionId,
      namespace: result.namespace,
      services: result.services,
    });
    setActiveTab('execution');
  }, []);

  const handleCloseExecution = useCallback(() => {
    setActiveExecution(null);
    setActiveTab('editor');
  }, []);

  // Add scenario to workspace tabs when loaded
  useEffect(() => {
    if (scenario && id) {
      const projectId =
        scenario.projectId && typeof scenario.projectId === 'object'
          ? scenario.projectId._id
          : undefined;
      openTab({
        type: 'scenario',
        scenarioId: id,
        title: scenario.title,
        projectId,
      });
    }
  }, [scenario, id, openTab]);

  // Update tab dirty state
  useEffect(() => {
    if (id && isDirty !== undefined) {
      const currentTab = tabs.find((t) => t.scenarioId === id);
      if (currentTab && currentTab.isDirty !== isDirty) {
        updateTab(currentTab.id, { isDirty });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, id]);

  // Initialize local state from scenario
  useEffect(() => {
    if (scenario) {
      setYaml(scenario.topology?.yaml || '');
      setNodes(scenario.topology?.nodes || []);
      setEdges(scenario.topology?.edges || []);
      setIsDirty(false);
      // Set infrastructure from scenario
      const infra = scenario.infrastructureId;
      setSelectedInfrastructure(
        infra && typeof infra === 'object' ? infra._id : typeof infra === 'string' ? infra : null
      );
    }
  }, [scenario]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateScenarioData>) => scenariosApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      toast.success('Topology saved successfully');
      setIsDirty(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to save topology: ${error.message}`);
    },
  });

  // Handle infrastructure change - persist to database
  const handleInfrastructureChange = useCallback(
    (infrastructureId: string | null) => {
      setSelectedInfrastructure(infrastructureId);
      updateMutation.mutate({
        infrastructureId: infrastructureId || undefined,
      });
    },
    [updateMutation]
  );

  const handleYamlChange = useCallback((newYaml: string) => {
    setYaml(newYaml);
    setIsDirty(true);
  }, []);

  const handleNodesChange = useCallback((newNodes: object[]) => {
    setNodes(newNodes);
    setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((newEdges: object[]) => {
    setEdges(newEdges);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      topology: { yaml, nodes, edges },
    });
  }, [updateMutation, yaml, nodes, edges]);

  const handleValidate = useCallback(() => {
    const result = validateTopology(selectedInfrastructure, nodes, edges);
    if (result.isValid) {
      toast.success('Configuration is valid');
    } else {
      const errorMsg = getValidationErrorMessage(result);
      toast.error(errorMsg || 'Configuration is not valid');
    }
  }, [selectedInfrastructure, nodes, edges]);

  const handleTabClick = useCallback(
    (tab: { scenarioId: string }) => {
      if (tab.scenarioId !== id) {
        navigate(`/scenarios/${tab.scenarioId}`);
      }
    },
    [id, navigate]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Scenario not found</p>
        <Button variant="link" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const project =
    scenario.projectId && typeof scenario.projectId === 'object' ? scenario.projectId : null;
  const infrastructure =
    scenario.infrastructureId && typeof scenario.infrastructureId === 'object'
      ? scenario.infrastructureId
      : null;

  return (
    <div className="space-y-4 h-full">
      {/* Workspace Tabs */}
      <WorkspaceTabs onTabClick={handleTabClick} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(project ? `/projects/${project._id}` : '/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{scenario.title}</h1>
            {project && (
              <p className="text-muted-foreground">
                {project.shortName} - {project.title}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              exportScenarioToPdf({
                scenario,
                project: project
                  ? {
                      shortName: project.shortName,
                      title: project.title,
                      sector: project.sector,
                      leader: 'N/A',
                      involvedPartners: [],
                    }
                  : undefined,
              });
              toast.success('PDF report generated');
            }}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => navigate(`/scenarios/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Details
          </Button>
          <Button
            disabled={!selectedInfrastructure}
            onClick={() => setExecutionPanelOpen(true)}
            title="Deploy scenario to target infrastructure"
          >
            <Play className="mr-2 h-4 w-4" />
            Deploy
          </Button>
        </div>
      </div>

      {/* Execution Panel */}
      <ExecutionPanel
        scenarioId={id!}
        scenarioTitle={scenario.title}
        infrastructureName={
          selectedInfrastructure && typeof selectedInfrastructure === 'string'
            ? infrastructuresData.find((i) => i._id === selectedInfrastructure)?.name
            : infrastructure?.name
        }
        executions={scenario.executions}
        open={executionPanelOpen}
        onOpenChange={setExecutionPanelOpen}
        onExecutionStart={handleExecutionStart}
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Main Content - Tabbed Interface */}
        <div className={`flex-1 min-w-0 transition-all duration-300`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            {/* Tab List */}
            <div className="rounded-t-lg border border-b-0 bg-background px-2">
              <TabsList className="h-10 bg-transparent">
                <TabsTrigger value="editor" className="gap-2 data-[state=active]:bg-muted">
                  <Settings2 className="h-4 w-4" />
                  Editor
                </TabsTrigger>
                {activeExecution && (
                  <TabsTrigger value="execution" className="gap-2 data-[state=active]:bg-muted">
                    <Rocket className="h-4 w-4 text-primary" />
                    Execution
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Close execution tab"
                      className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/20 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseExecution();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCloseExecution();
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Tab Content */}
            <div className="flex-1 rounded-b-lg border bg-background overflow-hidden">
              {/* Editor Tab */}
              <TabsContent value="editor" className="h-full m-0 data-[state=inactive]:hidden">
                <TopologyEditor
                  yaml={yaml}
                  nodes={nodes}
                  edges={edges}
                  onYamlChange={handleYamlChange}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onSave={handleSave}
                  services={services}
                  isSaving={updateMutation.isPending}
                  isDirty={isDirty}
                  infrastructures={infrastructuresData}
                  selectedInfrastructure={selectedInfrastructure}
                  onInfrastructureChange={handleInfrastructureChange}
                  onValidate={handleValidate}
                  onHelpClick={() => setGuidelinesOpen(true)}
                />
              </TabsContent>

              {/* Execution Tab - live Kubernetes deploy progress + logs */}
              {activeExecution && (
                <TabsContent value="execution" className="h-full m-0 data-[state=inactive]:hidden">
                  <ExecutionConsole
                    scenarioId={id!}
                    executionId={activeExecution.executionId}
                    namespace={activeExecution.namespace}
                    services={activeExecution.services}
                    onClose={handleCloseExecution}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>

        {/* Toggle Right Panel Button */}
        <div className="relative flex items-start pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            title={rightPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
          >
            {rightPanelCollapsed ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Right Sidebar - Collapsible */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            rightPanelCollapsed ? 'w-0 opacity-0' : 'w-72 opacity-100'
          }`}
        >
          <div className="space-y-4 overflow-y-auto h-full w-72">
            {/* Infrastructure */}
            <div className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                Infrastructure
              </h3>
              {infrastructure ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{infrastructure.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <Badge variant="outline">{infrastructure.type}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          infrastructure.status === 'active'
                            ? 'bg-green-500'
                            : infrastructure.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-500'
                        }`}
                      />
                      <span className="capitalize">{infrastructure.status}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No infrastructure assigned</p>
              )}
            </div>

            {/* Description */}
            {scenario.description && (
              <div className="rounded-lg border bg-background p-4">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-sm text-muted-foreground">{scenario.description}</p>
              </div>
            )}

            {/* Executions */}
            <div className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold mb-3">Execution History</h3>
              {scenario.executions.length > 0 ? (
                <div className="space-y-2">
                  {scenario.executions
                    .slice(-5)
                    .reverse()
                    .map((execution) => (
                      <div
                        key={execution._id}
                        className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${statusColors[execution.status]}`}
                          />
                          <span className="capitalize">{execution.status}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {new Date(execution.executedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No executions yet</p>
              )}
            </div>

            {/* Timestamps */}
            <div className="rounded-lg border bg-background p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(scenario.createdAt).toLocaleDateString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{new Date(scenario.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Guidelines Modal */}
      <ScenarioEditorGuidelinesModal open={guidelinesOpen} onOpenChange={setGuidelinesOpen} />
    </div>
  );
}
