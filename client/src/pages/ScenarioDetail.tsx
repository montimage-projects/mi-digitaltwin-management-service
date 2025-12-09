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
  ExternalLink,
  Settings2,
  Shield,
  CheckCircle2,
  Rocket,
  Terminal,
  Globe,
  Activity,
  Cpu,
  HardDrive,
  Network,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { scenariosApi, servicesApi, infrastructuresApi, CreateScenarioData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { TopologyEditor } from '@/components/topology/TopologyEditor';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { ExecutionPanel } from '@/components/execution/ExecutionPanel';
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
  const [executionTabs, setExecutionTabs] = useState<{
    maestroUrl: string | null;
    serviceUrls: {
      id: string;
      name: string;
      title: string;
      type: string;
      serviceId: string;
      url: string;
      interfaceType: 'terminal' | 'web';
    }[];
  }>({ maestroUrl: null, serviceUrls: [] });
  const [deploymentProgress, setDeploymentProgress] = useState(0);
  const [deploymentComplete, setDeploymentComplete] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

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

  // Handle execution start - set up tabs for MAESTRO and services
  const handleExecutionStart = useCallback(
    (maestroUrl: string) => {
      // Validate topology before proceeding
      const validationResult = validateTopology(selectedInfrastructure, nodes, edges);
      if (!validationResult.isValid) {
        const errorMsg = getValidationErrorMessage(validationResult);
        toast.error(errorMsg || 'Configuration is not valid for deployment');
        return;
      }

      // Generate service URLs based on nodes in the topology
      // Each service gets its own URL (you may need to adjust this based on your infrastructure)
      const serviceUrls = (
        nodes as Array<{
          id: string;
          data: {
            label: string;
            serviceId?: string;
            serviceTitle?: string;
            type?: string;
            uiType?: 'web' | 'terminal' | 'both';
          };
        }>
      )
        .filter((node) => node.data?.serviceId)
        .map((node) => {
          // Determine interface type based on service's uiType
          let interfaceType: 'terminal' | 'web' = 'web';
          if (node.data.uiType === 'terminal') {
            interfaceType = 'terminal';
          } else if (node.data.uiType === 'both') {
            // For 'both', default to web for now (could add UI toggle later)
            interfaceType = 'web';
          }

          return {
            id: node.id,
            name: node.data.label,
            title: node.data.serviceTitle || node.data.label,
            type: node.data.type || 'server',
            serviceId: node.data.serviceId!,
            // URL pattern - adjust based on your actual service URL structure
            url: `${maestroUrl.replace('/orchestrator', '')}/service/${node.data.serviceId}`,
            interfaceType,
          };
        });

      setExecutionTabs({
        maestroUrl,
        serviceUrls,
      });
      setActiveTab('maestro');

      // Start deployment simulation
      setIsDeploying(true);
      setDeploymentProgress(0);
      setDeploymentComplete(false);
    },
    [nodes, selectedInfrastructure]
  );

  // Simulate deployment progress over 10 seconds
  useEffect(() => {
    if (!isDeploying) return;

    const interval = setInterval(() => {
      setDeploymentProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDeploying(false);
          setDeploymentComplete(true);
          return 100;
        }
        return prev + 10; // 10% every second = 100% in 10 seconds
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDeploying]);

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
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
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
                {executionTabs.maestroUrl && (
                  <TabsTrigger value="maestro" className="gap-2 data-[state=active]:bg-muted">
                    <Play className="h-4 w-4 text-green-500" />
                    MAESTRO
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 hover:bg-destructive/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExecutionTabs({ maestroUrl: null, serviceUrls: [] });
                        setActiveTab('editor');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </TabsTrigger>
                )}
                {deploymentComplete &&
                  executionTabs.serviceUrls.map((service) => (
                    <TabsTrigger
                      key={service.id}
                      value={`service-${service.id}`}
                      className="gap-2 data-[state=active]:bg-muted"
                    >
                      <Shield className="h-4 w-4 text-blue-500" />
                      {service.name}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExecutionTabs((prev) => ({
                            ...prev,
                            serviceUrls: prev.serviceUrls.filter((s) => s.id !== service.id),
                          }));
                          if (activeTab === `service-${service.id}`) {
                            setActiveTab('editor');
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TabsTrigger>
                  ))}
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

              {/* MAESTRO Tab */}
              {executionTabs.maestroUrl && (
                <TabsContent value="maestro" className="h-full m-0 data-[state=inactive]:hidden">
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">MAESTRO Orchestrator</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(executionTabs.maestroUrl!, '_blank')}
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Deployment Progress / Completion View */}
                    {!deploymentComplete ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-8">
                        <div className="w-full max-w-md space-y-6">
                          <div className="text-center space-y-2">
                            <Rocket className="h-16 w-16 mx-auto text-blue-500 animate-bounce" />
                            <h3 className="text-xl font-semibold">Deploying Services</h3>
                            <p className="text-muted-foreground">
                              Please wait while we deploy your services to the infrastructure...
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Progress value={deploymentProgress} className="h-3" />
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Progress</span>
                              <span>{deploymentProgress}%</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {executionTabs.serviceUrls.map((service, index) => {
                              const serviceProgress = Math.min(
                                100,
                                deploymentProgress -
                                  index * (100 / executionTabs.serviceUrls.length)
                              );
                              const isComplete =
                                serviceProgress >= 100 / executionTabs.serviceUrls.length;
                              const isDeployingService = serviceProgress > 0 && !isComplete;

                              return (
                                <div
                                  key={service.id}
                                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                                >
                                  {isComplete ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  ) : isDeployingService ? (
                                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                                  )}
                                  <span
                                    className={
                                      isComplete ? 'text-foreground' : 'text-muted-foreground'
                                    }
                                  >
                                    {service.name}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8">
                        <div className="w-full max-w-md space-y-6 text-center">
                          <div className="space-y-2">
                            <CheckCircle2 className="h-20 w-20 mx-auto text-green-500" />
                            <h3 className="text-2xl font-semibold text-green-600">
                              Deployment Complete!
                            </h3>
                            <p className="text-muted-foreground">
                              All {executionTabs.serviceUrls.length} services have been successfully
                              deployed to the infrastructure.
                            </p>
                          </div>

                          <div className="space-y-3 pt-4">
                            <p className="text-sm text-muted-foreground">
                              Click below to access individual service interfaces:
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {executionTabs.serviceUrls.map((service) => (
                                <Button
                                  key={service.id}
                                  variant="outline"
                                  onClick={() => setActiveTab(`service-${service.id}`)}
                                  className="gap-2"
                                >
                                  <Shield className="h-4 w-4 text-blue-500" />
                                  {service.name}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4">
                            <Button
                              size="lg"
                              onClick={() => {
                                // Open the first service tab
                                if (executionTabs.serviceUrls.length > 0) {
                                  setActiveTab(`service-${executionTabs.serviceUrls[0].id}`);
                                }
                              }}
                              className="gap-2"
                            >
                              <Play className="h-4 w-4" />
                              Open Service Interfaces
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {/* Service Tabs - Only shown after deployment completes */}
              {deploymentComplete &&
                executionTabs.serviceUrls.map((service) => (
                  <TabsContent
                    key={service.id}
                    value={`service-${service.id}`}
                    className="h-full m-0 data-[state=inactive]:hidden"
                  >
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
                        <div className="flex items-center gap-2">
                          {service.interfaceType === 'terminal' ? (
                            <Terminal className="h-4 w-4 text-green-500" />
                          ) : (
                            <Globe className="h-4 w-4 text-blue-500" />
                          )}
                          <span className="font-medium text-sm">{service.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {service.interfaceType === 'terminal' ? 'Terminal' : 'Web UI'}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(service.url, '_blank')}
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Simulated Interface */}
                      {service.interfaceType === 'terminal' ? (
                        /* Terminal Interface Simulation */
                        <div className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 overflow-auto">
                          <div className="space-y-1">
                            <div className="text-gray-500">
                              $ # {service.title} - Terminal Interface
                            </div>
                            <div className="text-gray-500">$ # Service ID: {service.serviceId}</div>
                            <div className="text-gray-500">$ # Type: {service.type}</div>
                            <div className="mt-4"></div>
                            <div className="text-cyan-400">
                              ╔══════════════════════════════════════════════════════════════╗
                            </div>
                            <div className="text-cyan-400">║ {service.name.padEnd(60)} ║</div>
                            <div className="text-cyan-400">
                              ║ {service.title.substring(0, 60).padEnd(60)} ║
                            </div>
                            <div className="text-cyan-400">
                              ╚══════════════════════════════════════════════════════════════╝
                            </div>
                            <div className="mt-4"></div>
                            <div>$ ./start-service.sh --mode=production</div>
                            <div className="text-yellow-400">
                              [INFO] Initializing {service.name}...
                            </div>
                            <div className="text-yellow-400">
                              [INFO] Loading configuration from /etc/{service.name.toLowerCase()}
                              /config.yaml
                            </div>
                            <div className="text-yellow-400">
                              [INFO] Connecting to infrastructure...
                            </div>
                            <div className="text-green-400">
                              [SUCCESS] Connected to Montimage DGX Spark
                            </div>
                            <div className="text-yellow-400">
                              [INFO] Starting monitoring threads...
                            </div>
                            <div className="text-green-400">
                              [SUCCESS] Service {service.name} is now running
                            </div>
                            <div className="mt-4"></div>
                            <div>$ status</div>
                            <div className="text-white">
                              Service Status: <span className="text-green-400">● RUNNING</span>
                            </div>
                            <div className="text-white">Uptime: 00:05:32</div>
                            <div className="text-white">CPU Usage: 12.4%</div>
                            <div className="text-white">Memory: 256MB / 1024MB</div>
                            <div className="text-white">Active Connections: 3</div>
                            <div className="mt-4"></div>
                            <div>$ tail -f /var/log/{service.name.toLowerCase()}/service.log</div>
                            <div className="text-gray-400">
                              [{new Date().toISOString()}] Processing request from 192.168.1.100
                            </div>
                            <div className="text-gray-400">
                              [{new Date().toISOString()}] Analysis complete - 0 threats detected
                            </div>
                            <div className="text-gray-400">
                              [{new Date().toISOString()}] Monitoring network interface eth0
                            </div>
                            <div className="text-gray-400">
                              [{new Date().toISOString()}] Health check passed
                            </div>
                            <div className="mt-2 flex items-center">
                              <span className="text-green-400">$</span>
                              <span className="ml-2 w-2 h-4 bg-green-400 animate-pulse"></span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Web Interface Simulation */
                        <div className="flex-1 bg-background overflow-auto">
                          <div className="p-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-bold">{service.title}</h2>
                                <p className="text-muted-foreground">
                                  Service Dashboard - {service.name}
                                </p>
                              </div>
                              <Badge className="bg-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Online
                              </Badge>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-4 gap-4">
                              <div className="rounded-lg border p-4">
                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                  <Activity className="h-4 w-4" />
                                  Status
                                </div>
                                <div className="mt-2 text-2xl font-bold text-green-500">Active</div>
                              </div>
                              <div className="rounded-lg border p-4">
                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                  <Cpu className="h-4 w-4" />
                                  CPU Usage
                                </div>
                                <div className="mt-2 text-2xl font-bold">23%</div>
                              </div>
                              <div className="rounded-lg border p-4">
                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                  <HardDrive className="h-4 w-4" />
                                  Memory
                                </div>
                                <div className="mt-2 text-2xl font-bold">512 MB</div>
                              </div>
                              <div className="rounded-lg border p-4">
                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                  <Network className="h-4 w-4" />
                                  Connections
                                </div>
                                <div className="mt-2 text-2xl font-bold">7</div>
                              </div>
                            </div>

                            {/* Service Info */}
                            <div className="rounded-lg border p-4">
                              <h3 className="font-semibold mb-4">Service Information</h3>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Service ID:</span>
                                  <span className="ml-2 font-mono">{service.serviceId}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Type:</span>
                                  <span className="ml-2 capitalize">{service.type}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Started:</span>
                                  <span className="ml-2">{new Date().toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Version:</span>
                                  <span className="ml-2">1.0.0</span>
                                </div>
                              </div>
                            </div>

                            {/* Recent Activity */}
                            <div className="rounded-lg border p-4">
                              <h3 className="font-semibold mb-4">Recent Activity</h3>
                              <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-muted-foreground">
                                    <Clock className="h-3 w-3 inline mr-1" />2 min ago
                                  </span>
                                  <span>Health check passed successfully</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <Activity className="h-4 w-4 text-blue-500" />
                                  <span className="text-muted-foreground">
                                    <Clock className="h-3 w-3 inline mr-1" />5 min ago
                                  </span>
                                  <span>Processing network traffic analysis</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                                  <span className="text-muted-foreground">
                                    <Clock className="h-3 w-3 inline mr-1" />8 min ago
                                  </span>
                                  <span>Configuration reloaded</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-muted-foreground">
                                    <Clock className="h-3 w-3 inline mr-1" />
                                    10 min ago
                                  </span>
                                  <span>Service started on infrastructure</span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button variant="outline">
                                <Activity className="h-4 w-4 mr-2" />
                                View Logs
                              </Button>
                              <Button variant="outline">
                                <Settings2 className="h-4 w-4 mr-2" />
                                Configure
                              </Button>
                              <Button variant="outline" className="text-red-500 hover:text-red-600">
                                <AlertCircle className="h-4 w-4 mr-2" />
                                Stop Service
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}
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
